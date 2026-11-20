import {publishAttachment} from '../attachments.js';
import {appendRow} from '../store.js';
import {screenFor} from '../computer.js';
import {orgo} from '../orgo.js';

export interface DesktopProof {used:boolean;deferred?:boolean}
type Owner={userId:string;botId:string;desktopProof?:DesktopProof};
/** Capture only desktops touched by this turn, never provision a computer for plain chat. */
export async function finishDesktopWork(ctx:Owner,completed:boolean,blocked:boolean, capture=async()=>{
 const {computerId,screenId}=await screenFor(ctx.userId,ctx.botId);
 const shot=await orgo.screenshot(computerId,screenId);
 const raw=shot.image.replace(/^data:image\/(?:png|jpeg|webp);base64,/,'');
 if(!raw||raw.length>4*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw Error('Screenshot unavailable or too large.');
 return Buffer.from(raw,'base64');
}){
 if(!completed||blocked||!ctx.desktopProof?.used||ctx.desktopProof.deferred)return false;
 ctx.desktopProof.used=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const image=await Promise.race([capture(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Screenshot timed out.')),15_000);})]);
  const extension=image[0]===255?'jpg':image.subarray(0,4).toString()==='RIFF'?'webp':'png';
  publishAttachment(ctx.userId,ctx.botId,`Work result.${extension}`,image,'Computer · final screenshot');return true;
 }
 catch{appendRow(ctx.botId,'notice',{type:'notice',tone:'warn',text:'The task finished, but its final screenshot could not be attached.'});return false;}
 finally{if(timer)clearTimeout(timer);}
}
