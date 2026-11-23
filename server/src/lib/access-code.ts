import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHmac} from 'node:crypto';
import {promisify} from 'node:util';
import {getCookie,setCookie} from 'hono/cookie';
import type {Context,MiddlewareHandler} from 'hono';
import {env} from '../env.js';
const scrypt=promisify(scryptCallback);
const cookieName='fino_access';
const filename=()=>process.env.FINO_ACCESS_FILE??path.join(path.dirname(env.dbPath),'access-secret.json');
interface Secret{salt:string;hash:string;key:string}
export const accessConfigured=()=>!env.publicSignup&&(process.env.FINO_ACCESS_REQUIRED==='1'||fs.existsSync(filename()));
function secret():Secret{const v=JSON.parse(fs.readFileSync(filename(),'utf8'));if(!/^[a-f0-9]{32}$/.test(v.salt)||!/^[a-f0-9]{128}$/.test(v.hash)||!/^[a-f0-9]{64}$/.test(v.key))throw Error('Invalid access configuration');return v;}
export function accessAllowed(header:string|undefined){
 if(!accessConfigured())return true;
 try{const value=header?.split(/;\s*/).find(p=>p.startsWith(cookieName+'='))?.slice(cookieName.length+1)??'';const [expires,nonce,signature,...extra]=value.split('.');
 if(extra.length||!/^\d+$/.test(expires)||Number(expires)<=Date.now()||!nonce||!/^[a-f0-9]{64}$/.test(signature??''))return false;
 const expected=createHmac('sha256',secret().key).update(`${expires}.${nonce}`).digest();return timingSafeEqual(expected,Buffer.from(signature,'hex'));
 }catch{return false;}
}
export async function verifyAccessCode(code:string){
 if(!accessConfigured())return false;
 const s=secret(),derived=await scrypt(code,s.salt,64) as Buffer;return timingSafeEqual(derived,Buffer.from(s.hash,'hex'));
}
export async function saveAccessCode(code:string){
 if(!/^\d{6,12}$/.test(code))throw Error('Choose 6–12 digits.');
 if(/^(\d)\1+$/.test(code)||code==='123456'||code==='654321')throw Error('Choose a less predictable code.');
 const salt=randomBytes(16).toString('hex'),hash=(await scrypt(code,salt,64) as Buffer).toString('hex');
 const target=filename();fs.mkdirSync(path.dirname(target),{recursive:true});const temp=target+'.'+randomBytes(8).toString('hex')+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify({salt,hash,key:randomBytes(32).toString('hex')}),{mode:0o600,flag:'wx'});fs.renameSync(temp,target);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
export function grantAccess(c:Context){
 const payload=`${Date.now()+7*86400_000}.${randomBytes(16).toString('hex')}`;
 setCookie(c,cookieName,payload+'.'+createHmac('sha256',secret().key).update(payload).digest('hex'),{httpOnly:true,secure:env.appUrl.startsWith('https://'),sameSite:'Lax',path:'/',maxAge:7*86400});
}
export const accessGate:MiddlewareHandler=async(c,next)=>{
 // The system OAuth browser has a separate cookie jar from the native client.
 // Allow only the handshake; session exchange and every data route stay gated.
 if(['/api/access/status','/api/access/unlock','/api/access/setup','/api/auth/google/start','/api/auth/google/callback','/api/apps/callback'].includes(c.req.path)||c.req.path==='/api/health'||accessAllowed(c.req.header('cookie')))return next();
 return c.json({error:'Enter your access code.',code:'access_locked'},401);
};
