import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Check,MessageSquare,Plus,Pencil,X} from 'lucide-react';
import type {Bot} from '@shared/types';
import {useStore} from '../store';
import {useConfigUI} from '../configStore';
import {api} from '../lib/api';

/** Saved conversations belong beneath their bot, not in a second chat header. */
export function BotConversations({bot,collapsed,children}:{bot:Bot;collapsed:boolean;children:ReactNode}){
 const chats=useStore(s=>s.chats[bot.id]),selectedBot=useStore(s=>s.selectedBotId),generation=useStore(s=>s.selectedChats[bot.id]??bot.generation),live=useStore(s=>s.live[bot.id]);
 const [menu,setMenu]=useState<{left:number;top:number}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[rename,setRename]=useState<number|null>(null),[title,setTitle]=useState('');
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!collapsed&&bot.kind!=='room')void useStore.getState().loadChats(bot.id).catch(()=>{});},[bot.id,bot.kind,collapsed]);
 useEffect(()=>{if(!menu)return;const down=(e:MouseEvent)=>{if(!popup.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))setMenu(null);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setMenu(null);trigger.current?.focus();}};document.addEventListener('mousedown',down);document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('mousedown',down);document.removeEventListener('keydown',key,true);};},[menu]);
 const select=(value:number)=>{useStore.getState().selectChat(bot.id,value);useStore.getState().selectBot(bot.id);useConfigUI.getState().setView('chat');};
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(collapsed||bot.kind==='room')return <>{children}</>;
 return <div className={`bot-conversations${bot.isPrimary?' is-chief':''}`}>
  <div className="bot-conversations__head">{children}<button ref={trigger} type="button" className="bot-conversations__add" aria-label={`Chat actions for ${bot.name}`} aria-haspopup="menu" aria-expanded={!!menu} disabled={busy} onClick={()=>{if(menu){setMenu(null);return;}const r=trigger.current!.getBoundingClientRect();setMenu({left:Math.max(8,Math.min(r.right+8,window.innerWidth-220)),top:Math.max(8,Math.min(r.top,window.innerHeight-90))});}}><Plus size={17}/></button></div>
  {menu&&createPortal(<div ref={popup} className="bot-chat-menu" role="menu" aria-label={`Conversations for ${bot.name}`} style={menu}><button type="button" role="menuitem" autoFocus onClick={()=>{setMenu(null);void run(async()=>{const chat=await useStore.getState().newChat(bot.id);select(chat.generation);});}}><Plus size={16}/>New chat</button></div>,document.body)}
  {(chats?.length??0)>1&&<div className="bot-conversations__list" aria-label={`${bot.name} conversations`}>{chats?.map(chat=>{
   const active=selectedBot===bot.id&&generation===chat.generation,working=live?.generation===chat.generation&&!!(live.isRunning||live.awaiting);
   return rename===chat.generation?<form key={chat.generation} className="bot-conversations__rename" onSubmit={e=>{e.preventDefault();void run(async()=>{await api.renameChat(bot.id,chat.generation,title);await useStore.getState().loadChats(bot.id);setRename(null);});}}><input aria-label="Chat name" autoFocus value={title} maxLength={80} onChange={e=>setTitle(e.target.value)}/><button type="submit" aria-label="Save chat name" disabled={busy||!title.trim()}><Check size={14}/></button><button type="button" aria-label="Cancel rename" onClick={()=>setRename(null)}><X size={14}/></button></form>:<div key={chat.generation} className={`bot-conversations__item${active?' is-selected':''}`}><button type="button" className="bot-conversations__select" aria-current={active?'page':undefined} onClick={()=>select(chat.generation)}><MessageSquare size={13}/><span dir="auto">{chat.title}</span>{working&&<i aria-label="Working" className="status-dot is-working"/>}</button><button type="button" className="bot-conversations__edit" aria-label={`Rename chat: ${chat.title}`} onClick={()=>{setRename(chat.generation);setTitle(chat.title);}}><Pencil size={12}/></button></div>;
  })}</div>}
  {error&&<small className="bot-conversations__error" role="alert">{error}</small>}
 </div>;
}
