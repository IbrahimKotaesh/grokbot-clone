import {useDesktopState} from '../lib/desktop';
import {ProviderLogo} from './ProviderLogo';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ShieldCheck, Eye, Hand, Zap } from 'lucide-react';
import type { Bot, PermissionMode } from '@shared/types';
import { api } from '../lib/api';
import { useStore } from '../store';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { configApi } from '../lib/configApi';
import { DictationButton } from './DictationButton';
import { PhotoCamera } from './PhotoCamera';
import { prepareDocument, DOCUMENT_ACCEPT, type DocumentUpload } from '../lib/documents';
import { preparePhoto, type Photo } from '../lib/photos';

const permissionChoices = [
  {id:'read_only',name:'Read only',icon:Eye,description:'Read connected data and screenshots. No commands or changes.'},
  {id:'balanced',name:'Balanced',icon:ShieldCheck,description:'Use the computer freely; ask before connected app changes.'},
  {id:'ask',name:'Ask first',icon:Hand,description:'Ask before commands, computer actions or app changes.'},
  {id:'autonomous',name:'Autonomous',icon:Zap,description:'Run computer actions and connected app changes without asking.'},
] as const;
const MAX_H = 200;
const drafts = new Map<string, string>();
const documentDrafts=new Map<string,DocumentUpload[]>();
const photoDrafts = new Map<string, Photo[]>();

