/** A camera belongs to its dialog: stop tracks even if permission resolves after close. */
export function startCamera(video:()=>HTMLVideoElement|null,onError:(message:string)=>void) {
  let closed=false;let stream:MediaStream|undefined;
  const fail=()=>{if(!closed)onError('Camera access is unavailable. Allow it in your browser or choose a photo instead.');};
  if(!navigator.mediaDevices?.getUserMedia) fail();
  else navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}).then(s=>{
    if(closed){s.getTracks().forEach(t=>t.stop());return;}
    stream=s;const target=video();if(target)target.srcObject=s;
  }).catch(fail);
  return ()=>{closed=true;stream?.getTracks().forEach(t=>t.stop());};
}
