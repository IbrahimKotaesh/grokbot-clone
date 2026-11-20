import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {createHash} from 'node:crypto';
import {db,now} from './db.js';
import {accessAllowed,accessConfigured,verifyAccessCode,saveAccessCode,grantAccess} from './lib/access-code.js';
import {requireUser,type AuthVars} from './lib/auth.js';
export const accessApi=new Hono<AuthVars>();
accessApi.use('*',bodyLimit({maxSize:1024,onError:c=>c.json({error:'Request too large.'},413)}));
db.exec('CREATE TABLE IF NOT EXISTS access_failures(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL)');
accessApi.get('/status',c=>c.json({required:accessConfigured(),unlocked:accessAllowed(c.req.header('cookie'))}));
accessApi.post('/unlock',async c=>{
 if(!accessConfigured())return c.json({error:'Access code is not configured.'},409);
 // Only the loopback-bound app is behind Caddy, which supplies this header.
 const ip=c.req.header('x-forwarded-for')?.split(',')[0]?.trim()??'local';const key=createHash('sha256').update(ip).digest('hex');
 db.prepare('DELETE FROM access_failures WHERE expires_at<=?').run(now());
 const failures=(k:string)=>(db.prepare('SELECT count FROM access_failures WHERE key=?').get(k) as any)?.count??0;
 if(failures(key)>=5||failures('global')>=30){c.header('Retry-After','900');return c.json({error:'Too many attempts. Try again in 15 minutes.'},429);}
 // Reserve before expensive hashing, including concurrent attempts.
 for(const k of [key,'global'])db.prepare('INSERT INTO access_failures(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(k,now()+900_000);
 const body=await c.req.json().catch(()=>({}));const code=typeof body.code==='string'?body.code:'';
 if(!/^\d{6,12}$/.test(code)||!await verifyAccessCode(code))return c.json({error:'Incorrect access code.'},401);
 db.prepare('DELETE FROM access_failures WHERE key=?').run(key);grantAccess(c);return c.json({ok:true});
});
accessApi.post('/setup',requireUser,async c=>{
 const owner=db.prepare('SELECT id FROM users ORDER BY created_at ASC,id ASC LIMIT 1').get() as any;
 if(owner?.id!==c.get('user').id)return c.json({error:'Only the workspace owner can set the access code.'},403);
 const body=await c.req.json().catch(()=>({}));
 if(accessConfigured()&&(typeof body.currentCode!=='string'||!await verifyAccessCode(body.currentCode)))return c.json({error:'Enter your current code first.'},403);
 try{await saveAccessCode(String(body.code??''));grantAccess(c);return c.json({ok:true});}catch{return c.json({error:'Choose 6–12 digits without a simple repeated pattern.'},400);}
});
