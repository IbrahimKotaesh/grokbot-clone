import { t } from '../lib/i18n';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Check,ChevronDown,MessageSquare,Plus,Pencil,X} from 'lucide-react';
import type {Bot} from '@shared/types';
import {useStore} from '../store';
import {useConfigUI} from '../configStore';
import {api} from '../lib/api';

/** Saved conversations belong beneath their bot, not in a second chat header. */
export function BotConversations({bot,collapsed,children}:{bot:Bot;collapsed:boolean;children:ReactNode}){
 const chats=useStore(s=>s.chats[bot.id]),selectedBot=useStore(s=>s.selectedBotId),generation=useStore(s=>s.selectedChats[bot.id]??bot.generation),live=useStore(s=>s.live[bot.id]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[rename,setRename]=useState<number|null>(null),[title,setTitle]=useState('');
 const trigger=useRef<HTMLButtonElement>(null);
 // Each bot's chat list folds away; your choice is remembered. With no choice yet, only the open bot shows its chats.
 const openKey=`fino.chatsOpen.${bot.id}`;
 const [openChoice,setOpenChoice]=useState<boolean|null>(()=>{try{const v=localStorage.getItem(openKey);return v===null?null:v==='1';}catch{return null;}});
 const listOpen=openChoice??selectedBot===bot.id;
 const toggleList=()=>{const next=!listOpen;setOpenChoice(next);try{localStorage.setItem(openKey,next?'1':'0');}catch{/* private window */}};
 useEffect(()=>{if(!collapsed&&bot.kind!=='room')void useStore.getState().loadChats(bot.id).catch(()=>{});},[bot.id,bot.kind,collapsed]);
 const select=(value:number)=>{useStore.getState().selectChat(bot.id,value);useStore.getState().selectBot(bot.id);useConfigUI.getState().setView('chat');};
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(collapsed||bot.kind==='room')return <>{children}</>;
 return <div className={`bot-conversations${bot.isPrimary?' is-chief':''}`}>
  <div className="bot-conversations__head">{children}{(chats?.length??0)>1&&<button type="button" className={`bot-conversations__fold${listOpen?' is-open':''}`} aria-expanded={listOpen} aria-label={listOpen?t('Hide chats'):t('Show chats')} title={listOpen?t('Hide chats'):t('Show chats')} onClick={toggleList}><ChevronDown size={15}/></button>}<button ref={trigger} type="button" className="bot-conversations__add" aria-label={t("New chat with {name}", { name: bot.name })} title={t("New chat")} disabled={busy} onClick={()=>void run(async()=>{const chat=await useStore.getState().newChat(bot.id);select(chat.generation);})}><Plus size={17}/></button></div>
  {(chats?.length??0)>1&&listOpen&&<div className="bot-conversations__list" aria-label={`${bot.name} conversations`}>{chats?.map(chat=>{
   const active=selectedBot===bot.id&&generation===chat.generation,working=live?.generation===chat.generation&&!!(live.isRunning||live.awaiting);
   return rename===chat.generation?<form key={chat.generation} className="bot-conversations__rename" onSubmit={e=>{e.preventDefault();void run(async()=>{await api.renameChat(bot.id,chat.generation,title);await useStore.getState().loadChats(bot.id);setRename(null);});}}><input aria-label={t("Chat name")} autoFocus value={title} maxLength={80} onChange={e=>setTitle(e.target.value)}/><button type="submit" aria-label={t("Save chat name")} disabled={busy||!title.trim()}><Check size={14}/></button><button type="button" aria-label={t("Cancel rename")} onClick={()=>setRename(null)}><X size={14}/></button></form>:<div key={chat.generation} className={`bot-conversations__item${active?' is-selected':''}`}><button type="button" className="bot-conversations__select" aria-current={active?'page':undefined} onClick={()=>select(chat.generation)}><MessageSquare size={13}/><span dir="auto">{chat.title}</span>{working&&<i aria-label={t("Working")} className="status-dot is-working"/>}</button><button type="button" className="bot-conversations__edit" aria-label={`Rename chat: ${chat.title}`} onClick={()=>{setRename(chat.generation);setTitle(chat.title);}}><Pencil size={12}/></button></div>;
  })}</div>}
  {error&&<small className="bot-conversations__error" role="alert">{error}</small>}
 </div>;
}
