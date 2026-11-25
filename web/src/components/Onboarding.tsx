import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { characterDataUri } from '../../../packages/contracts/src/characters';
import { APP_NAMES, JOBS, appsFor } from '../../../packages/contracts/src/jobs';
import { api, connectApp } from '../lib/api';
import type { AvatarColor } from '@shared/types';
import { ArrowRight, Check, Laptop, LoaderCircle, Sparkles } from 'lucide-react';
import { t } from '../lib/i18n';
import { configApi } from '../lib/configApi';
import { isMacDesktop, useDesktopState } from '../lib/desktop';
import { useHostedModels } from '../lib/models';
import { useStore } from '../store';
import { ProviderLogo } from './ProviderLogo';

const DONE_KEY = 'fino.onboarded';
export const onboardingDone = () => { try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return true; } };
const markDone = () => { try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private window */ } };

type Step = 'brain' | 'team' | 'apps' | 'computer';

/**
 * First-run setup on the web and in the Mac app: connect the AI that powers the bots, pick the jobs
 * you want done (Fino creates those bots), connect the apps they need, and in the Mac app let Fino
 * use this computer. It shows once per device.
 */
export function Onboarding({ onClose, requireAI = false }: { onClose: () => void; requireAI?: boolean }) {
  const mac = isMacDesktop();
  const steps: Step[] = mac ? ['brain', 'team', 'apps', 'computer'] : ['brain', 'team', 'apps'];
  // The jobs picked on the team step decide which apps the next step suggests.
  const [jobs, setJobs] = useState<string[]>([]);
  const [step, setStep] = useState<Step>('brain');
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [closing, setClosing] = useState(false);
  const index = steps.indexOf(step);
  const next = () => { if (index >= steps.length - 1) { finish(); return; } setDir('fwd'); setStep(steps[index + 1]); };
  const back = () => { setDir('back'); setStep(steps[Math.max(0, index - 1)]); };
  const finish = () => { markDone(); setClosing(true); setTimeout(onClose, 280); };
  // On a public server a new customer's bots need their own AI, so setup can't be skipped until one is connected.
  const [aiConnected, setAiConnected] = useState(false);
  const aiReady = !requireAI || aiConnected;
  // The card eases to each step's height instead of jumping.
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>();
  useEffect(() => {
    const el = inner.current; if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  return (
    <div className={`onb${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={t('Set up Fino')}>
      <div className="onb__card">
        <div className="onb__top">
          {steps.length > 1 ? <div className="onb__progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1} aria-label={t('Setup progress')}><i style={{ transform: `scaleX(${(index + 1) / steps.length})` }} /></div> : <span />}
          {aiReady && <button type="button" className="onb__skip" onClick={finish}>{t('Skip setup')}</button>}
        </div>
        <div className="onb__viewport" style={{ height }}>
          <div ref={inner}>
            <div key={step} className={`onb__stage onb__stage--${dir}`}>
              {step === 'brain' && <BrainStep onNext={next} required={requireAI} ready={aiReady} onReady={() => setAiConnected(true)} last={false} />}
              {step === 'team' && <TeamStep onNext={(ids) => { setJobs(ids); next(); }} onBack={back} />}
              {step === 'apps' && <AppsStep jobs={jobs} onNext={next} onBack={back} last={index === steps.length - 1} />}
              {step === 'computer' && <ComputerStep onNext={next} onBack={back} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel, disabled }: { onBack?: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean }) {
  return (
    <div className="onb__nav">
      {onBack ? <button type="button" className="onb__ghost" onClick={onBack}>{t('Back')}</button> : <span />}
      <button type="button" className="onb__primary" onClick={onNext} disabled={disabled}>{nextLabel ?? t('Continue')}{!disabled && <ArrowRight size={17} strokeWidth={2.4} aria-hidden />}</button>
    </div>
  );
}

/** Step 2: your own ChatGPT subscription (signed in with a one-time code), or Fino's included models. */
/** Sign-in pages open in a small window over Fino, so coming back is just closing it. */
function signInWindow(url: string) {
  const w = 520, h = 720;
  const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2), top = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
  return window.open(url, 'fino-sign-in', `popup,width=${w},height=${h},left=${left},top=${top}`);
}

function BrainStep({ onNext, required, ready, onReady, last }: { onNext: () => void; required: boolean; ready: boolean; onReady: () => void; last: boolean }) {
  const hosted = useHostedModels();
  const bots = useStore((s) => s.bots);
  const [chatgpt, setChatgpt] = useState<'unknown' | 'connected' | 'idle' | 'waiting' | 'error'>('unknown');
  const [login, setLogin] = useState<{ url: string; code: string; id: string } | null>(null);
  const [error, setError] = useState('');
  const [included, setIncluded] = useState(false);
  const [claude, setClaude] = useState<'idle' | 'starting' | 'code' | 'checking' | 'connected'>('idle');
  const [claudeLogin, setClaudeLogin] = useState<{ id: string; url: string } | null>(null);
  const [claudeCode, setClaudeCode] = useState('');
  const [typeIt, setTypeIt] = useState(false);
  const popup = useRef<Window | null>(null);
  // Once the customer connects, take them straight in.
  const [justConnected, setJustConnected] = useState(false);
  useEffect(() => { if (!justConnected) return; const id = setTimeout(onNext, 1100); return () => clearTimeout(id); }, [justConnected]);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    fetch('/api/credentials', { credentials: 'include' }).then((r) => r.json())
      .then((r: { credentials: { provider: string; connected: boolean }[]; sharedLogin: boolean }) =>
        { const ok = r.sharedLogin || r.credentials.some((c) => c.connected && (c.provider === 'chatgpt' || c.provider === 'openai')); setChatgpt(ok ? 'connected' : 'idle');
          const claudeOk = r.credentials.some((c) => c.connected && c.provider === 'claude'); if (claudeOk) setClaude('connected'); if (ok || claudeOk) onReady(); })
      .catch(() => setChatgpt('idle'));
    return () => clearInterval(timer.current);
  }, []);

  const startChatgpt = async () => {
    setError('');
    try {
      const r = await fetch('/api/credentials/chatgpt/start', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? t('ChatGPT sign-in is unavailable right now.'));
      setLogin({ url: d.url, code: d.code, id: d.loginId }); setChatgpt('waiting');
      void navigator.clipboard?.writeText(d.code.replace(/-/g, '')).catch(() => {});
      popup.current = signInWindow(d.url);
      timer.current = setInterval(async () => {
        const s = await fetch(`/api/credentials/chatgpt/status/${d.loginId}`, { credentials: 'include' }).then((x) => x.json()).catch(() => null);
        if (s?.state === 'connected') { clearInterval(timer.current); setChatgpt('connected'); setLogin(null); useAllBots('codex'); onReady(); setJustConnected(true); try { popup.current?.close(); } catch { /* already closed */ } }
        else if (s?.state === 'failed' || s?.state === 'expired') { clearInterval(timer.current); setChatgpt('error'); setError(s.error ?? t('Sign-in didn’t finish. Try again.')); }
      }, 2500);
    } catch (e) { setChatgpt('error'); setError((e as Error).message); }
  };

  // Claude: open Claude's sign-in page, then paste the code it shows back here.
  const startClaude = async () => {
    setError(''); setClaude('starting');
    try {
      const r = await fetch('/api/credentials/claude/start', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? t('Claude sign-in is unavailable right now.'));
      setClaudeLogin({ id: d.loginId, url: d.url }); setClaude('code');
      popup.current = signInWindow(d.url);
    } catch (e) { setClaude('idle'); setError((e as Error).message); }
  };
  const sending = useRef(false);
  const sendClaudeCode = async (code: string) => {
    if (!claudeLogin || sending.current) return;
    sending.current = true;
    setError(''); setClaude('checking');
    try {
      const r = await fetch('/api/credentials/claude/finish', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loginId: claudeLogin.id, code }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? t('Claude sign-in didn’t finish. Try again.'));
      setClaude('connected'); setClaudeLogin(null); setClaudeCode(''); useAllBots('claude'); onReady(); setJustConnected(true);
      try { popup.current?.close(); } catch { /* already closed */ }
    } catch (err) { setClaude('idle'); setClaudeLogin(null); setClaudeCode(''); setError((err as Error).message); }
    finally { sending.current = false; }
  };
  const finishClaude = (e: React.FormEvent) => { e.preventDefault(); void sendClaudeCode(claudeCode); };
  // One button: reads the code Claude's Copy Code button put on the clipboard and connects.
  const connectCopied = async () => {
    try {
      const v = (await navigator.clipboard.readText()).trim();
      if (/^[\w#.~-]{20,600}$/.test(v)) { setClaudeCode(v); await sendClaudeCode(v); return; }
      setError(t('No Claude code copied yet. On the Claude page press Authorize, then Copy Code.'));
    } catch { setTypeIt(true); }
  };
  // Coming back from Claude's page with the code copied connects by itself: on return we read the
  // clipboard (the browser may ask once), and ⌘V anywhere in setup works too.
  useEffect(() => {
    if (claude !== 'code') return;
    const looksLikeCode = (v: string) => /^[\w#.~-]{20,600}$/.test(v.trim());
    const tryClipboard = () => { if (document.visibilityState !== 'visible') return; navigator.clipboard?.readText().then((v) => { if (looksLikeCode(v)) { setClaudeCode(v.trim()); void sendClaudeCode(v.trim()); } }).catch(() => {}); };
    const onPaste = (e: ClipboardEvent) => { const v = e.clipboardData?.getData('text') ?? ''; if (looksLikeCode(v)) { e.preventDefault(); setClaudeCode(v.trim()); void sendClaudeCode(v.trim()); } };
    window.addEventListener('focus', tryClipboard); document.addEventListener('visibilitychange', tryClipboard); window.addEventListener('paste', onPaste);
    const watch = setInterval(() => { if (popup.current?.closed) { popup.current = null; tryClipboard(); } }, 600);
    return () => { clearInterval(watch); window.removeEventListener('focus', tryClipboard); document.removeEventListener('visibilitychange', tryClipboard); window.removeEventListener('paste', onPaste); };
  }, [claude, claudeLogin]);

  const useAllBots = useCallback((agentProvider: 'codex' | 'claude' | 'openrouter') => {
    for (const b of bots) if (b.kind !== 'room') void configApi.updateBot(b.id, { agentProvider, model: '' }).then(({ bot }) => useStore.setState((st) => ({ bots: st.bots.map((x) => (x.id === bot.id ? bot : x)) }))).catch(() => {});
  }, [bots]);

  return (
    <section className="onb__step">
      <div className="onb__team onb__team--small" aria-hidden="true">
        {([['architect', 'violet'], ['accountant', 'yellow'], ['medic', 'red'], ['florist', 'magenta']] as const).map(([k, c], i) => <span key={k} style={{ '--i': i } as CSSProperties}><img src={characterDataUri(k, c)} alt="" /></span>)}
      </div>
      <h1>{required ? t('Connect your AI') : t('Choose your AI')}</h1>
      <p>{required ? t('Pick how your bots think: your ChatGPT, your Claude, or Fino’s own models.') : t('Your bots think with the AI you pick. You can change it per bot anytime.')}</p>
      <div className="onb__options">
        <div className={`onb__option${chatgpt === 'connected' ? ' is-done' : ''}`}>
          <ProviderLogo provider="codex" />
          <div className="onb__option-text">
            <strong>{t('Use my ChatGPT subscription')}</strong>
            <small>{chatgpt === 'connected' ? t('Connected. Your bots use ChatGPT.') : t('Plus or Pro. A few taps, the code is copied for you.')}</small>
            {login && (
              <div className="onb__paste">
                <ol className="onb__how">
                  <li>{t('In the ChatGPT window, paste the code (it’s already copied)')} <code>{login.code}</code></li>
                  <li>{t('Press')} <b>{t('Continue')}</b>, {t('then')} <b>{t('Allow')}</b></li>
                  <li>{t('That’s it. Fino connects by itself.')}</li>
                </ol>
                <span className="onb__minor"><a href={login.url} target="_blank" rel="noreferrer noopener" onClick={(e) => { e.preventDefault(); void navigator.clipboard?.writeText(login.code.replace(/-/g, '')).catch(() => {}); popup.current = signInWindow(login.url); }}>{t('Open ChatGPT again')}</a></span>
              </div>
            )}
          </div>
          {chatgpt === 'connected' ? <span className="onb__check"><Check size={16} /></span>
            : chatgpt === 'waiting' ? <LoaderCircle size={18} className="dictation__spinner" />
            : <button type="button" className="onb__small" disabled={chatgpt === 'unknown'} onClick={() => void startChatgpt()}>{t('Connect')}</button>}
        </div>

        <div className={`onb__option${claude === 'connected' ? ' is-done' : ''}`}>
          <ProviderLogo provider="claude" />
          <div className="onb__option-text">
            <strong>{t('Use my Claude subscription')}</strong>
            <small>{claude === 'connected' ? t('Connected. Your bots use Claude.') : t('Pro or Max. A few taps on Claude, nothing to type.')}</small>
            {claudeLogin && (
              <div className="onb__paste">
                <ol className="onb__how">
                  <li>{t('On Claude, press')} <b>{t('Authorize')}</b></li>
                  <li>{t('Press')} <b>{t('Copy Code')}</b></li>
                  <li><b>{t('Close the Claude window.')}</b> {t('Fino connects by itself.')}</li>
                </ol>
                <button type="button" className="onb__primary onb__wide" disabled={claude === 'checking'} onClick={() => void connectCopied()}>{claude === 'checking' ? t('Connecting…') : t('I copied the code, connect')}</button>
                <span className="onb__minor"><a href={claudeLogin.url} target="_blank" rel="noreferrer noopener" onClick={(e) => { e.preventDefault(); popup.current = signInWindow(claudeLogin.url); }}>{t('Open Claude again')}</a> · <button type="button" className="onb__link" onClick={() => setTypeIt((v) => !v)}>{t('Paste it myself')}</button></span>
                {typeIt && (
                  <form onSubmit={finishClaude}>
                    <input className="text-input" value={claudeCode} onChange={(e) => setClaudeCode(e.target.value)} placeholder={t('Paste code')} aria-label={t('Code from Claude')} autoComplete="off" spellCheck={false} autoFocus />
                    <button type="submit" className="onb__small" disabled={claude === 'checking' || claudeCode.trim().length < 10}>{t('Connect')}</button>
                  </form>
                )}
              </div>
            )}
          </div>
          {claude === 'connected' ? <span className="onb__check"><Check size={16} /></span>
            : claude === 'starting' ? <LoaderCircle size={18} className="dictation__spinner" />
            : !claudeLogin && <button type="button" className="onb__small" onClick={() => void startClaude()}>{t('Connect')}</button>}
        </div>

        {hosted?.available && (
          <div className={`onb__option${included ? ' is-done' : ''}`}>
            <span className="onb__icon"><Sparkles size={18} /></span>
            <div className="onb__option-text">
              <strong>{t('Use Fino’s models')}</strong>
              <small>{t('Nothing to sign in to. Bart Flash, included in your plan.')}</small>
            </div>
            {included ? <span className="onb__check"><Check size={16} /></span>
              : <button type="button" className="onb__small" onClick={() => { useAllBots('openrouter'); setIncluded(true); onReady(); setJustConnected(true); }}>{t('Start')}</button>}
          </div>
        )}
      </div>
      {error && <div className="onb__error" role="alert">{error}</div>}
      <Nav onNext={onNext} disabled={!ready} nextLabel={!ready ? t('Pick one to start') : last ? t('Start') : undefined} />
    </section>
  );
}

/** Step 2: what should your team do? Each picked job becomes a ready-made bot that Bart can hand work to. */
function TeamStep({ onNext, onBack }: { onNext: (jobs: string[]) => void; onBack: () => void }) {
  const bots = useStore((s) => s.bots);
  const has = (title: string) => bots.some((b) => b.kind !== 'room' && b.label?.trim().toLowerCase() === title.toLowerCase());
  const [picked, setPicked] = useState<string[]>([]);
  // How many more bots the plan allows besides Bart (null = no limit), so we never offer more than fit.
  const [room, setRoom] = useState<number | null | undefined>(undefined);
  const [planName, setPlanName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    fetch('/api/billing', { credentials: 'include' }).then((r) => r.json())
      .then((b: { plan: string; plans: { id: string; name: string; bots: number | null }[]; usage: { bots: number } }) => {
        const plan = b.plans.find((p) => p.id === b.plan);
        const left = plan?.bots == null ? null : Math.max(0, plan.bots - b.usage.bots);
        setRoom(left); setPlanName(plan?.name ?? '');
        const suggested = JOBS.filter((j) => j.suggested && !has(j.title)).map((j) => j.id);
        setPicked(left == null ? suggested : suggested.slice(0, left));
      })
      .catch(() => { setRoom(null); setPicked(JOBS.filter((j) => j.suggested && !has(j.title)).map((j) => j.id)); });
  }, []);
  const full = room != null && picked.length >= room;
  const toggle = (id: string) => {
    setError('');
    if (picked.includes(id)) { setPicked((p) => p.filter((x) => x !== id)); return; }
    if (full) { setError(roomNote()); return; }
    setPicked((p) => [...p, id]);
  };
  const roomNote = () => room === 0
    ? t('Your {plan} plan has no room for more bots. Upgrade anytime to add them.').replace('{plan}', planName)
    : (room === 1 ? t('Your {plan} plan includes 1 bot besides Bart. Upgrade anytime for more.') : t('Your {plan} plan includes {n} bots besides Bart. Upgrade anytime for more.').replace('{n}', String(room))).replace('{plan}', planName);

  const hire = async () => {
    const chosen = JOBS.filter((j) => picked.includes(j.id) && !has(j.title));
    if (!chosen.length || stuck) { onNext(picked); return; }
    setBusy(true); setError('');
    // New bots think with the same AI as Bart, which the first step just set up.
    const primary = useStore.getState().bots.find((b) => b.isPrimary);
    for (const j of chosen) {
      try {
        let { bot } = await api.createBot({ name: j.name, label: j.title, description: j.blurb, instructions: j.instructions, avatarShape: j.character, avatarColor: j.color as AvatarColor, mode: 'personal' });
        if (primary?.agentProvider && primary.agentProvider !== bot.agentProvider) ({ bot } = await configApi.updateBot(bot.id, { agentProvider: primary.agentProvider, model: primary.model ?? '' }));
        useStore.setState((st) => ({ bots: st.bots.some((b) => b.id === bot.id) ? st.bots : [...st.bots, bot] }));
      } catch (e) {
        // Stay here so the message is seen; the button then just continues.
        setBusy(false); setStuck(true); setError((e as Error).message); return;
      }
    }
    setBusy(false);
    onNext(picked);
  };

  const count = JOBS.filter((j) => picked.includes(j.id) && !has(j.title)).length;
  return (
    <section className="onb__step">
      <h1>{t('What should your team do?')}</h1>
      <p>{t('Pick the jobs you want help with. Each one becomes a bot with its own browser and memory, working while you sleep or do something else. Bart, your Chief of Staff, hands them work.')}</p>
      <div className="onb__jobs" role="group" aria-label={t('Jobs')}>
        {JOBS.map((j) => {
          const hired = has(j.title);
          const on = hired || picked.includes(j.id);
          return (
            <button key={j.id} type="button" className={`onb__job${on ? ' is-on' : ''}${!on && full ? ' is-dim' : ''}`} aria-pressed={on} disabled={hired || busy || room === undefined} onClick={() => toggle(j.id)}>
              {on && <span className="onb__check"><Check size={13} /></span>}
              <img src={characterDataUri(j.character, j.color)} alt="" width={64} height={64} />
              <strong>{t(j.title)}</strong>
              <small>{hired ? t('On your team') : t(j.blurb)}</small>
            </button>
          );
        })}
      </div>
      {room != null && !error && <p className="onb__minor onb__room">{roomNote()}</p>}
      {error && <div className="onb__error" role="alert">{error}</div>}
      <Nav onBack={onBack} onNext={() => void hire()} disabled={busy || room === undefined}
        nextLabel={busy ? t('Adding your team…') : stuck ? t('Continue') : count ? (count === 1 ? t('Add 1 bot') : t('Add {n} bots').replace('{n}', String(count))) : t('Skip for now')} />
    </section>
  );
}

/** Step 3: connect the apps the picked jobs need. Optional: bots work without them and you can connect later. */
function AppsStep({ jobs, onNext, onBack, last }: { jobs: string[]; onNext: () => void; onBack: () => void; last: boolean }) {
  const slugs = appsFor(jobs);
  const [connected, setConnected] = useState<string[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { api.apps().then((r) => { setConnected(r.connected); setConfigured(r.configured !== false); }).catch(() => setConnected([])); }, []);
  // Ticks appear by themselves once a sign-in in the other window finishes.
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, [load]);

  const connect = async (slug: string) => {
    setBusy(slug);
    try { await connectApp(slug); }
    catch { /* the app list shows it as not connected */ }
    finally { setBusy(null); }
  };
  const done = slugs.filter((s) => connected?.includes(s)).length;

  return (
    <section className="onb__step">
      <h1>{t('Connect their apps')}</h1>
      <p>{t('These are the apps your new team works in. Connect what you use; bots ask before they send, pay or delete anything. You can skip this and connect later.')}</p>
      {!configured ? <div className="onb__error">{t('App connections need setup on this server.')}</div> : (
        <div className="onb__apps">
          {slugs.map((slug) => {
            const on = connected?.includes(slug);
            return (
              <button key={slug} type="button" className={`onb__app${on ? ' is-done' : ''}`} disabled={on || busy === slug} onClick={() => void connect(slug)}>
                <img src={`https://logos.composio.dev/api/${slug}`} alt="" width={24} height={24} />
                <span>{APP_NAMES[slug] ?? slug}</span>
                {on ? <span className="onb__check"><Check size={14} /></span> : busy === slug ? <LoaderCircle size={14} className="dictation__spinner" /> : <small>{t('Connect')}</small>}
              </button>
            );
          })}
        </div>
      )}
      <button type="button" className="onb__link" onClick={() => useStore.getState().setModal('apps')}>{t('See all apps')}</button>
      <Nav onBack={onBack} onNext={onNext} nextLabel={done ? (last ? t('Start') : t('Continue')) : t('Skip for now')} />
    </section>
  );
}