export function Composer({ bot, running,generation=bot.generation }: { bot: Bot; running: boolean;generation?:number }) {
  const draftKey=`${bot.id}:${generation}`;
  const [text, setText] = useState(() => drafts.get(draftKey) ?? '');
  const [documents,setDocuments]=useState<DocumentUpload[]>(()=>documentDrafts.get(draftKey)??[]);
  const documentRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{documentDrafts.set(draftKey,documents);},[draftKey,documents]);
  const [photos,setPhotos]=useState<Photo[]>(()=>photoDrafts.get(draftKey)??[]);
  const [preparing,setPreparing]=useState(false);
  const [camera,setCamera]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const captureRef=useRef<HTMLInputElement>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{photoDrafts.set(draftKey,photos);},[draftKey,photos]);
  const closeCamera=useCallback(()=>setCamera(false),[]);
  const addFiles=async(files:FileList|null)=>{
    if(!files?.length)return;
    if(photos.length+files.length>3){setError('Attach up to 3 photos.');return;}
    setPreparing(true);setError(null);
    try {const prepared=await Promise.all([...files].map(preparePhoto));if(mounted.current)setPhotos(cur=>[...cur,...prepared].slice(0,3));}
    catch(e){if(mounted.current)setError((e as Error).message);}
    finally {if(mounted.current)setPreparing(false);}
  };
  const addDocuments=async(files:FileList|null)=>{
    if(!files?.length)return;
    if(documents.length+files.length>3){setError('Attach up to 3 files.');return;}
    if(documents.reduce((n,f)=>n+f.size,0)+[...files].reduce((n,f)=>n+f.size,0)>20*1024*1024){setError('Keep the total file size under 20 MB.');return;}
    setPreparing(true);setError(null);
    try {const prepared=await Promise.all([...files].map(prepareDocument));if(mounted.current)setDocuments(cur=>[...cur,...prepared].slice(0,3));}
    catch(e){if(mounted.current)setError((e as Error).message);}finally{if(mounted.current)setPreparing(false);}
  };
  const openCamera=()=>{
    if(photos.length>=3){setError('Attach up to 3 photos.');return;}
    if(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent))captureRef.current?.click();
    else setCamera(true);
  };
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [settingsMenu,setSettingsMenu]=useState<'model'|'permissions'|null>(null);
  const [switching, setSwitching] = useState(false);
  const [dictating,setDictating]=useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const setModal = useStore((s) => s.setModal);

  // Per-bot drafts.
  useEffect(() => { setText(drafts.get(draftKey) ?? ''); setError(null); }, [draftKey]);
  useEffect(() => { drafts.set(draftKey, text); }, [draftKey, text]);

  // Auto-grow.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')) {
      el.style.height = ''; el.style.overflowY = ''; return;
    }
    const previousScroll = el.scrollTop;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_H)}px`;
    el.style.overflowY = el.scrollHeight > MAX_H ? 'auto' : 'hidden';
    el.scrollTop = previousScroll;
  }, [text]);

  // ⌘I focuses the prompt.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const desktop=useDesktopState(),needsLocalConnection=!!desktop&&desktop.environment!=='server'&&!desktop.connected;
  const send = async () => {
    if(needsLocalConnection){setError('Connect the selected local environment using the top toolbar first.');return;}
    const t = text.trim();
    if ((!t && !photos.length && !documents.length) || preparing || sending || switching || dictating) return;
    setSending(true); setError(null);
    try {
      await api.send(bot.id, t, photos,documents,generation);
      setPhotos([]);photoDrafts.delete(draftKey);setDocuments([]);documentDrafts.delete(draftKey);
      setText('');
      drafts.delete(draftKey);
    } catch (e) {
      setError((e as Error).message || 'Message failed to send');
    } finally {
      setSending(false);
    }
  };

  const stop = () => api.interrupt(bot.id,generation).catch((e) => setError(e.message));
  const fresh = () => useStore.getState().newChat(bot.id).catch((e) => setError(e.message));

  const changeProvider = async (agentProvider: 'codex' | 'claude') => {
    setSwitching(true); setError(null);
    try {
      const { bot: updated } = await configApi.updateBot(bot.id, { agentProvider, model: '' });
      useStore.setState(s => ({ bots: s.bots.map(b => b.id === updated.id ? updated : b) }));
    } catch (e) { setError((e as Error).message); }
    finally { setSwitching(false); }
  };

  const changePermissions = async (permissionMode: PermissionMode) => {
    setSwitching(true);setError(null);
    try {
      const {bot:updated}=await configApi.updateBot(bot.id,{permissionMode});
      useStore.setState(s=>({bots:s.bots.map(b=>b.id===updated.id?updated:b)}));
    } catch(e) {setError((e as Error).message);} finally {setSwitching(false);}
  };
  const permission=permissionChoices.find(p=>p.id===(bot.permissionMode??'balanced'))!;
  const hasText = text.trim().length > 0 || photos.length > 0 || documents.length > 0;

  return (
    <div className="composer-area">
      {error && <div className="composer__error">{error} <button type="button" className="link-btn" onClick={() => setError(null)}>Dismiss</button></div>}
      <input hidden ref={documentRef} type="file" accept={DOCUMENT_ACCEPT} multiple aria-label="Choose files" onChange={e=>{void addDocuments(e.target.files);e.target.value='';}}/>
      <input hidden ref={fileRef} type="file" accept="image/*" multiple aria-label="Choose photos" onChange={e=>{void addFiles(e.target.files);e.target.value='';}}/>
      <input hidden ref={captureRef} type="file" accept="image/*" capture="environment" aria-label="Take a photo" onChange={e=>{void addFiles(e.target.files);e.target.value='';}}/>
      {camera&&<PhotoCamera onClose={closeCamera} onPhoto={photo=>setPhotos(cur=>[...cur,photo].slice(0,3))}/>}
      <div className="composer-shell">
      {needsLocalConnection&&<div className="composer__environment-note">{desktop?.environment==='mac'?'This Mac':'Local Browser'} selected · Connect above to send a task</div>}
      {documents.length>0&&<div className="composer__documents">{documents.map((file,i)=><div className="composer__document" key={i}><Icon name="file" size={20}/><span><strong>{file.name}</strong><small>{Math.max(1,Math.round(file.size/1024))} KB</small></span><button type="button" aria-label={`Remove file ${i+1}`} disabled={sending} onClick={()=>setDocuments(cur=>cur.filter((_,n)=>n!==i))}>×</button></div>)}</div>}
      {sending&&documents.length>0&&<div className="composer__preparing" role="status">Reading attachments…</div>}
      {photos.length>0&&<div className="composer__photos">{photos.map((photo,i)=><div className="composer__photo" key={i}><img src={photo.dataUrl} alt={photo.name}/><button type="button" aria-label={`Remove photo ${i+1}`} disabled={sending} onClick={()=>setPhotos(cur=>cur.filter((_,n)=>n!==i))}>×</button></div>)}</div>}
      {preparing&&<div className="composer__preparing" role="status">Preparing attachments…</div>}
      <div className="composer__writing">
          <textarea
            dir="auto"
            ref={ref}
            className="composer__input"
            rows={1}
            value={text}
            placeholder={`Message ${bot.name}…`}
            onChange={(e) => { setText(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            aria-label={`Message ${bot.name}`}
          />
      </div>
      <div className="composer__toolbar">
        <div className="composer__tools">
          <span className="composer__plus-anchor">
            <button type="button" className="composer__btn" disabled={sending || preparing} onClick={() => setMenu(!menu)} aria-label="More actions" aria-expanded={menu}>
              <Icon name="composer_plus" opacity={0.56} />
            </button>
            {menu && (
              <Menu
                placement="above"
                onClose={() => setMenu(false)}
                items={[
                  { label: 'Choose files', onSelect: () => documentRef.current?.click() },
                  { label: 'Choose photo', onSelect: () => fileRef.current?.click() },
                  { label: 'Take photo', onSelect: openCamera },
                  { label: 'New chat', onSelect: fresh },
                  { label: 'Connect apps', onSelect: () => setModal('apps') },
                ]}
              />
            )}
          </span>
          <span className="composer__setting-anchor composer__model-picker">
            <button type="button" className={`composer__setting is-${bot.agentProvider==='claude'?'claude':'chatgpt'}`} aria-label={`AI model: ${bot.agentProvider==='claude'?'Claude Code':'ChatGPT'}`} aria-expanded={settingsMenu==='model'} disabled={running||sending||switching} onClick={()=>setSettingsMenu(settingsMenu==='model'?null:'model')}><ProviderLogo provider={bot.agentProvider==='claude'?'claude':'codex'}/><span>{bot.agentProvider==='claude'?'Claude Code':'ChatGPT'}</span><ChevronDown size={12}/></button>
            {settingsMenu==='model'&&<Menu placement="above" onClose={()=>setSettingsMenu(null)} items={[
              {label:'ChatGPT',icon:<ProviderLogo provider="codex"/>,selected:bot.agentProvider!=='claude',hint:bot.agentProvider!=='claude'?'✓':undefined,onSelect:()=>void changeProvider('codex')},
              {label:'Claude Code',icon:<ProviderLogo provider="claude"/>,selected:bot.agentProvider==='claude',hint:bot.agentProvider==='claude'?'✓':undefined,onSelect:()=>void changeProvider('claude')},
            ]}/>}
          </span>
          <span className="composer__setting-anchor composer__permissions">
            <button type="button" className="composer__setting" aria-label={`Permissions: ${permission.name}`} title={permission.description} aria-expanded={settingsMenu==='permissions'} disabled={sending||switching} onClick={()=>setSettingsMenu(settingsMenu==='permissions'?null:'permissions')}><permission.icon size={16}/><span>{permission.name}</span><ChevronDown size={12}/></button>
            {settingsMenu==='permissions'&&<Menu placement="above" align="center" onClose={()=>setSettingsMenu(null)} items={permissionChoices.map(p=>({label:p.name,description:p.description,icon:<p.icon size={18}/>,hint:p.id===permission.id?'✓':undefined,onSelect:()=>void changePermissions(p.id)}))}><div className="permission-menu__heading">Permissions for {bot.name}<small>Applies to Fino’s Linux computer and your connected accounts. Saved “Always allow” choices are respected, except in Read only.</small></div></Menu>}
          </span>
        </div>
        <div className="composer__right">
          <DictationButton key={bot.id} disabled={sending||preparing||switching} onBusy={setDictating} onError={setError} onText={transcript=>setText(current=>`${current.trimEnd()}${current.trim()?"\n":""}${transcript}`)}/>
          {running && !hasText ? (
            <button type="button" className="composer__cta" onClick={stop} aria-label="Stop" title="Stop">
              <Icon name="stop" size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="composer__cta"
              onClick={send}
              disabled={needsLocalConnection || !hasText || preparing || sending || switching || dictating}
              aria-label="Send"
              title="Send (Enter)"
            >
              <Icon name="arrow_up" size={16} />
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
