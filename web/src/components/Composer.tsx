import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Bot } from '@shared/types';
import { api } from '../lib/api';
import { displayName, useStore } from '../store';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { configApi } from '../lib/configApi';
import { PhotoCamera } from './PhotoCamera';
import { preparePhoto, type Photo } from '../lib/photos';
import { useDictation } from '../voice/dictation';

const MAX_H = 200;
const drafts = new Map<string, string>();
const photoDrafts = new Map<string, Photo[]>();

export function Composer({ bot, running }: { bot: Bot; running: boolean }) {
  const [text, setText] = useState(() => drafts.get(bot.id) ?? '');
  const [photos,setPhotos]=useState<Photo[]>(()=>photoDrafts.get(bot.id)??[]);
  const [preparing,setPreparing]=useState(false);
  const [camera,setCamera]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const captureRef=useRef<HTMLInputElement>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{photoDrafts.set(bot.id,photos);},[bot.id,photos]);
  const closeCamera=useCallback(()=>setCamera(false),[]);
  const addFiles=async(files:FileList|null)=>{
    if(!files?.length)return;
    if(photos.length+files.length>3){setError('Attach up to 3 photos.');return;}
    setPreparing(true);setError(null);
    try {const prepared=await Promise.all([...files].map(preparePhoto));if(mounted.current)setPhotos(cur=>[...cur,...prepared].slice(0,3));}
    catch(e){if(mounted.current)setError((e as Error).message);}
    finally {if(mounted.current)setPreparing(false);}
  };
  const openCamera=()=>{
    if(photos.length>=3){setError('Attach up to 3 photos.');return;}
    if(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent))captureRef.current?.click();
    else setCamera(true);
  };
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const setModal = useStore((s) => s.setModal);

  // Per-bot drafts.
  useEffect(() => { setText(drafts.get(bot.id) ?? ''); setError(null); ref.current?.focus(); }, [bot.id]);
  useEffect(() => { drafts.set(bot.id, text); }, [bot.id, text]);

  // Auto-grow.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, MAX_H)}px`;
    el.style.overflowY = el.scrollHeight > MAX_H ? 'auto' : 'hidden';
  }, [text]);

  // ⌘I focuses the prompt.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const send = async () => {
    const t = text.trim();
    if ((!t && !photos.length) || preparing || sending || switching || dictation.state === 'recording') return;
    setSending(true); setError(null);
    try {
      await api.send(bot.id, t, photos);
      setPhotos([]);photoDrafts.delete(bot.id);
      setText('');
      drafts.delete(bot.id);
    } catch (e) {
      setError((e as Error).message || 'Message failed to send');
    } finally {
      setSending(false);
      ref.current?.focus();
    }
  };

  const stop = () => api.interrupt(bot.id).catch((e) => setError(e.message));
  const fresh = () => api.fresh(bot.id).catch((e) => setError(e.message));

  // Dictation: insert the transcript at the cursor.
  const insertText = (t: string) => {
    const el = ref.current;
    setText((cur) => {
      const start = el && document.activeElement === el ? el.selectionStart : cur.length;
      const end = el && document.activeElement === el ? el.selectionEnd : cur.length;
      const before = cur.slice(0, start);
      const after = cur.slice(end);
      const pre = before && !/\s$/.test(before) ? ' ' : '';
      const post = after && !/^\s/.test(after) ? ' ' : '';
      requestAnimationFrame(() => { if (el) { const pos = before.length + pre.length + t.length; el.focus(); el.setSelectionRange(pos, pos); } });
      return before + pre + t + post + after;
    });
  };
  const dictation = useDictation(insertText, setError, bot.voiceLanguage);
  const changeProvider = async (agentProvider: 'codex' | 'claude') => {
    setSwitching(true); setError(null);
    try {
      const { bot: updated } = await configApi.updateBot(bot.id, { agentProvider, model: '' });
      useStore.setState(s => ({ bots: s.bots.map(b => b.id === updated.id ? updated : b) }));
    } catch (e) { setError((e as Error).message); }
    finally { setSwitching(false); }
  };

  const hasText = text.trim().length > 0 || photos.length > 0;
  const multiline = text.includes('\n') || (ref.current?.scrollHeight ?? 0) > 30;

  return (
    <div className="composer-area">
      {error && <div className="composer__error">{error} <button type="button" className="link-btn" onClick={() => setError(null)}>Dismiss</button></div>}
      <input hidden ref={fileRef} type="file" accept="image/*" multiple aria-label="Choose photos" onChange={e=>{void addFiles(e.target.files);e.target.value='';}}/>
      <input hidden ref={captureRef} type="file" accept="image/*" capture="environment" aria-label="Take a photo" onChange={e=>{void addFiles(e.target.files);e.target.value='';}}/>
      {camera&&<PhotoCamera onClose={closeCamera} onPhoto={photo=>setPhotos(cur=>[...cur,photo].slice(0,3))}/>}
      <div className="composer-shell">
      {photos.length>0&&<div className="composer__photos">{photos.map((photo,i)=><div className="composer__photo" key={i}><img src={photo.dataUrl} alt={photo.name}/><button type="button" aria-label={`Remove photo ${i+1}`} disabled={sending} onClick={()=>setPhotos(cur=>cur.filter((_,n)=>n!==i))}>×</button></div>)}</div>}
      {preparing&&<div className="composer__preparing" role="status">Preparing photo…</div>}
      <div className={`composer${multiline ? ' is-multiline' : ''}`}>
        <div className="composer__left">
          <span className="composer__plus-anchor">
            <button type="button" className="composer__btn" disabled={sending || preparing} onClick={() => setMenu(!menu)} aria-label="More actions" aria-expanded={menu}>
              <Icon name="composer_plus" opacity={0.56} />
            </button>
            {menu && (
              <Menu
                placement="above"
                onClose={() => setMenu(false)}
                items={[
                  { label: 'Choose photo', onSelect: () => fileRef.current?.click() },
                  { label: 'Take photo', onSelect: openCamera },
                  { label: 'New conversation', onSelect: fresh },
                  { label: 'Connect apps', onSelect: () => setModal('apps') },
                ]}
              />
            )}
          </span>
          <textarea
            dir="auto"
            ref={ref}
            className="composer__input"
            rows={1}
            value={text}
            placeholder={`Message ${displayName(bot)}`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            aria-label={`Message ${bot.name}`}
          />
        </div>
        <div className="composer__right">
          <button
            type="button"
            className={`composer__btn${dictation.state === 'recording' ? ' is-recording' : ''}`}
            aria-label={dictation.state === 'recording' ? 'Stop dictation' : 'Dictate'}
            aria-pressed={dictation.state === 'recording'}
            title="Device dictation"
            onClick={() => { ref.current?.focus(); dictation.toggle(); }}
          >
            <Icon name="mic" opacity={0.56} />
          </button>
          {running && !hasText ? (
            <button type="button" className="composer__cta" onClick={stop} aria-label="Stop" title="Stop">
              <Icon name="stop" size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="composer__cta"
              onClick={send}
              disabled={!hasText || preparing || sending || switching || dictation.state === 'recording'}
              aria-label="Send"
              title="Send (Enter)"
            >
              <Icon name="arrow_up" size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="composer__footer">
        <label className="composer__model"><select aria-label="AI model" value={bot.agentProvider === 'claude' ? 'claude' : 'codex'} disabled={running || sending || switching} onChange={e => void changeProvider(e.target.value as 'codex' | 'claude')}><option value="codex">ChatGPT</option><option value="claude">Claude</option></select></label>
        {dictation.state === 'recording' && <span className="composer__voice-status" role="status" dir="auto">{dictation.interim || 'Listening…'}</span>}
      </div>
      </div>
    </div>
  );
}
