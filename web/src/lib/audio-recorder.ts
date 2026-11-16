/** Cancellable recording with track cleanup, including late microphone permission. */
export function createAudioRecording(onStop:(audio:Blob)=>void,onError:(message:string)=>void){
  let cancelled=false,stream:MediaStream|undefined,recorder:MediaRecorder|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const release=()=>{if(timer)clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());};
  const cancel=()=>{cancelled=true;if(recorder?.state==='recording')recorder.stop();release();};
  const start=async()=>{
    try{
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Recording is unavailable in this browser. Use Safari or Chrome over HTTPS.');
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(cancelled){release();return false;}
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
      recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      const chunks:Blob[]=[];let size=0;
      recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>8*1024*1024){cancel();onError('Recording is too large. Please record a shorter message.');}}};
      recorder.onerror=()=>{cancel();onError('The microphone stopped unexpectedly. Please try again.');};
      recorder.onstop=()=>{release();if(!cancelled)onStop(new Blob(chunks,{type:recorder?.mimeType||mime||'audio/webm'}));};
      recorder.start(1000);timer=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop();},60_000);return true;
    }catch(e){release();if(!cancelled)onError((e as DOMException).name==='NotAllowedError'?'Microphone access was denied. Allow the microphone for Fino in your browser settings.':(e as DOMException).name==='NotFoundError'?'No microphone was found on this device.':(e as Error).message);return false;}
  };
  return {start,cancel,stop:()=>{if(recorder?.state==='recording')recorder.stop();}};
}
