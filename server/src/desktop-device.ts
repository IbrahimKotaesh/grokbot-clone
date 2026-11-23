import { allowedOrigin } from './lib/origin.js';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import {WebSocket,WebSocketServer} from 'ws';
import {userFromCookieHeader} from './lib/auth.js';
import {env} from './env.js';
export type DesktopTarget={id:string;mode:'browser'|'mac'};
type Device=DesktopTarget&{userId:string;name:string;expires:number;socket:WebSocket};
const devices=new Map<string,Device>(),pending=new Map<string,{deviceId:string;resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
const scope=new AsyncLocalStorage<DesktopTarget|null>();
export const localDesktopTarget=()=>scope.getStore()??undefined;
export const withDesktopTarget=<T>(target:DesktopTarget|null,run:()=>T)=>scope.run(target,run);
export const DESKTOP_TOOLS=new Set(['computer_screenshot','computer_click','computer_type','computer_key','computer_scroll','computer_drag','open_browser']);
export function activeDesktop(userId:string){const d=devices.get(userId);return d&&d.expires>Date.now()&&d.socket.readyState===WebSocket.OPEN?{id:d.id,mode:d.mode,name:d.name,expires:d.expires}:null;}
export const desktopForTrigger=(userId:string,type:string)=>type==='user'?activeDesktop(userId):null;
export function resolveDesktopTarget(userId:string,environment?:unknown):DesktopTarget|null{
 if(environment==='server')return null;
 if(environment!==undefined&&!['browser','mac'].includes(String(environment)))throw Error('Invalid execution environment.');
 // Not connected (or connected to the other place): the task still runs, on the cloud computer.
 const target=activeDesktop(userId);
 if(environment!==undefined&&(!target||target.mode!==environment))return null;
 return target;
}
export function validateDesktopAction(name:string,a:any){
 if(!DESKTOP_TOOLS.has(name)||!a||typeof a!=='object'||Array.isArray(a))throw Error('Unsupported local computer action.');
 const coordinate=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=8192;
 if(name==='computer_click'&&(!coordinate(a.x)||!coordinate(a.y)||a.button&&!['left','right','middle'].includes(a.button)))throw Error('Invalid click.');
 if(name==='computer_drag'&&!['start_x','start_y','end_x','end_y'].every(k=>coordinate(a[k])))throw Error('Invalid drag.');
 if(name==='computer_type'&&(typeof a.text!=='string'||a.text.length>10000))throw Error('Invalid typed text.');
 if(name==='computer_key'&&(typeof a.keys!=='string'||a.keys.length>80))throw Error('Invalid key.');
 if(name==='computer_scroll'&&(!['up','down','left','right'].includes(a.direction)||a.amount!==undefined&&(!Number.isFinite(a.amount)||a.amount<0||a.amount>10)))throw Error('Invalid scroll.');
 if(name==='open_browser'){let url:URL;try{url=new URL(a.url);}catch{throw Error('Invalid browser URL.');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>4096)throw Error('Only ordinary HTTP/HTTPS browser URLs are supported.');}
}
export function requestDesktop(userId:string,target:DesktopTarget,name:string,args:any):Promise<any>{
 validateDesktopAction(name,args);const device=devices.get(userId);
 if(!device||device.id!==target.id||!activeDesktop(userId))return Promise.reject(Error('Local control disconnected or expired. Enable it in the Fino Mac app; no cloud-computer fallback was used.'));
 const id=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Local computer action timed out.'));},90_000);pending.set(id,{deviceId:device.id,resolve,reject,timer});device.socket.send(JSON.stringify({id,action:name,args,deadline:Date.now()+90_000}));});
}
export function desktopImage(result:any){
 if(!result||typeof result.image!=='string'||result.image.length>4*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(result.image)||!Number.isInteger(result.width)||result.width<1||result.width>8192||!Number.isInteger(result.height)||result.height<1||result.height>8192)throw Error('Invalid local screenshot.');
 const image=Buffer.from(result.image,'base64');if(image.length>3*1024*1024||!image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid local PNG screenshot.');return image;
}
export async function runDesktopTool(userId:string,target:DesktopTarget,name:string,args:any){const result=await requestDesktop(userId,target,name,args);const bytes=desktopImage(result);return {output:[{type:'input_text',text:`Local ${target.mode==='browser'?'Fino browser':'Mac'} screen, ${result.width}x${result.height}.`},{type:'input_image',image_url:`data:image/png;base64,${bytes.toString('base64')}`,detail:'high'}],summary:`Local ${target.mode==='browser'?'browser':'Mac'}: ${name.replaceAll('_',' ')}`};}
export function attachDesktopDevices(server:Server){
 const wss=new WebSocketServer({noServer:true,maxPayload:5*1024*1024});
 server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url??'/','http://localhost');if(url.pathname!=='/api/desktop/connect')return;
  const user=userFromCookieHeader(req.headers.cookie),mode=url.searchParams.get('mode');
  if(!user||!allowedOrigin(req.headers.origin)||!['browser','mac'].includes(mode??'')||activeDesktop(user.id)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>{
   const d:Device={id:randomUUID(),userId:user.id,mode:mode as 'browser'|'mac',name:'Fino Mac',expires:Date.now()+30*60_000,socket:ws};devices.set(user.id,d);
   ws.send(JSON.stringify({type:'connected',mode:d.mode,expires:d.expires}));
   const check=setInterval(()=>{if(Date.now()>d.expires||userFromCookieHeader(req.headers.cookie)?.id!==user.id)ws.close(1008,'Local control expired');else ws.ping();},15_000);check.unref();
   ws.on('message',data=>{try{const result=JSON.parse(data.toString()),p=pending.get(result.id);if(!p||p.deviceId!==d.id)return;pending.delete(result.id);clearTimeout(p.timer);if(result.error)p.reject(Error(String(result.error).slice(0,250)));else p.resolve(result.result);}catch{ws.close(1008,'Invalid response');}});
   ws.on('close',()=>{clearInterval(check);if(devices.get(user.id)?.id===d.id)devices.delete(user.id);for(const [id,p]of pending)if(p.deviceId===d.id){clearTimeout(p.timer);p.reject(Error('Local control stopped.'));pending.delete(id);}});
  });
 });
}
