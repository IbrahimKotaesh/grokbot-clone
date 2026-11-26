import { t } from '../lib/i18n';
import {useLayoutEffect,useRef,useState,type PointerEvent,type ReactNode} from 'react';
import {GripVertical} from 'lucide-react';
import type {Bot} from '@shared/types';
import {useStore} from '../store';
/** `fullOrder` maps this list's new order into the order of every Bot (the server saves all at once, folders included).
 * `onDropToFolder` fires when a Bot is dragged onto a folder header ([data-folder-drop]). */
export function BotRoster({bots,collapsed,render,fullOrder,onDropToFolder}:{bots:Bot[];collapsed:boolean;render:(bot:Bot)=>ReactNode;fullOrder?:(ids:string[])=>string[];onDropToFolder?:(botId:string,folderId:string|null)=>void}){
 const root=useRef<HTMLDivElement>(null),positions=useRef(new Map<string,number>()),drag=useRef<{id:string;y:number;over:string;active:boolean;before:boolean;folder?:string|null;zone?:HTMLElement|null}|null>(null);
 const [dragging,setDragging]=useState<string|null>(null),[over,setOver]=useState<string|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 useLayoutEffect(()=>{
  const next=new Map<string,number>();for(const el of root.current?.querySelectorAll<HTMLElement>('[data-bot-sort-id]')??[]){const id=el.dataset.botSortId!,top=el.getBoundingClientRect().top,old=positions.current.get(id);next.set(id,top);if(old!==undefined&&old!==top&&!matchMedia('(prefers-reduced-motion: reduce)').matches)el.animate([{transform:`translateY(${old-top}px)`},{transform:'none'}],{duration:190,easing:'cubic-bezier(.22,.68,0,1)'});}positions.current=next;
 },[bots.map(b=>b.id).join('|')]);
 const persist=async(subset:string[])=>{
  const ids=fullOrder?fullOrder(subset):subset;
  setSaving(true);setError('');useStore.setState(s=>({bots:s.bots.map(b=>ids.includes(b.id)?{...b,sortOrder:ids.indexOf(b.id)}:b)}));
  try{const r=await fetch('/api/bots/reorder',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});const result=await r.json();if(!r.ok)throw Error(result.error??t("Could not save the order."));useStore.setState({bots:result.bots});}
  catch(e){setError((e as Error).message);await useStore.getState().loadBots().catch(()=>{});}finally{setSaving(false);}
 };
 const move=(id:string,index:number)=>{const ids=bots.map(b=>b.id),from=ids.indexOf(id);if(from<0||index<0||index>=ids.length||from===index)return;ids.splice(from,1);ids.splice(index,0,id);void persist(ids);};
 const start=(e:PointerEvent<HTMLButtonElement>,id:string)=>{if(saving)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id,y:e.clientY,over:id,active:false,before:false};};
 const track=(e:PointerEvent<HTMLButtonElement>)=>{
  const d=drag.current;if(!d)return;if(!d.active&&Math.abs(e.clientY-d.y)>6){d.active=true;setDragging(d.id);}if(!d.active)return;
  const hit=document.elementFromPoint(e.clientX,e.clientY);
  const zone=onDropToFolder?hit?.closest<HTMLElement>('[data-folder-drop]')??null:null;
  if(zone!==d.zone){d.zone?.classList.remove('is-drop');zone?.classList.add('is-drop');d.zone=zone;d.folder=zone?(zone.dataset.folderDrop||null):undefined;}
  if(zone){setOver(null);return;}
  const target=hit?.closest<HTMLElement>('[data-bot-sort-id]');if(target&&target.dataset.botSortId!==d.id){d.over=target.dataset.botSortId!;d.before=e.clientY<target.getBoundingClientRect().top+target.getBoundingClientRect().height/2;setOver(d.over);}
  const scroll=root.current?.closest('.sidebar__scroll');if(scroll){const r=scroll.getBoundingClientRect();if(e.clientY<r.top+24)scroll.scrollBy(0,-12);else if(e.clientY>r.bottom-24)scroll.scrollBy(0,12);}
 };
 const finish=()=>{const d=drag.current;drag.current=null;setDragging(null);setOver(null);d?.zone?.classList.remove('is-drop');if(d?.active&&d.zone&&d.folder!==undefined){onDropToFolder?.(d.id,d.folder);return;}if(!d?.active||d.id===d.over)return;const ids=bots.map(b=>b.id).filter(id=>id!==d.id);let index=ids.indexOf(d.over);if(index<0)return;if(!d.before)index++;ids.splice(index,0,d.id);void persist(ids);};
 return <div ref={root} className="bot-roster">{bots.map((b,i)=><div key={b.id} data-bot-sort-id={b.id} className={`bot-sort-item${dragging===b.id?' is-dragging':''}${over===b.id?' is-drop-target':''}`}>{render(b)}{!collapsed&&<button type="button" className="bot-sort-handle" aria-label={`Reorder ${b.name}; use up and down arrow keys`} title="Drag to reorder · arrow keys also work" disabled={saving} onPointerDown={e=>start(e,b.id)} onPointerMove={track} onPointerUp={finish} onPointerCancel={()=>{drag.current=null;setDragging(null);setOver(null);}} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();move(b.id,i+(e.key==='ArrowUp'?-1:1));}}}><GripVertical size={17}/></button>}</div>)}{error&&<p className="bot-order-error" role="alert">{error}</p>}</div>;
}
