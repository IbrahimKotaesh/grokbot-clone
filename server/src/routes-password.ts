import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {db,now} from './db.js';
import {env} from './env.js';
import {createSession,type AuthVars} from './lib/auth.js';
import {token,sha256} from './lib/ids.js';

// Email + password accounts, next to Google and Apple sign-in.
// A password account starts unverified: nobody has proven they own that inbox yet. When the real owner
// later signs in with Google or Apple (which do prove it), the unverified password and its sessions are
// removed, so nobody can set up an account under someone else's email and keep a way in.
const scrypt=promisify(scryptCallback) as (password:string,salt:string,keylen:number)=>Promise<Buffer>;
db.exec(`CREATE TABLE IF NOT EXISTS user_passwords(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,salt TEXT NOT NULL,hash TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS password_failures(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pending_signups(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,name TEXT,salt TEXT NOT NULL,hash TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
// With an email service set up, a new password account only exists once its owner opens the link we email:
// until then nobody can hold an account under someone else's address. Without one (local testing), sign-up
// works at once and the email-proof rule in emailProven() below is the safety net.
const mailReady=()=>!!(process.env.RESEND_API_KEY&&process.env.MAIL_FROM);

const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const allowed=(email:string)=>!env.allowedEmails.length||env.allowedEmails.includes(email.toLowerCase());
const passwordProblem=(p:unknown)=>typeof p!=='string'||p.length<8?'Use at least 8 characters for your password.':p.length>200?'That password is too long.':null;

async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return {salt,hash:(await scrypt(password,salt,64)).toString('hex')};}
async function setPassword(userId:string,password:string,verified:boolean){
 const {salt,hash}=await hashPassword(password);
 db.prepare('INSERT INTO user_passwords(user_id,salt,hash,verified,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET salt=excluded.salt,hash=excluded.hash,verified=excluded.verified,updated_at=excluded.updated_at').run(userId,salt,hash,verified?1:0,now());
}
// Compared against even when the email is unknown, so timing doesn't reveal which emails have accounts.
const dummy={salt:'0'.repeat(32),hash:'0'.repeat(128)};

/** Call after Google or Apple proved the email: drops a password nobody verified, and the sessions it opened. */
export function emailProven(userId:string){
 const row=db.prepare('SELECT verified FROM user_passwords WHERE user_id=?').get(userId) as {verified:number}|undefined;
 if(!row||row.verified)return;
 db.prepare('DELETE FROM user_passwords WHERE user_id=?').run(userId);
 db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(userId);
}

function tooMany(keys:string[]){
 db.prepare('DELETE FROM password_failures WHERE expires_at<=?').run(now());
 return keys.some(k=>((db.prepare('SELECT count FROM password_failures WHERE key=?').get(k) as {count:number}|undefined)?.count??0)>=10);
}
function fail(keys:string[]){for(const k of keys)db.prepare('INSERT INTO password_failures(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(k,now()+15*60_000);}
const ipOf=(header:string|undefined)=>header?.split(',')[0]?.trim()||'local';

async function sendEmail(to:string,subject:string,html:string,logLine:string){
 // Sends through Resend when RESEND_API_KEY and MAIL_FROM are set; otherwise (local testing) the link goes to the server log.
 if(!mailReady()){console.log(`[auth] ${logLine}`);return true;}
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to,subject,html}),signal:AbortSignal.timeout(15_000)}).catch(()=>null);
 if(!r?.ok)console.warn('[auth] email failed with status',r?.status??'no answer');
 return !!r?.ok;
}
const sendResetEmail=(to:string,link:string)=>sendEmail(to,'Reset your Badr password',
 `<p>Someone asked to reset the password for your Badr account.</p><p><a href="${link}">Choose a new password</a> (this link works for one hour).</p><p>If it wasn't you, ignore this email.</p>`,`password reset link for ${to}: ${link}`);
const sendConfirmEmail=(to:string,link:string)=>sendEmail(to,'Confirm your email for Badr',
 `<p>Welcome to Badr! Confirm this is your email to finish creating your account.</p><p><a href="${link}">Confirm my email</a> (this link works for one day).</p><p>If you didn't sign up, ignore this email and no account will be made.</p>`,`sign-up confirmation link for ${to}: ${link}`);

export function passwordApi(findOrCreateUser:(email:string,name?:string)=>{id:string;isNew:boolean}){
 const app=new Hono<AuthVars>();
 app.use('*',bodyLimit({maxSize:4096,onError:c=>c.json({error:'Request too large.'},413)}));

 app.post('/signup',async c=>{
  const body=await c.req.json().catch(()=>({}));
  const email=String(body.email??'').trim().toLowerCase(),name=String(body.name??'').trim().slice(0,80);
  if(!EMAIL.test(email))return c.json({error:'Enter a valid email address.'},400);
  const problem=passwordProblem(body.password);if(problem)return c.json({error:problem},400);
  if(!allowed(email))return c.json({error:'This email is not allowed on this server.'},403);
  if(db.prepare('SELECT 1 FROM users WHERE lower(email)=?').get(email))return c.json({error:'There is already an account with this email. Sign in instead, or reset your password.',code:'exists'},409);
  if(mailReady()){
   // A few links per address and per network every 15 minutes, so nobody can flood someone's inbox.
   const keys=['signup:'+sha256(email),'signup-ip:'+sha256(ipOf(c.req.header('x-forwarded-for')))];
   if(tooMany(keys)){c.header('Retry-After','900');return c.json({error:'Too many sign-ups. Wait 15 minutes and try again.'},429);}
   fail(keys);
   const t=token(),{salt,hash}=await hashPassword(body.password);
   db.prepare('DELETE FROM pending_signups WHERE lower(email)=? OR expires_at<=?').run(email,now());
   db.prepare('INSERT INTO pending_signups(token_hash,email,name,salt,hash,expires_at) VALUES (?,?,?,?,?,?)').run(createHash('sha256').update(t).digest('hex'),email,name||null,salt,hash,now()+24*3600_000);
   if(!await sendConfirmEmail(email,`${env.appUrl}/?confirm=${t}`))return c.json({error:'We couldn’t send the confirmation email. Try again in a minute.'},502);
   return c.json({ok:true,confirm:true});
  }
  const {id}=findOrCreateUser(email,name||undefined);
  await setPassword(id,body.password,false);
  createSession(c,id);
  return c.json({ok:true});
 });

 app.post('/login',async c=>{
  const body=await c.req.json().catch(()=>({}));
  const email=String(body.email??'').trim().toLowerCase(),password=typeof body.password==='string'?body.password.slice(0,200):'';
  const keys=['ip:'+sha256(ipOf(c.req.header('x-forwarded-for'))),'email:'+sha256(email)];
  if(tooMany(keys)){c.header('Retry-After','900');return c.json({error:'Too many tries. Wait 15 minutes, or reset your password.'},429);}
  const row=db.prepare('SELECT p.user_id,p.salt,p.hash FROM user_passwords p JOIN users u ON u.id=p.user_id WHERE lower(u.email)=?').get(email) as {user_id:string;salt:string;hash:string}|undefined;
  const target=row??dummy;
  const ok=timingSafeEqual(await scrypt(password,target.salt,64),Buffer.from(target.hash,'hex'))&&!!row;
  if(!ok||!allowed(email)){
   fail(keys);
   const pending=!row&&db.prepare('SELECT salt,hash FROM pending_signups WHERE lower(email)=? AND expires_at>?').get(email,now()) as {salt:string;hash:string}|undefined;
   if(pending&&timingSafeEqual(await scrypt(password,pending.salt,64),Buffer.from(pending.hash,'hex')))return c.json({error:'Confirm your email first: open the link we sent you, then you’re in.',code:'confirm'},403);
   return c.json({error:'Email or password is incorrect.'},401);
  }
  createSession(c,row!.user_id);
  return c.json({ok:true});
 });

 // Opening the emailed link proves the inbox: the account is made (or, if they meanwhile signed in another way,
 // the password is added to it) and they are signed in.
 app.post('/confirm',async c=>{
  const body=await c.req.json().catch(()=>({}));
  const hash=createHash('sha256').update(String(body.token??'')).digest('hex');
  const p=db.prepare('SELECT * FROM pending_signups WHERE token_hash=? AND expires_at>?').get(hash,now()) as {email:string;name:string|null;salt:string;hash:string}|undefined;
  if(!p)return c.json({error:'This link has expired or was already used. Sign in, or create your account again.'},400);
  db.prepare('DELETE FROM pending_signups WHERE lower(email)=?').run(p.email);
  if(!allowed(p.email))return c.json({error:'This email is not allowed on this server.'},403);
  const {id}=findOrCreateUser(p.email,p.name??undefined);
  db.prepare('INSERT INTO user_passwords(user_id,salt,hash,verified,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET salt=excluded.salt,hash=excluded.hash,verified=1,updated_at=excluded.updated_at').run(id,p.salt,p.hash,now());
  createSession(c,id);
  return c.json({ok:true});
 });

 app.post('/forgot',async c=>{
  const body=await c.req.json().catch(()=>({}));
  const email=String(body.email??'').trim().toLowerCase();
  if(!EMAIL.test(email))return c.json({error:'Enter a valid email address.'},400);
  const key='forgot:'+sha256(email);
  if(tooMany([key]))return c.json({ok:true});
  fail([key]);
  const user=db.prepare('SELECT id FROM users WHERE lower(email)=?').get(email) as {id:string}|undefined;
  if(user&&allowed(email)){
   const t=token();
   db.prepare('DELETE FROM password_resets WHERE user_id=? OR expires_at<=?').run(user.id,now());
   db.prepare('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES (?,?,?)').run(createHash('sha256').update(t).digest('hex'),user.id,now()+3600_000);
   await sendResetEmail(email,`${env.appUrl}/?reset=${t}`);
  }
  // Same answer either way, so this can't be used to check who has an account.
  return c.json({ok:true});
 });

 app.post('/reset',async c=>{
  const body=await c.req.json().catch(()=>({}));
  const problem=passwordProblem(body.password);if(problem)return c.json({error:problem},400);
  const hash=createHash('sha256').update(String(body.token??'')).digest('hex');
  const row=db.prepare('SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>?').get(hash,now()) as {user_id:string}|undefined;
  if(!row)return c.json({error:'This reset link has expired. Ask for a new one.'},400);
  db.prepare('DELETE FROM password_resets WHERE user_id=?').run(row.user_id);
  // Opening the emailed link proves the inbox, so the password is now verified. Old sessions end.
  await setPassword(row.user_id,body.password,true);
  db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(row.user_id);
  createSession(c,row.user_id);
  return c.json({ok:true});
 });
 return app;
}
