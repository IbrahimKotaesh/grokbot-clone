import { useEffect, useRef, useState } from 'react';
const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** A fixed small step: a large provider chunk must never accelerate the reveal. */
export function revealNext(current: string, target: string): string {
  if (!target.startsWith(current)) return target;
  const rest=target.slice(current.length);
  if(!rest)return current;
  let chunk='',n=0;
  const segments=graphemes?graphemes.segment(rest):Array.from(rest).map(segment=>({segment}));
  for(const {segment} of segments){chunk+=segment;if(++n===2)break;}
  return current+chunk;
}

export function useSmoothText(text:string,streaming:boolean,animateInitial=false){
 const [shown,setShown]=useState(streaming||animateInitial?'':text);
 const current=useRef(shown),target=useRef(text),active=useRef(streaming||animateInitial),frame=useRef(0),last=useRef<number|null>(null);
 // Keep one clock across incoming chunks. Restarting an effect used to reset the
 // clock and let fast providers reveal on every network update instead of at a steady pace.
 useEffect(()=>{
  target.current=text;if(streaming)active.current=true;
  if(!active.current||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   cancelAnimationFrame(frame.current);frame.current=0;last.current=null;active.current=false;current.current=text;setShown(text);return;
  }
  if(frame.current)return;
  const tick=(time:number)=>{
   if(last.current===null)last.current=time;
   if(time-last.current>=32){
    last.current=time;current.current=revealNext(current.current,target.current);setShown(current.current);
   }
   if(current.current!==target.current)frame.current=requestAnimationFrame(tick);
   else{frame.current=0;last.current=null;}
  };
  frame.current=requestAnimationFrame(tick);
 },[text,streaming]);
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);frame.current=0;last.current=null;},[]);
 return shown;
}
