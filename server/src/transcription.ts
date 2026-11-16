import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import type {AuthVars} from './lib/auth.js';
export const transcriptionApi=new Hono<AuthVars>();
transcriptionApi.post('/transcribe',bodyLimit({maxSize:8*1024*1024,onError:c=>c.json({error:'Record a shorter voice message (up to 60 seconds).'},413)}),async c=>{
  const type=c.req.header('content-type')??'';
  if(!/^audio\/(webm|mp4|mpeg|ogg|wav|x-wav)(?:;|$)/i.test(type))return c.json({error:'Unsupported recording format.'},415);
  const audio=await c.req.arrayBuffer();if(audio.byteLength<200)return c.json({error:'No audio was captured. Please record again.'},400);
  try {
    const r=await fetch(`${process.env.LOCAL_STT_URL??'http://127.0.0.1:8841'}/transcribe`,{method:'POST',headers:{'Content-Type':type},body:audio,signal:AbortSignal.timeout(120_000)});
    const result=await r.json() as {text?:string;language?:string;error?:string};
    if(!r.ok)return c.json({error:result.error??'Transcription failed. Please try again.'},(r.status===429?429:r.status===413?413:422));
    if(typeof result.text!=='string'||!result.text.trim())return c.json({error:'No speech was detected. Try speaking closer to the microphone.'},422);
    return c.json({text:result.text.trim(),language:result.language});
  } catch {return c.json({error:'Transcription is temporarily unavailable. Your typed message is safe; please try again.'},503);}
});
