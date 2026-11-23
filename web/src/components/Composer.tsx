import { t } from '../lib/i18n';
import {useDesktopState} from '../lib/desktop';
import {ProviderLogo} from './ProviderLogo';
import { BrainLogo, brainLabel, DEFAULT_MODEL, ModelLogo, tierName, useHostedModels } from '../lib/models';
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
  {id:'read_only',name:t('Read only'),icon:Eye,description:t("Read connected data and screenshots. No commands or changes.")},
  {id:'balanced',name:t('Balanced'),icon:ShieldCheck,description:t('Use the computer freely; ask before connected app changes.')},
  {id:'ask',name:t('Ask first'),icon:Hand,description:t("Ask before commands, computer actions or app changes.")},
  {id:'autonomous',name:t('Autonomous'),icon:Zap,description:t("Run computer actions and connected app changes without asking.")},
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
    if(photos.length+files.length>3){setError(t("Attach up to 3 photos."));return;}
    setPreparing(true);setError(null);
    try {const prepared=await Promise.all([...files].map(preparePhoto));if(mounted.current)setPhotos(cur=>[...cur,...prepared].slice(0,3));}
    catch(e){if(mounted.current)setError((e as Error).message);}
    finally {if(mounted.current)setPreparing(false);}
  };
  const addDocuments=async(files:FileList|null)=>{
    if(!files?.length)return;
    if(documents.length+files.length>3){setError(t("Attach up to 3 files."));return;}
    if(documents.reduce((n,f)=>n+f.size,0)+[...files].reduce((n,f)=>n+f.size,0)>20*1024*1024){setError(t("Keep the total file size under 20 MB."));return;}
    setPreparing(true);setError(null);
    try {const prepared=await Promise.all([...files].map(prepareDocument));if(mounted.current)setDocuments(cur=>[...cur,...prepared].slice(0,3));}
    catch(e){if(mounted.current)setError((e as Error).message);}finally{if(mounted.current)setPreparing(false);}
  };
  const openCamera=()=>{
    if(photos.length>=3){setError(t("Attach up to 3 photos."));return;}
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
    if(needsLocalConnection){setError(t("Connect the selected local environment using the top toolbar first."));return;}
    const msg = text.trim();
    if ((!msg && !photos.length && !documents.length) || preparing || sending || switching || dictating) return;
    setSending(true); setError(null);
    try {
      await api.send(bot.id, msg, photos,documents,generation);
      setPhotos([]);photoDrafts.delete(draftKey);setDocuments([]);documentDrafts.delete(draftKey);
      setText('');
      drafts.delete(draftKey);
    } catch (e) {
      setError((e as Error).message || t("Message failed to send"));
    } finally {
      setSending(false);
    }
  };

  const stop = () => api.interrupt(bot.id,generation).catch((e) => setError(e.message));
  const fresh = () => useStore.getState().newChat(bot.id).catch((e) => setError(e.message));

  const hosted = useHostedModels();
  const included = bot.agentProvider === 'openrouter';
  const changeProvider = async (agentProvider: 'codex' | 'claude' | 'openrouter', model = '') => {
    setSwitching(true); setError(null);
    try {
      const { bot: updated } = await configApi.updateBot(bot.id, { agentProvider, model });
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
      {error && <div className="composer__error">{error} <button type="button" className="link-btn" onClick={() => setError(null)}>{t("Dismiss")}</button></div>}
      <input hidden ref={documentRef} type="file" accept={DOCUMENT_ACCEPT} multiple aria-label={t("Choose files")} onChange={e=>{void addDocuments(e.target.files);e.target.value='';}}/>
      <input hidden ref={fileRef} type="file" accept="image/*" multiple aria-label={t("Choose photos")} onChange={e=>{void addFiles(e.target.files);e.target.value='';}}/>
      <input hidden ref={captureRef} type="file" accept="image/*" capture="environment" aria-label={t("Take a photo")} onChange={e=>{void addFiles(e.target.files);e.target.value='';}}/>
      {camera&&<PhotoCamera onClose={closeCamera} onPhoto={photo=>setPhotos(cur=>[...cur,photo].slice(0,3))}/>}
      <div className="composer-shell">
      {needsLocalConnection&&<div className="composer__environment-note">{t("This Computer selected · Connect above to send a task")}</div>}
      {documents.length>0&&<div className="composer__documents">{documents.map((file,i)=><div className="composer__document" key={i}><Icon name="file" size={20}/><span><strong>{file.name}</strong><small>{Math.max(1,Math.round(file.size/1024))} KB</small></span><button type="button" aria-label={`Remove file ${i+1}`} disabled={sending} onClick={()=>setDocuments(cur=>cur.filter((_,n)=>n!==i))}>×</button></div>)}</div>}
      {sending&&documents.length>0&&<div className="composer__preparing" role="status">{t("Reading attachments…")}</div>}
      {photos.length>0&&<div className="composer__photos">{photos.map((photo,i)=><div className="composer__photo" key={i}><img src={photo.dataUrl} alt={photo.name}/><button type="button" aria-label={`Remove photo ${i+1}`} disabled={sending} onClick={()=>setPhotos(cur=>cur.filter((_,n)=>n!==i))}>×</button></div>)}</div>}
      {preparing&&<div className="composer__preparing" role="status">{t("Preparing attachments…")}</div>}
      <div className="composer__writing">
          <textarea
            dir="auto"
            ref={ref}
            className="composer__input"
            rows={1}
            value={text}
            placeholder={t('Message {name}…',{name:bot.name})}
            onChange={(e) => { setText(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            aria-label={t('Message {name}…',{name:bot.name})}
          />
      </div>
      <div className="composer__toolbar">
        <div className="composer__tools">
          <span className="composer__plus-anchor">
            <button type="button" className="composer__btn" disabled={sending || preparing} onClick={() => setMenu(!menu)} aria-label={t("More actions")} aria-expanded={menu}>
              <Icon name="composer_plus" opacity={0.56} />
            </button>
            {menu && (
              <Menu
                placement="above"
                onClose={() => setMenu(false)}
                items={[
                  { label: t("Choose files"), onSelect: () => documentRef.current?.click() },
                  { label: t("Choose photo"), onSelect: () => fileRef.current?.click() },
                  { label: t("Take photo"), onSelect: openCamera },
                  { label: t("New chat"), onSelect: fresh },
                  { label: t("Connect apps"), onSelect: () => setModal('apps') },
                ]}
              />
            )}
          </span>
          <span className="composer__setting-anchor composer__model-picker">
            <button type="button" className={`composer__setting is-${bot.agentProvider==='claude'?'claude':'chatgpt'}`} aria-label={`AI model: ${brainLabel(bot)}`} aria-expanded={settingsMenu==='model'} disabled={running||sending||switching} onClick={()=>setSettingsMenu(settingsMenu==='model'?null:'model')}><BrainLogo bot={bot}/><span>{brainLabel(bot)}</span><ChevronDown size={12}/></button>
            {settingsMenu==='model'&&<Menu placement="above" onClose={()=>setSettingsMenu(null)} items={[
              ...(hosted?.available?hosted.models.map((m,i)=>{
                const on=included&&(bot.model||DEFAULT_MODEL)===m.id;
                return {section:i===0?t('Included in your plan'):undefined,label:m.name,description:m.allowed?t(m.note):t('Included in {name}',{name:tierName(m.tier)}),icon:<ModelLogo model={m.id} dim={!m.allowed}/>,selected:on,locked:!m.allowed,hint:on?'✓':m.allowed?undefined:'🔒',onSelect:()=>{if(!m.allowed){setError(t('{model} is included in the {name} plan. Upgrade in the Fino app.',{model:m.name,name:tierName(m.tier)}));return;}void changeProvider('openrouter',m.id);}};
              }):[]),
              {section:hosted?.available?t('Your own subscription'):undefined,label:'ChatGPT',icon:<ProviderLogo provider="codex"/>,selected:bot.agentProvider==='codex'||!bot.agentProvider,hint:bot.agentProvider==='codex'||!bot.agentProvider?'✓':undefined,onSelect:()=>void changeProvider('codex')},
              {label:t("Claude Code"),icon:<ProviderLogo provider="claude"/>,selected:bot.agentProvider==='claude',hint:bot.agentProvider==='claude'?'✓':undefined,onSelect:()=>void changeProvider('claude')},
            ]}/>}
          </span>
          <span className="composer__setting-anchor composer__permissions">
            <button type="button" className="composer__setting" aria-label={`Permissions: ${permission.name}`} title={permission.description} aria-expanded={settingsMenu==='permissions'} disabled={sending||switching} onClick={()=>setSettingsMenu(settingsMenu==='permissions'?null:'permissions')}><permission.icon size={16}/><span>{permission.name}</span><ChevronDown size={12}/></button>
            {settingsMenu==='permissions'&&<Menu placement="above" align="center" onClose={()=>setSettingsMenu(null)} items={permissionChoices.map(p=>({label:p.name,description:p.description,icon:<p.icon size={18}/>,hint:p.id===permission.id?'✓':undefined,onSelect:()=>void changePermissions(p.id)}))}><div className="permission-menu__heading">{t('Permissions for {name}',{name:bot.name})}<small>{t('Applies to Fino’s Linux computer and your connected accounts. Saved “Always allow” choices are respected, except in Read only.')}</small></div></Menu>}
          </span>
        </div>
        <div className="composer__right">
          <DictationButton key={bot.id} disabled={sending||preparing||switching} onBusy={setDictating} onError={setError} onText={transcript=>setText(current=>`${current.trimEnd()}${current.trim()?"\n":""}${transcript}`)}/>
          {running && !hasText ? (
            <button type="button" className="composer__cta" onClick={stop} aria-label={t("Stop")} title={t("Stop")}>
              <Icon name="stop" size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="composer__cta"
              onClick={send}
              disabled={needsLocalConnection || !hasText || preparing || sending || switching || dictating}
              aria-label={t("Send")}
              title={t("Send (Enter)")}
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
