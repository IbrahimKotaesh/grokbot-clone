import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Laptop, LoaderCircle, Sparkles } from 'lucide-react';
import { t } from '../lib/i18n';
import { configApi } from '../lib/configApi';
import { isMacDesktop, useDesktopState } from '../lib/desktop';
import { useHostedModels } from '../lib/models';
import { useStore } from '../store';
import { ProviderLogo } from './ProviderLogo';

const DONE_KEY = 'fino.onboarded';
export const onboardingDone = () => { try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return true; } };
const markDone = () => { try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private window */ } };

type Step = 'brain' | 'computer';

/**
 * First-run setup on the web and in the Mac app: one screen to connect the AI that powers the bots
 * (your ChatGPT or Claude subscription), then straight into Fino. The Mac app also asks to use this
 * computer. Apps are connected later from Connect apps. It shows once per device.
 */
export function Onboarding({ onClose, requireAI = false }: { onClose: () => void; requireAI?: boolean }) {
  const mac = isMacDesktop();
  // One screen: connect your AI and you're in. The Mac app adds its computer permissions after it.
  const steps: Step[] = mac ? ['brain', 'computer'] : ['brain'];
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
              {step === 'brain' && <BrainStep onNext={next} required={requireAI} ready={aiReady} onReady={() => setAiConnected(true)} last={steps.length === 1} />}
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
      <button type="button" className="onb__primary" onClick={onNext} disabled={disabled}>{nextLabel ?? t('Continue')}</button>
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
        {(['orange', 'watermelon', 'olive', 'fig'] as const).map((f, i) => <span key={f} style={{ '--i': i } as CSSProperties}><img src={`/characters/fruits/${f}.webp`} alt="" /></span>)}
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
              <small>{t('Nothing to sign in to. DeepSeek, Qwen and GLM, included in your plan.')}</small>
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
