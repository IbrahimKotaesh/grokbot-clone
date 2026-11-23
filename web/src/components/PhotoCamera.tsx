import { t } from '../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { startCamera } from '../lib/camera';
import type { Photo } from '../lib/photos';

export function PhotoCamera({onPhoto,onClose}:{onPhoto:(photo:Photo)=>void;onClose:()=>void}) {
  const video=useRef<HTMLVideoElement>(null);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const stop=startCamera(()=>video.current,setError);
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);
    return ()=>{stop();window.removeEventListener('keydown',key);};
  },[onClose]);
  const capture=()=>{
    const v=video.current;if(!v?.videoWidth)return;
    const scale=Math.min(1,2048/Math.max(v.videoWidth,v.videoHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.round(v.videoWidth*scale);canvas.height=Math.round(v.videoHeight*scale);
    const ctx=canvas.getContext('2d');if(!ctx)return;ctx.drawImage(v,0,0,canvas.width,canvas.height);
    onPhoto({name:'Camera photo.jpg',dataUrl:canvas.toDataURL('image/jpeg',0.9)});onClose();
  };
  return <div className="photo-camera" role="dialog" aria-modal="true" aria-label={t("Camera")}>
    <div className="photo-camera__card"><div className="photo-camera__header"><strong>{t("Camera")}</strong><button type="button" className="icon-btn" onClick={onClose} aria-label={t("Close camera")}>×</button></div>
    {error?<p role="alert">{error}</p>:<video ref={video} autoPlay muted playsInline onLoadedData={()=>setReady(true)}/>}
    <button type="button" className="photo-camera__capture" disabled={!ready||!!error} onClick={capture}>{t("Take photo")}</button></div>
  </div>;
}