/** Step 4 (Mac app only): let Fino use this Mac — the app walks through the two macOS permissions. */
function ComputerStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const desktop = useDesktopState() as (ReturnType<typeof useDesktopState> & { permissions?: boolean }) | null;
  const ready = !!desktop?.permissions;
  const ask = () => { (window as Window & { webkit?: { messageHandlers?: { finoUI?: { postMessage: (v: unknown) => void } } } }).webkit?.messageHandlers?.finoUI?.postMessage({ action: 'setupComputer' }); };
  return (
    <section className="onb__step">
      <h1>{t('Let Fino use this Mac')}</h1>
      <p>{t('Your bots can open apps, browse in Chrome and type for you here. You stay in control: they ask first, and you can stop anytime with ⌘.')}</p>
      <div className={`onb__option${ready ? ' is-done' : ''}`}>
        <span className="onb__icon"><Laptop size={18} /></span>
        <div className="onb__option-text">
          <strong>{ready ? t('This Mac is ready') : t('Allow two macOS permissions')}</strong>
          <small>{ready ? (desktop?.connected ? t('Connected. Ask a bot to open an app.') : t('Press Connect at the top whenever you want a bot to use it.')) : t('Accessibility (to click and type) and Screen Recording (to see the screen). Fino guides you.')}</small>
        </div>
        {ready ? <span className="onb__check"><Check size={16} /></span> : <button type="button" className="onb__small" onClick={ask}>{t('Allow')}</button>}
      </div>
      <Nav onBack={onBack} onNext={onNext} nextLabel={ready ? t('Continue') : t('Maybe later')} />
    </section>
  );
}
