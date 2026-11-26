import {scopedGeneration} from './lib/chat-scope.js';
import fs from 'node:fs';
import path from 'node:path';
import * as webpush from 'web-push';
export const pushTransport={send:webpush.sendNotification};
import {Hono} from 'hono';
import {db,now} from './db.js';
import {env} from './env.js';
import {newId} from './lib/ids.js';
import {hub} from './lib/hub.js';
import type {AuthVars} from './lib/auth.js';

db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,endpoint TEXT NOT NULL UNIQUE,
 p256dh TEXT NOT NULL,auth TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,previews INTEGER NOT NULL DEFAULT 1,replies INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS notification_events(
 id TEXT PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 bot_id TEXT REFERENCES bots(id) ON DELETE CASCADE,kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,reply INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,read_at INTEGER);
 CREATE TABLE IF NOT EXISTS push_deliveries(
 event_id TEXT NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',PRIMARY KEY(event_id,subscription_id));`);
if(!(db.prepare('PRAGMA table_info(notification_events)').all() as any[]).some(c=>c.name==='generation'))db.exec('ALTER TABLE notification_events ADD COLUMN generation INTEGER');
let keys:{publicKey:string;privateKey:string}|undefined;
export function pushKeys(){
 if(keys)return keys;
 const filename=process.env.PUSH_VAPID_FILE??path.join(path.dirname(env.dbPath),'push-vapid.json');
 if(env.dbPath===':memory:')return keys=webpush.generateVAPIDKeys();
 try{keys=JSON.parse(fs.readFileSync(filename,'utf8'));}catch(e:any){
  if(e.code!=='ENOENT')throw e;
  const generated=webpush.generateVAPIDKeys();
  try{fs.writeFileSync(filename,JSON.stringify(generated),{mode:0o600,flag:'wx'});keys=generated;}catch(e:any){if(e.code!=='EEXIST')throw e;keys=JSON.parse(fs.readFileSync(filename,'utf8'));}
 }
 if(!keys?.publicKey||!keys.privateKey)throw Error('Invalid push configuration.');return keys;
}
export function validateSubscription(value:any){
 const u=new URL(String(value?.endpoint??''));
 const hosts=['fcm.googleapis.com','push.services.mozilla.com','push.apple.com','notify.windows.com'];
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'||u.href.length>4096||!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw Error('Unsupported push service. Use Safari, Chrome, Edge or Firefox.');
 const p256dh=String(value?.keys?.p256dh??''),auth=String(value?.keys?.auth??'');
 if(!/^[\w-]{86,88}$/.test(p256dh)||Buffer.from(p256dh,'base64url').length!==65||!/^[\w-]{22,24}$/.test(auth)||Buffer.from(auth,'base64url').length!==16)throw Error('Invalid browser subscription.');
 return {endpoint:u.href,p256dh,auth};
}
/** Leave room for Web Push metadata; split at grapheme boundaries, including Arabic/emoji. */
export function pushMessageBody(text:string){
 if(Buffer.byteLength(text,'utf8')<=2800)return text;
 let body='';for(const {segment} of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)){
  if(Buffer.byteLength(body+segment,'utf8')>2797)break;body+=segment;
 }return body+'…';
}
export function hasNotificationText(text:string){return text.replace(/[\p{P}\p{S}\s\u200e\u200f]/gu,'').length>=2;}
export function publishBotNotification(userId:string,botId:string|null,text:string,eventKey:string,kind='update',reply=false){
 if(!hasNotificationText(text))return null;
 const bot=botId?db.prepare('SELECT user_id,name,generation FROM bots WHERE id=?').get(botId) as any:null;
 if(botId&&bot?.user_id!==userId)return null;
 if(reply&&!db.prepare('SELECT 1 FROM push_subscriptions WHERE user_id=? AND enabled=1 AND replies=1').get(userId))return null;
 const id=newId('ntf'),title=kind==='test'?'Badr test notification':kind==='attention'?`${bot?.name??'Badr'} needs your attention`:`${bot?.name??'Badr'}`;
 const result=db.prepare('INSERT OR IGNORE INTO notification_events(id,event_key,user_id,bot_id,kind,title,body,reply,created_at,generation) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,eventKey,userId,botId,kind,title,text.slice(0,20000),reply?1:0,now(),botId?scopedGeneration(botId,bot.generation):null);
 if(!result.changes)return null;
 db.prepare(`INSERT OR IGNORE INTO push_deliveries(event_id,subscription_id) SELECT ?,id FROM push_subscriptions WHERE user_id=? AND enabled=1 ${reply?'AND replies=1':''}`).run(id,userId);
 hub.emit(userId,{type:'notifications'});void dispatchPush().catch(()=>{});return id;
}
let dispatching=false;
export async function dispatchPush(){
 if(dispatching)return;dispatching=true;
 try{
 const items=db.prepare(`SELECT d.event_id,d.subscription_id,d.attempts,e.bot_id,e.generation,e.title,e.body,e.kind,s.endpoint,s.p256dh,s.auth,s.previews FROM push_deliveries d JOIN notification_events e ON e.id=d.event_id JOIN push_subscriptions s ON s.id=d.subscription_id WHERE d.status='pending' AND d.attempts<4 AND d.next_at<=? AND e.created_at>? AND s.enabled=1 LIMIT 12`).all(now(),now()-24*3600_000) as any[];
 for(let i=0;i<items.length;i+=3)await Promise.all(items.slice(i,i+3).map(async item=>{
  const payload=JSON.stringify({id:item.event_id,botId:item.bot_id,generation:item.generation,title:item.title,body:item.previews||item.kind==='test'?pushMessageBody(item.body):'Open Fino to read this update.',url:`/?${item.bot_id?'bot='+encodeURIComponent(item.bot_id)+'&'+(item.generation?'chat='+item.generation+'&':''):''}notification=${encodeURIComponent(item.event_id)}`,tag:'fino-'+item.event_id});
  try{await pushTransport.send({endpoint:item.endpoint,keys:{p256dh:item.p256dh,auth:item.auth}},payload,{TTL:24*3600,urgency:item.kind==='attention'?'high':'normal',timeout:10000,vapidDetails:{subject:env.appUrl,...pushKeys()}});db.prepare("UPDATE push_deliveries SET status='sent',attempts=attempts+1 WHERE event_id=? AND subscription_id=?").run(item.event_id,item.subscription_id);}
  catch(e:any){if(e.statusCode===404||e.statusCode===410)db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(item.subscription_id);else db.prepare("UPDATE push_deliveries SET attempts=attempts+1,next_at=?,status=? WHERE event_id=? AND subscription_id=?").run(now()+30_000*2**item.attempts,item.attempts>=3?'failed':'pending',item.event_id,item.subscription_id);}
 }));
 }finally{dispatching=false;}
}
export function initPushWorker(){const timer=setInterval(()=>{void dispatchPush().catch(()=>{});},15000);timer.unref();void dispatchPush().catch(()=>{});}

export const pushApi=new Hono<AuthVars>();
pushApi.get('/config',c=>c.json({publicKey:pushKeys().publicKey}));
pushApi.get('/notifications',c=>{const uid=c.get('user').id;return c.json({items:db.prepare('SELECT id,bot_id AS botId,generation,kind,title,body,created_at AS createdAt,read_at AS readAt FROM notification_events WHERE user_id=? ORDER BY created_at DESC LIMIT 30').all(uid),unread:(db.prepare('SELECT COUNT(*) n FROM notification_events WHERE user_id=? AND read_at IS NULL').get(uid) as any).n});});
pushApi.post('/notifications/read',async c=>{const {id}=await c.req.json().catch(()=>({}));if(id)db.prepare('UPDATE notification_events SET read_at=? WHERE user_id=? AND id=?').run(now(),c.get('user').id,String(id));else db.prepare('UPDATE notification_events SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now(),c.get('user').id);hub.emit(c.get('user').id,{type:'notifications'});return c.json({ok:true});});
pushApi.post('/device',async c=>{
 try{const body=await c.req.json(),s=validateSubscription(body.subscription),uid=c.get('user').id;const existing=db.prepare('SELECT id,user_id FROM push_subscriptions WHERE endpoint=?').get(s.endpoint) as any;
 if(existing&&existing.user_id!==uid)return c.json({error:'This browser subscription belongs to another account. Disable it and try again.'},409);
 if(!existing&&(db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=?').get(uid) as any).n>=10)return c.json({error:'Device limit reached. Disable an unused browser first.'},400);
 if(existing)db.prepare('UPDATE push_subscriptions SET p256dh=?,auth=?,enabled=1 WHERE id=?').run(s.p256dh,s.auth,existing.id);else db.prepare('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at,previews) VALUES (?,?,?,?,?,?,1)').run(newId('sub'),uid,s.endpoint,s.p256dh,s.auth,now());
 return c.json({enabled:true});}catch(e){return c.json({error:(e as Error).message},400);}
});
pushApi.post('/device/status',async c=>{const {endpoint}=await c.req.json();const device=db.prepare('SELECT enabled,previews,replies FROM push_subscriptions WHERE endpoint=? AND user_id=?').get(String(endpoint??''),c.get('user').id);return c.json({device:device??null});});
pushApi.patch('/device',async c=>{const p=await c.req.json();if(typeof p.previews!=='boolean'||typeof p.replies!=='boolean')return c.json({error:'Invalid notification preferences.'},400);db.prepare('UPDATE push_subscriptions SET previews=?,replies=? WHERE endpoint=? AND user_id=?').run(p.previews?1:0,p.replies?1:0,String(p.endpoint??''),c.get('user').id);return c.json({ok:true});});
pushApi.delete('/device',async c=>{const {endpoint}=await c.req.json();db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').run(String(endpoint??''),c.get('user').id);return c.json({ok:true});});
pushApi.post('/test',async c=>{const {endpoint}=await c.req.json();const uid=c.get('user').id;const sub=db.prepare('SELECT id FROM push_subscriptions WHERE endpoint=? AND user_id=? AND enabled=1').get(String(endpoint??''),uid) as any;if(!sub)return c.json({error:'Enable notifications on this device first.'},400);
 const id=newId('ntf');db.prepare('INSERT INTO notification_events(id,event_key,user_id,kind,title,body,created_at) VALUES (?,?,?,?,?,?,?)').run(id,'test:'+id,uid,'test','Badr test notification','Notifications are connected to Fino.',now());db.prepare('INSERT INTO push_deliveries(event_id,subscription_id) VALUES (?,?)').run(id,sub.id);hub.emit(uid,{type:'notifications'});void dispatchPush().catch(()=>{});return c.json({queued:true});});
