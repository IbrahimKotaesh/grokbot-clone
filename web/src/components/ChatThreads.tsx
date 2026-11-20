import {useEffect,useRef,useState} from 'react';
import {Check,ChevronDown,MessageSquare,MessageSquarePlus,Pencil,X} from 'lucide-react';
import type {Bot} from '@shared/types';
import {useStore} from '../store';
import {api} from '../lib/api';
export function ChatThreads({bot,generation}:{bot:Bot;generation:number}){
 const chats=(useStore(s=>s.chats[bot.id])??[]),live=useStore(s=>s.live[bot.id]);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[renaming,setRenaming]=useState(false),[title,setTitle]=useState('');
 const root=useRef<HTMLDivElement>(null),current=chats.find(c=>c.generation===generation);
 useEffect(()=>{void useStore.getState().loadChats(bot.id).catch(e=>setError(e.message));},[bot.id]);
 useEffect(()=>{const close=(e:MouseEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);setRenaming(false);}};document.addEventListener('mousedown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',key);};},[]);
 useEffect(()=>{setOpen(false);setRenaming(false);setError('');},[bot.id,generation]);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const elsewhere=!!(live?.isRunning||live?.awaiting)&&live?.generation!==undefined&&live.generation!==generation;
 return <div className="chat-threads" ref={root}>
  {renaming?<form className="chat-threads__rename" onSubmit={e=>{e.preventDefault();void run(async()=>{await api.renameChat(bot.id,generation,title);await useStore.getState().loadChats(bot.id);setRenaming(false);});}}><input aria-label="Chat name" value={title} maxLength={80} onChange={e=>setTitle(e.target.value)} autoFocus/><button type="submit" className="icon-btn" aria-label="Save chat name" disabled={busy||!title.trim()}><Check size={17}/></button><button type="button" className="icon-btn" aria-label="Cancel rename" onClick={()=>setRenaming(false)}><X size={17}/></button></form>:<>
   <div className="chat-threads__picker"><button type="button" className="chat-threads__current" onClick={()=>setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label={`Choose chat: ${current?.title??'Main chat'}`}><MessageSquare size={15}/><span dir="auto">{current?.title??'Main chat'}</span><ChevronDown size={14} className={open?'is-open':''}/></button>
    {open&&<div className="chat-threads__menu" role="menu" aria-label={`Chats with ${bot.name}`}><div className="chat-threads__menu-head">Chats with {bot.name}</div>{chats.map(chat=><button type="button" key={chat.generation} role="menuitemradio" aria-checked={chat.generation===generation} className={chat.generation===generation?'is-selected':''} onClick={()=>{useStore.getState().selectChat(bot.id,chat.generation);setOpen(false);}}><MessageSquare size={15}/><span><strong dir="auto">{chat.title}</strong><small>{chat.isMain?'Main chat':`${chat.messageCount} ${chat.messageCount===1?'message':'messages'}`}</small></span>{chat.generation===generation&&<Check size={16}/>}</button>)}</div>}
   </div>
   <div className="chat-threads__actions"><button type="button" className="chat-threads__rename-btn" aria-label="Rename chat" title="Rename chat" disabled={!current||busy} onClick={()=>{setTitle(current?.title??'');setRenaming(true);setOpen(false);}}><Pencil size={15}/></button><button type="button" className="chat-threads__new" onClick={()=>void run(async()=>{await useStore.getState().newChat(bot.id);})} disabled={busy} aria-label={`New chat with ${bot.name}`} title="Start a separate chat; this bot's memory stays shared"><MessageSquarePlus size={17}/><span>New chat</span></button></div>
  </>}
  {elsewhere&&<small className="chat-threads__elsewhere" role="status">Working in another chat</small>}{error&&<small role="alert" className="chat-threads__error">{error}</small>}
 </div>;
}
