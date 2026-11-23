import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, ExternalLink, Laptop, LoaderCircle, Sparkles } from 'lucide-react';
import { t } from '../lib/i18n';
import { api, openPopup } from '../lib/api';
import { configApi } from '../lib/configApi';
import { isMacDesktop, useDesktopState } from '../lib/desktop';
import { useHostedModels } from '../lib/models';
import { useStore } from '../store';
import { ProviderLogo } from './ProviderLogo';

const DONE_KEY = 'fino.onboarded';
export const onboardingDone = () => { try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return true; } };
const markDone = () => { try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private window */ } };

/** The first apps people connect; the rest live in Connect apps. */
const STARTER_APPS: { slug: string; name: string }[] = [
  { slug: 'gmail', name: 'Gmail' },
  { slug: 'googlecalendar', name: 'Google Calendar' },
  { slug: 'googledrive', name: 'Google Drive' },
  { slug: 'googlesheets', name: 'Google Sheets' },
  { slug: 'slack', name: 'Slack' },
  { slug: 'notion', name: 'Notion' },
];

type Step = 'welcome' | 'brain' | 'apps' | 'computer' | 'done';

/**
 * First-run setup on the web and in the Mac app: pick the AI that powers the bots (your ChatGPT
 * subscription, or Fino's included models), connect everyday apps, and on the Mac let Fino use this
 * computer. Every step can be skipped; it shows once per device.
 */
export function Onboarding({ onClose, requireAI = false }: { onClose: () => void; requireAI?: boolean }) {
  const mac = isMacDesktop();
  const steps: Step[] = mac ? ['welcome', 'brain', 'apps', 'computer', 'done'] : ['welcome', 'brain', 'apps', 'done'];
  const [step, setStep] = useState<Step>('welcome');
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [closing, setClosing] = useState(false);
  const index = steps.indexOf(step);
  const next = () => { setDir('fwd'); setStep(steps[Math.min(steps.length - 1, index + 1)]); };
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
          <div className="onb__progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1} aria-label={t('Setup progress')}><i style={{ transform: `scaleX(${(index + 1) / steps.length})` }} /></div>
          {step !== 'done' && aiReady && <button type="button" className="onb__skip" onClick={finish}>{t('Skip setup')}</button>}
        </div>
        <div className="onb__viewport" style={{ height }}>
          <div ref={inner}>
            <div key={step} className={`onb__stage onb__stage--${dir}`}>
              {step === 'welcome' && (
                <section className="onb__step onb__step--center">
                  <div className="onb__team" aria-hidden="true">
                    {(['orange', 'watermelon', 'olive', 'fig'] as const).map((f, i) => <span key={f} style={{ '--i': i } as CSSProperties}><img src={`/characters/fruits/${f}.webp`} alt="" /></span>)}
                  </div>
                  <h1>{t('Meet your AI team')}</h1>
                  <p>{t('Your bots read your email, research, plan your day and get work done for you. A few quick steps and you are ready.')}</p>
                  <button type="button" className="onb__primary" onClick={next}>{t('Get started')}</button>
                </section>
              )}
              {step === 'brain' && <BrainStep onNext={next} onBack={back} required={requireAI} ready={aiReady} onReady={() => setAiConnected(true)} />}
              {step === 'apps' && <AppsStep onNext={next} onBack={back} />}
              {step === 'computer' && <ComputerStep onNext={next} onBack={back} />}
              {step === 'done' && (
                <section className="onb__step onb__step--center">
                  <svg className="onb__tick" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="36" /><path d="M25 41.5l10 10 20-22" /></svg>
                  <h1>{t('You’re all set')}</h1>
                  <p>{t('Say hi to Quinn, your Chief of Staff. Ask for anything; Quinn can hand work to the rest of the team.')}</p>
                  <button type="button" className="onb__primary" onClick={finish}>{t('Start chatting')}</button>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel, disabled }: { onBack: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean }) {
  return (
    <div className="onb__nav">
      <button type="button" className="onb__ghost" onClick={onBack}>{t('Back')}</button>
      <button type="button" className="onb__primary" onClick={onNext} disabled={disabled}>{nextLabel ?? t('Continue')}</button>
    </div>
  );
}

/** Step 2: your own ChatGPT subscription (signed in with a one-time code), or Fino's included models. */
function BrainStep({ onNext, onBack, required, ready, onReady }: { onNext: () => void; onBack: () => void; required: boolean; ready: boolean; onReady: () => void }) {
  const hosted = useHostedModels();
  const bots = useStore((s) => s.bots);
  const [chatgpt, setChatgpt] = useState<'unknown' | 'connected' | 'idle' | 'waiting' | 'error'>('unknown');
  const [login, setLogin] = useState<{ url: string; code: string; id: string } | null>(null);
  const [error, setError] = useState('');
  const [included, setIncluded] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    fetch('/api/credentials', { credentials: 'include' }).then((r) => r.json())
      .then((r: { credentials: { provider: string; connected: boolean }[]; sharedLogin: boolean }) =>
        { const ok = r.sharedLogin || r.credentials.some((c) => c.connected && (c.provider === 'chatgpt' || c.provider === 'openai')); setChatgpt(ok ? 'connected' : 'idle'); if (ok) onReady(); })
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
      window.open(d.url, '_blank', 'noopener');
      timer.current = setInterval(async () => {
        const s = await fetch(`/api/credentials/chatgpt/status/${d.loginId}`, { credentials: 'include' }).then((x) => x.json()).catch(() => null);
        if (s?.state === 'connected') { clearInterval(timer.current); setChatgpt('connected'); setLogin(null); useAllBots('codex'); onReady(); }
        else if (s?.state === 'failed' || s?.state === 'expired') { clearInterval(timer.current); setChatgpt('error'); setError(s.error ?? t('Sign-in didn’t finish. Try again.')); }
      }, 2500);
    } catch (e) { setChatgpt('error'); setError((e as Error).message); }
  };

  const useAllBots = useCallback((agentProvider: 'codex' | 'openrouter') => {
    for (const b of bots) if (b.kind !== 'room') void configApi.updateBot(b.id, { agentProvider, model: '' }).then(({ bot }) => useStore.setState((st) => ({ bots: st.bots.map((x) => (x.id === bot.id ? bot : x)) }))).catch(() => {});
  }, [bots]);

  return (
    <section className="onb__step">
      <h1>{required ? t('Connect your AI') : t('Choose your AI')}</h1>
      <p>{required ? t('Your bots think with your own ChatGPT account. Connect it once and your team is ready.') : t('Your bots think with the AI you pick. You can change it per bot anytime.')}</p>
      <div className="onb__options">
        <div className={`onb__option${chatgpt === 'connected' ? ' is-done' : ''}`}>
          <ProviderLogo provider="codex" />
          <div className="onb__option-text">
            <strong>{t('Use my ChatGPT subscription')}</strong>
            <small>{chatgpt === 'connected' ? t('Connected. Your bots use ChatGPT.') : t('Plus or Pro. Sign in once with a short code.')}</small>
            {login && (
              <div className="onb__code">
                <span>{t('Enter this code on the ChatGPT page:')}</span>
                <code>{login.code}</code>
                <a href={login.url} target="_blank" rel="noreferrer noopener">{t('Open ChatGPT')} <ExternalLink size={12} /></a>
              </div>
            )}
          </div>
          {chatgpt === 'connected' ? <span className="onb__check"><Check size={16} /></span>
            : chatgpt === 'waiting' ? <LoaderCircle size={18} className="dictation__spinner" />
            : <button type="button" className="onb__small" disabled={chatgpt === 'unknown'} onClick={() => void startChatgpt()}>{t('Connect')}</button>}
        </div>

        {!required && <div className="onb__option">
          <ProviderLogo provider="claude" />
          <div className="onb__option-text">
            <strong>{t('Use my Claude subscription')}</strong>
            <small>{t('Pick Claude Code for any bot from its model menu.')}</small>
          </div>
        </div>}

        {hosted?.available && (
          <div className={`onb__option${included ? ' is-done' : ''}`}>
            <span className="onb__icon"><Sparkles size={18} /></span>
            <div className="onb__option-text">
              <strong>{t('No subscription? Use Fino’s included models')}</strong>
              <small>{t('DeepSeek, Qwen and GLM, part of your plan. Nothing to sign in to.')}</small>
            </div>
            {included ? <span className="onb__check"><Check size={16} /></span>
              : <button type="button" className="onb__small" onClick={() => { useAllBots('openrouter'); setIncluded(true); onReady(); }}>{t('Use these')}</button>}
          </div>
        )}
      </div>
      {error && <div className="onb__error" role="alert">{error}</div>}
      <Nav onBack={onBack} onNext={onNext} disabled={!ready} nextLabel={!ready ? t('Connect ChatGPT to continue') : undefined} />
    </section>
  );
}

