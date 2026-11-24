import assert from 'node:assert/strict';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
const path=new URL('../data/verification/audio-test.mjs',import.meta.url);await fs.mkdir(new URL('.',path),{recursive:true});
await build({entryPoints:['web/src/lib/audio-recorder.ts'],bundle:true,platform:'node',format:'esm',outfile:path.pathname});
const {createAudioRecording}=await import(path.href);
let stopped=0,resolveMedia,mode='ready',recorded=[],errors=[];
const stream={getTracks:()=>[{stop:()=>stopped++}]};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>mode==='late'?new Promise(r=>resolveMedia=r):mode==='denied'?Promise.reject(Object.assign(Error('Denied'),{name:'NotAllowedError'})):Promise.resolve(stream)}}});
class Recorder{static isTypeSupported(t){return t==='audio/mp4';}constructor(s,opts){assert.equal(s,stream);this.mimeType=opts.mimeType;}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['actual bytes'])});this.onstop?.();}}
globalThis.MediaRecorder=Recorder;
try {
 let session=createAudioRecording(b=>recorded.push(b),e=>errors.push(e));assert.equal(await session.start(),true);session.stop();assert.equal(recorded.length,1);assert.equal(recorded[0].type,'audio/mp4');assert.equal(await recorded[0].text(),'actual bytes');assert.ok(stopped);
 recorded=[];session=createAudioRecording(b=>recorded.push(b),e=>errors.push(e));await session.start();session.cancel();assert.equal(recorded.length,0,'Cancel never uploads captured audio');
 mode='late';stopped=0;session=createAudioRecording(b=>recorded.push(b),e=>errors.push(e));const waiting=session.start();session.cancel();resolveMedia(stream);assert.equal(await waiting,false);assert.equal(stopped,1,'Late microphone permission is released after cancellation');
 mode='denied';session=createAudioRecording(b=>recorded.push(b),e=>errors.push(e));assert.equal(await session.start(),false);assert.match(errors.at(-1),/microphone is blocked/);
 console.log('PASS: Safari MP4 format, recorded bytes, stopped tracks, cancelled uploads, late permission cleanup and permission errors');
}finally{await fs.unlink(path);}
