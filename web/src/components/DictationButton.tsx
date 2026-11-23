import { t } from '../lib/i18n';
import {useEffect,useRef,useState} from 'react';
import {Mic,Square,X,LoaderCircle} from 'lucide-react';
import {createAudioRecording} from '../lib/audio-recorder';
export function DictationButton({onText,onError,onBusy,disabled}:{onText:(text:string)=>void;onError:(message:string)=>void;onBusy:(busy:boolean)=>void;disabled:boolean}){
  const [phase,setPhase]=useState<'idle'|'permission'|'recording'|'transcribing'>('idle');
  const [seconds,setSeconds]=useState(0);
  const recording=useRef<ReturnType<typeof createAudioRecording>>();
  const request=useRef<AbortController>();const mounted=useRef(true);
  const callbacks=useRef({onText,onError,onBusy});callbacks.current={onText,onError,onBusy};
  const reset=()=>{if(mounted.current){setPhase('idle');callbacks.current.onBusy(false);}};
  const cancel=()=>{recording.current?.cancel();request.current?.abort();reset();};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;recording.current?.cancel();request.current?.abort();callbacks.current.onBusy(false);};},[]);
  useEffect(()=>{if(phase!=='permission')return;const timeout=setTimeout(()=>{recording.current?.cancel();callbacks.current.onError(t("Microphone permission is still waiting. Allow access in your browser, or open Fino in Safari or Chrome and try again."));reset();},20000);return()=>clearTimeout(timeout);},[phase]);
  useEffect(()=>{if(phase!=='recording')return;const began=Date.now();setSeconds(0);const t=setInterval(()=>setSeconds(Math.min(60,Math.floor((Date.now()-began)/1000))),250);return()=>clearInterval(t);},[phase]);
  const start=async()=>{
    setPhase('permission');callbacks.current.onBusy(true);
    const session=createAudioRecording(async audio=>{
      if(!mounted.current)return;
      setPhase('transcribing');const controller=new AbortController();request.current=controller;
      try {
        const r=await fetch('/api/voice/transcribe',{method:'POST',credentials:'include',headers:{'Content-Type':audio.type},body:audio,signal:controller.signal});
        const data=await r.json();if(!r.ok)throw new Error(data.error??t("Transcription failed. Please try again."));
        if(mounted.current&&!controller.signal.aborted)callbacks.current.onText(data.text);
      }catch(e){if(mounted.current&&!controller.signal.aborted)callbacks.current.onError((e as Error).message);}finally{reset();}
    },message=>{if(mounted.current){callbacks.current.onError(message);reset();}});
    recording.current=session;const ready=await session.start();if(ready&&mounted.current)setPhase('recording');
  };
  return <span className="dictation">
    <button type="button" className={`composer__btn${phase==='recording'?' is-recording':''}`} disabled={disabled&&phase==='idle'||phase==='permission'||phase==='transcribing'} aria-label={phase==='recording'?t("Stop recording and transcribe"):t("Record voice")} title={phase==='recording'?t("Stop and transcribe"):t("Record voice")} onClick={()=>phase==='recording'?recording.current?.stop():void start()}>{phase==='recording'?<Square size={16}/>:phase==='transcribing'?<LoaderCircle size={18} className="dictation__spinner"/>:<Mic size={18}/>}</button>
    {phase!=='idle'&&<span className="dictation__status" role="status"><span>{phase==='permission'?t("Allow microphone access…"):phase==='transcribing'?t('Transcribing…'):`Recording · 0:${String(seconds).padStart(2,'0')}`}</span>{phase==='recording'&&<button type="button" onClick={()=>recording.current?.stop()}>{t("Done")}</button>}<button type="button" onClick={cancel} aria-label={t("Cancel recording")}><X size={15}/></button></span>}
  </span>;
}