/** Step 3: connect everyday apps through Composio; ticks appear as each connection lands. */
function AppsStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [connected, setConnected] = useState<string[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { api.apps().then((r) => { setConnected(r.connected); setConfigured(r.configured !== false); }).catch(() => setConnected([])); }, []);
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, [load]);

  const connect = async (slug: string) => {
    setBusy(slug);
    const popup = openPopup('about:blank');
    try { const { redirectUrl } = await api.connect(slug); if (popup) popup.location.href = redirectUrl; else window.open(redirectUrl, '_blank'); }
    catch { popup?.close(); }
    finally { setBusy(null); }
  };

  return (
    <section className="onb__step">
      <h1>{t('Connect your apps')}</h1>
      <p>{t('So your bots can read and act in your email, calendar and files. They ask before changing anything.')}</p>
      {!configured ? <div className="onb__error">{t('App connections need setup on this server.')}</div> : (
        <div className="onb__apps">
          {STARTER_APPS.map((a) => {
            const on = connected?.includes(a.slug);
            return (
              <button key={a.slug} type="button" className={`onb__app${on ? ' is-done' : ''}`} disabled={on || busy === a.slug} onClick={() => void connect(a.slug)}>
                <img src={`https://logos.composio.dev/api/${a.slug}`} alt="" width={24} height={24} />
                <span>{a.name}</span>
                {on ? <span className="onb__check"><Check size={14} /></span> : busy === a.slug ? <LoaderCircle size={14} className="dictation__spinner" /> : <small>{t('Connect')}</small>}
              </button>
            );
          })}
        </div>
      )}
      <button type="button" className="onb__link" onClick={() => useStore.getState().setModal('apps')}>{t('See all apps')}</button>
      <Nav onBack={onBack} onNext={onNext} />
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
