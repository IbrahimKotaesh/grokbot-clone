import {inChat} from '../lib/chat-scope.js';
import fs from 'node:fs';
import path from 'node:path';
import {publishAttachment} from '../attachments.js';
import {appendRow,updateRow,setLive,getBotRow} from '../store.js';
import {now} from '../db.js';
const MAX_IMAGE_BYTES=3*1024*1024;

/** Read only a completed native artifact, never arbitrary host files or URLs. */
export function nativeImageBytes(item:any,roots:string[]):Buffer{
 if(item.savedPath){
  if(typeof item.savedPath!=='string')throw Error('Invalid generated image path.');
  const filename=fs.realpathSync(item.savedPath);
  const allowed=roots.some(root=>{if(!fs.existsSync(root))return false;const relative=path.relative(fs.realpathSync(root),filename);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);});
  if(!allowed)throw Error('Generated image is outside its permitted artifact directory.');
  const fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
   const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size<1||stat.size>MAX_IMAGE_BYTES)throw Error('The generated image is too large to attach (maximum 3 MB).');
   const buffer=Buffer.alloc(stat.size);let offset=0;
   while(offset<buffer.length){const n=fs.readSync(fd,buffer,offset,buffer.length-offset,offset);if(!n)throw Error('Generated image is incomplete.');offset+=n;}
   return buffer;
  }finally{fs.closeSync(fd);}
 }
 const raw=typeof item.result==='string'?item.result.replace(/^data:image\/(?:png|jpeg|webp);base64,/,''):'';
 if(!raw||raw.length>MAX_IMAGE_BYTES*4/3+4||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw Error('Codex did not provide a readable generated image artifact.');
 const data=Buffer.from(raw,'base64');if(data.length>MAX_IMAGE_BYTES)throw Error('Generated image exceeds 3 MB.');return data;
}

export function nativeImageReceiver(userId:string,botId:string,roots:string[]){
 const bot=getBotRow(botId);if(!bot||bot.user_id!==userId)throw Error('Bot not found.');
 const rows=new Map<string,number>(),completed=new Set<string>();
 let delivered=0,failed=false;
 return {
  get delivered(){return delivered;},get failed(){return failed;},
  receive(item:any,phase:'started'|'completed'){return inChat(botId,bot.generation,()=>{
   if(!item?.id||completed.has(item.id))return;
   let seq=rows.get(item.id);
   if(seq===undefined){seq=appendRow(botId,'tool-call',{type:'tool-call',callId:item.id,name:'image_generation',label:'Generating an image',status:'running'}).seq;rows.set(item.id,seq);}
   if(phase==='started'){setLive(botId,{activity:{kind:'working',detail:'Generating an image',since:now()}});return;}
   completed.add(item.id);
   try{
    if(item.failure||item.status!=='completed')throw Error(item.failure?.type==='usageLimitExceeded'?'Image-generation usage limit reached. Try again after your included limit resets.':'Image generation did not finish.');
    const bytes=nativeImageBytes(item,roots);
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
    if(!png&&!jpeg&&!webp)throw Error('Native generation did not produce a valid image file.');
    const name=bytes[0]===255?'Generated image.jpg':bytes.subarray(0,4).toString()==='RIFF'?'Generated image.webp':'Generated image.png';
    publishAttachment(userId,botId,name,bytes);
    delivered++;updateRow(botId,seq,{type:'tool-call',callId:item.id,name:'image_generation',label:'Generating an image',status:'done',summary:'Image attached to this conversation'});
   }catch(error){
    failed=true;const message=error instanceof Error?error.message:'Could not attach the generated image.';
    updateRow(botId,seq,{type:'tool-call',callId:item.id,name:'image_generation',label:'Generating an image',status:'error',summary:message});
    appendRow(botId,'notice',{type:'notice',tone:'warn',text:message});
   }
  });}
 };
}
