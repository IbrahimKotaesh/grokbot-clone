import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import type {AuthVars} from './lib/auth.js';
import {sonioxEnabled, sonioxTranscribe} from './soniox.js';
export const transcriptionApi=new Hono<AuthVars>();

/** The on-server Whisper model: free but slow. Used when Soniox isn't set up or fails. */
async function localTranscribe(audio:ArrayBuffer,type:string){
  const r=await fetch(`${process.env.LOCAL_STT_URL??'http://127.0.0.1:8841'}/transcribe`,{method:'POST',headers:{'Content-Type':type},body:audio,signal:AbortSignal.timeout(120_000)});
  const result=await r.json() as {text?:string;language?:string;error?:string};
  if(!r.ok)throw Object.assign(new Error(result.error??'Transcription failed. Please try again.'),{status:r.status});
  return {text:(result.text??'').trim(),language:result.language};
}

transcriptionApi.post('/transcribe',bodyLimit({maxSize:8*1024*1024,onError:c=>c.json({error:'Record a shorter voice message (up to 60 seconds).'},413)}),async c=>{
  const type=c.req.header('content-type')??'';
  if(!/^audio\/(webm|mp4|mpeg|ogg|wav|x-wav)(?:;|$)/i.test(type))return c.json({error:'Unsupported recording format.'},415);
  const audio=await c.req.arrayBuffer();if(audio.byteLength<200)return c.json({error:'No audio was captured. Please record again.'},400);
  const started=Date.now();
  let result:{text:string;language?:string}|null=null;
  if(sonioxEnabled()){
    try{result=await sonioxTranscribe(audio,type);}
    catch(e){console.warn('[transcribe] Soniox failed, using the local model:',(e as Error).message);}
  }
  if(!result){
    try{result=await localTranscribe(audio,type);}
    catch(e){
      const status=(e as {status?:number}).status;
      if(status)return c.json({error:(e as Error).message},(status===429?429:status===413?413:422));
      return c.json({error:'Transcription is temporarily unavailable. Your typed message is safe; please try again.'},503);
    }
  }
  console.log(`[transcribe] ${sonioxEnabled()?'soniox':'local'} ${audio.byteLength}B ${type} → ${result.text.length} chars, ${result.language??'?'}, ${Date.now()-started}ms`);
  if(!result.text)return c.json({error:'No speech was detected. Try speaking closer to the microphone.'},422);
  return c.json({text:result.text,language:result.language});
});
