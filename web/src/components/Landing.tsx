import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { ArrowRight, Check, Download, Globe, Plus, X } from 'lucide-react';
import { AuthPanel } from './AuthPanel';
import { characterDataUri } from '../../../packages/contracts/src/characters';
import { JOBS } from '../../../packages/contracts/src/jobs';
import { lang, setLangChoice, t } from '../lib/i18n';
import '../styles/landing.css';
import { BlurWords, ScrollContainer } from '../lib/motion';

/** A section headline: words arrive out of a blur, and it fades away as it scrolls off the top. */
const Headline = ({ text }: { text: string }) => <BlurWords as="h2" className="lp-h2" when="view" fadeOut text={text} />;

/* The public front door for web visitors: what Fino is, a live demo, sign-up, and the Mac app. */

const FIRST_TASK = 'fino.firstTask';
const OFFER_MAC = 'fino.offerMac';
const store = {
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* private window */ } },
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  drop(key: string) { try { localStorage.removeItem(key); } catch { /* private window */ } },
};
/** The job typed on the landing page, handed once to the first chat after sign-in. */
export const firstTask = { peek: () => store.get(FIRST_TASK) ?? '', used: () => store.drop(FIRST_TASK) };

type Bot = { id: string; name: string; role: string; color: string; img: string; reply: string; match: RegExp };
// An example team. Every new account starts with Badr; people add the others themselves.
const TEAM: Bot[] = [
  { id: 'nour', name: 'Nour', role: 'Research', color: 'violet', img: characterDataUri('architect', 'violet'), reply: 'On it. I’ll open my browser, search, and come back with a shortlist.', match: /find|search|research|compare|flight|job|price|look up|best/i },
  { id: 'quinn', name: 'Badr', role: 'Chief of Staff', color: 'yellow', img: characterDataUri('accountant', 'yellow'), reply: 'Got it. I’ll take this on and hand parts to the right teammate.', match: /$^/ },
  { id: 'kai', name: 'Kai', role: 'Inbox', color: 'blue', img: characterDataUri('medic', 'blue'), reply: 'I’ll read your inbox, flag what matters, and draft replies for your OK.', match: /mail|inbox|repl|newsletter|unsubscribe/i },
  { id: 'sol', name: 'Sol', role: 'Planner', color: 'magenta', img: characterDataUri('florist', 'magenta'), reply: 'I’ll check your calendar and lay out the week, with time to breathe.', match: /plan|week|calendar|schedule|meeting|day|remind/i },
];
export function Landing({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: (mode: 'signin' | 'signup') => void }) {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const os = useOs();
  const start = (mode: 'signin' | 'signup' = 'signup') => {
    store.set(OFFER_MAC, '1');
    if (signedIn) { location.href = '/'; return; }
    onSignIn(mode);
  };
  const primary = os === 'windows' ? DOWNLOADS.windows : os === 'mac' ? DOWNLOADS.mac : null;

  return (
    <ScrollContainer value={root}>
    <div className="lp lp--v2" ref={root}>
      <header className="lp2-nav">
        <div className="lp-wrap lp2-nav__in">
          <a className="lp2-brand" href="/welcome" aria-label="Badr"><img src="/icons/badr-app.png" alt="" width={30} height={30} /><span>{t('Badr')}</span></a>
          <nav className="lp2-nav__links" aria-label={t('Main')}>
            <a href="#features">{t('Features')}</a>
            <a href="#jobs">{t('Bots')}</a>
            <a href="#plans">{t('Pricing')}</a>
            <a href="#download">{t('Download')}</a>
          </nav>
          <div className="lp2-nav__end">
            <LangSwitch />
            {signedIn
              ? <a className="lp2-btn lp2-btn--ghost" href="/">{t('Open Badr')}</a>
              : <button type="button" className="lp2-btn lp2-btn--ghost" onClick={() => start('signin')}>{t('Sign in')}</button>}
            <a className="lp2-btn lp2-btn--dark lp2-nav__dl" href="#download"><Download size={16} strokeWidth={2.4} aria-hidden />{t('Download')}</a>
          </div>
        </div>
      </header>

      <section className="lp2-hero">
        <div className="lp-wrap lp2-hero__in">
          <a className="lp2-note lp-in" style={{ '--d': '0ms' } as CSSProperties} href="#download">{t('New: Badr for Mac and Windows')} <ArrowRight size={14} strokeWidth={2.6} aria-hidden /></a>
          <h1 className="lp2-h1 lp-in" dir={lang === 'ar' ? 'rtl' : undefined} style={{ '--d': '80ms' } as CSSProperties}>
            <span>{t('Meet')}</span> <img src="/icons/badr-app-512.png" alt="" width={84} height={84} /> <span>{t('Badr')}</span>
          </h1>
          <p className="lp2-lede lp-in" style={{ '--d': '200ms' } as CSSProperties}>{t('AI teammates you can give real work to. They sign in to your tools, use their own computer, and come back with finished work.')}</p>
          <div className="lp2-ctas lp-in" style={{ '--d': '300ms' } as CSSProperties}>
            {primary
              ? <DownloadButton d={primary} big />
              : <button type="button" className="lp2-btn lp2-btn--dark lp2-btn--big" onClick={() => start('signup')}>{t(signedIn ? 'Open Badr' : 'Get started free')}</button>}
            {primary
              ? <button type="button" className="lp2-btn lp2-btn--soft lp2-btn--big" onClick={() => start('signup')}>{t(signedIn ? 'Open Badr' : 'Start free on the web')}</button>
              : <a className="lp2-btn lp2-btn--soft lp2-btn--big" href="#download">{t('Get the desktop app')}</a>}
          </div>
          <p className="lp2-also lp-in" style={{ '--d': '360ms' } as CSSProperties}>
            {t('Also on')}{' '}
            {os !== 'mac' && <a href="/api/download/mac" download>{t('Mac')}</a>}
            {os !== 'mac' && os !== 'windows' && ' · '}
            {os !== 'windows' && <a href="/api/download/windows" download>{t('Windows')}</a>}
            {' · '}<button type="button" onClick={() => start('signup')}>{t('Web')}</button>
          </p>
        </div>
        <AppWindow />
      </section>

      <Demo />

      <Features />

      <Jobs />

      <Plans onStart={() => start('signup')} signedIn={signedIn} />

      <Downloads os={os} onWeb={() => start('signup')} signedIn={signedIn} />

      <Faq />

      <section className="lp-close" id="start">
        <div className="lp-wrap lp-close__in">
          <div className="lp-close__copy" data-reveal>
            <h2 className="lp-h2">{t('Meet your first bot.')}</h2>
            <p className="lp-copy">{t('Create your account with Google or your email. Badr, your Chief of Staff, is waiting in the first chat.')}</p>
          </div>
          <div className="lp-close__panel" data-reveal style={{ '--i': 2 } as CSSProperties}>
            {signedIn ? <div className="auth"><h2 className="auth__title">{t('You’re signed in.')}</h2><a className="auth__submit" href="/">{t('Open Badr')}</a></div> : <AuthPanel initial="signup" />}
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot__in">
          <span className="lp-mark lp-mark--small"><img src="/icons/badr-app.png" alt="" width={24} height={24} /> {t('Badr')}</span>
          <nav aria-label={t('Legal')}><a href="#download">{t('Download')}</a><a href="/privacy.html">{t('Privacy')}</a><a href="/terms.html">{t('Terms')}</a><a href="/support.html">{t('Support')}</a><LangSwitch /></nav>
        </div>
      </footer>
    </div>
    </ScrollContainer>
  );
}

/* ---- Desktop downloads: which system the visitor is on, and a button for each app ---- */
type Os = 'mac' | 'windows' | 'other';
function useOs(): Os {
  const [os] = useState<Os>(() => {
    if (typeof navigator === 'undefined') return 'other';
    const ua = navigator.userAgent;
    if (/iPhone|iPad|Android/i.test(ua)) return 'other';
    if (/Windows/i.test(ua)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
    return 'other';
  });
  return os;
}
type Dl = { id: 'mac' | 'windows'; label: string; href: string; info: string; needs: string };
const DOWNLOADS: Record<'mac' | 'windows', Dl> = {
  mac: { id: 'mac', label: 'Download for macOS', href: '/api/download/mac', info: '/api/download/mac/info', needs: 'macOS 14 or later · Apple silicon' },
  windows: { id: 'windows', label: 'Download for Windows', href: '/api/download/windows', info: '/api/download/windows/info', needs: 'Windows 10 or 11 · 64-bit' },
};
const AppleLogo = () => <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M16.37 12.5c-.02-2.1 1.72-3.12 1.8-3.17-.98-1.43-2.5-1.63-3.05-1.65-1.3-.13-2.53.77-3.19.77-.66 0-1.67-.75-2.75-.73-1.41.02-2.72.82-3.45 2.09-1.47 2.55-.38 6.33 1.06 8.4.7 1.01 1.53 2.15 2.62 2.11 1.05-.04 1.45-.68 2.72-.68 1.27 0 1.63.68 2.74.66 1.13-.02 1.85-1.03 2.54-2.05.8-1.17 1.13-2.3 1.15-2.36-.03-.01-2.2-.84-2.22-3.39zM14.3 6.33c.58-.7.97-1.68.86-2.65-.83.03-1.84.55-2.44 1.25-.53.62-1 1.61-.88 2.56.93.07 1.88-.47 2.46-1.16z" /></svg>;
const WindowsLogo = () => <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M3 5.1l7.4-1v7.2H3V5.1zm8.4-1.2L21 2.5v8.8h-9.6V3.9zM3 12.6h7.4v7.3L3 18.9v-6.3zm8.4 0H21v8.9l-9.6-1.4v-7.5z" /></svg>;
function DownloadButton({ d, big = false }: { d: Dl; big?: boolean }) {
  return <a className={`lp2-btn lp2-btn--dark${big ? ' lp2-btn--big' : ''}`} href={d.href} download onClick={() => store.drop(OFFER_MAC)}>{d.id === 'mac' ? <AppleLogo /> : <WindowsLogo />}{t(d.label)}</a>;
}

/* ---- The app itself, as the hero picture: the team on the left, the chat, and a bot's own computer ---- */
function AppWindow() {
  return (
    <div className="lp-wrap lp2-window lp-in" style={{ '--d': '420ms' } as CSSProperties} aria-label={t('The Badr app: your team, a chat with Badr, and a bot working in its own browser')} role="img">
      <div className="lp2-window__bar"><i /><i /><i /><span>Badr</span></div>
      <div className="lp2-window__body">
        <aside className="lp2-window__team">
          <div className="lp2-window__chief"><img src={characterDataUri('accountant', 'yellow')} alt="" /><span><b>Badr</b><small>{t('Chief of Staff')}</small></span></div>
          <span className="lp2-window__label">{t('Team')}</span>
          {TEAM.filter((b) => b.id !== 'quinn').map((b, i) => (
            <div key={b.id} className={`lp2-window__bot${i === 0 ? ' is-on' : ''}`}><img src={b.img} alt="" /><span><b>{t(b.name)}</b><small>{t(b.role)}</small></span>{i === 0 && <em />}</div>
          ))}
        </aside>
        <div className="lp2-window__chat">
          <p className="lp2-msg lp2-msg--me">{t('Find three venues in Lisbon for our team offsite in March, under $3,000.')}</p>
          <p className="lp2-msg">{t('On it. I asked Nour to search while I check everyone’s calendar.')}</p>
          <p className="lp2-msg lp2-msg--from"><b>Nour</b>{t('Found 3 venues with free dates on 12–14 March. The best fit is $2,640 for two days, with a terrace.')}</p>
          <div className="lp2-ask"><span>{t('Waiting for your OK')}</span><b>{t('Ask the venue to hold 12–14 March')}</b><div><i>{t('Approve')}</i><i>{t('Not now')}</i></div></div>
          <div className="lp2-window__composer">{t('Message Badr…')}</div>
        </div>
        <div className="lp2-window__pc">
          <div className="lp2-window__url"><i />venues.example.com</div>
          <div className="lp2-window__page"><b /><span /><span /><span className="short" /><div className="lp2-window__cards"><em /><em /><em /></div></div>
          <span className="lp2-window__tag"><i />{t('Nour is working')}</span>
          <span className="lp-cursor lp-cursor--still" style={{ '--x': 0.62, '--y': 0.7 } as CSSProperties}><svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#1c1c1c" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg><i /></span>
        </div>
      </div>
    </div>
  );
}

/* ---- Everything you'd want in a teammate: six tiles, each with a small picture of it working ---- */
function Features() {
  const badr = characterDataUri('accountant', 'yellow');
  return (
    <section className="lp2-features" id="features">
      <div className="lp-wrap">
        <Headline text={t('Everything you’d want in a teammate.')} />
        <p className="lp-copy" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('Give each bot its own job, and add another when the work grows. They work in parallel, hand off to each other, and keep going day and night.')}</p>
        <div className="lp2-grid">
          <article className="lp2-tile" data-reveal style={{ '--i': 2 } as CSSProperties}>
            <h3>{t('Bots take initiative')}</h3><p>{t('They notice what needs doing and get started before you ask.')}</p>
            <div className="lp2-tile__art"><div className="lp2-mini-msg"><img src={badr} alt="" /><div><b>Badr <small>8:02</small></b>{t('Morning! Three invoices came in overnight. I checked them and drafted the replies.')}</div></div></div>
          </article>
          <article className="lp2-tile" data-reveal style={{ '--i': 3 } as CSSProperties}>
            <h3>{t('Every bot has its own computer')}</h3><p>{t('Sign a bot in once, and it uses your websites and apps the way you would.')}</p>
            <div className="lp2-tile__art"><div className="lp2-mini-pc"><div className="lp2-mini-pc__url">mail.example.com</div><span /><span /><span className="short" /><em className="lp-cursor lp-cursor--still" style={{ '--x': 0.7, '--y': 0.72 } as CSSProperties}><svg width="16" height="16" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#1c1c1c" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg></em></div></div>
          </article>
          <article className="lp2-tile" data-reveal style={{ '--i': 4 } as CSSProperties}>
            <h3>{t('You’re in control')}</h3><p>{t('Emails, posts and anything final wait for your OK. Badr never pays for you.')}</p>
            <div className="lp2-tile__art"><div className="lp2-ask lp2-ask--mini"><span>{t('Waiting for your OK')}</span><b>{t('Send the summary to the board')}</b><div><i>{t('Approve')}</i><i>{t('Not now')}</i></div></div></div>
          </article>
          <article className="lp2-tile" data-reveal style={{ '--i': 5 } as CSSProperties}>
            <h3>{t('Call Badr')}</h3><p>{t('Talk to your Chief of Staff like a phone call, in English or Arabic.')}</p>
            <div className="lp2-tile__art lp2-tile__art--call"><img src={badr} alt="" /><b>Badr</b><small>0:42</small><span className="lp2-call-end" aria-hidden /></div>
          </article>
          <article className="lp2-tile" data-reveal style={{ '--i': 6 } as CSSProperties}>
            <h3>{t('Routines on a schedule')}</h3><p>{t('“Every weekday at 8, send me the news.” It just happens.')}</p>
            <div className="lp2-tile__art"><ul className="lp2-mini-cal"><li><time>08:00</time>{t('Morning news digest')}</li><li><time>09:30</time>{t('Check new invoices')}</li><li><time>17:00</time>{t('Plan tomorrow')}</li></ul></div>
          </article>
          <article className="lp2-tile" data-reveal style={{ '--i': 7 } as CSSProperties}>
            <h3>{t('Works with your apps')}</h3><p>{t('Gmail, Calendar, Drive, Slack, Notion and hundreds more.')}</p>
            <div className="lp2-tile__art"><ul className="lp2-mini-apps">{[['Slack', '/assets/icons/slack.svg'], ['Notion', '/assets/apps/notion.png'], ['Docs', '/assets/apps/google-docs.png'], ['Sheets', '/assets/apps/google-sheets.png'], ['Dropbox', '/assets/apps/dropbox.png'], ['Linear', '/assets/apps/linear.png']].map(([n, src]) => <li key={n}><img src={src} alt={n} width={30} height={30} /></li>)}</ul></div>
          </article>
        </div>
      </div>
    </section>
  );
}

/* ---- Download Badr: one card per system ---- */
function Downloads({ os, onWeb, signedIn }: { os: Os; onWeb: () => void; signedIn: boolean }) {
  const [info, setInfo] = useState<Record<string, { available: boolean; bytes?: number }>>({});
  useEffect(() => {
    for (const d of Object.values(DOWNLOADS)) fetch(d.info).then((r) => r.json()).then((j) => setInfo((s) => ({ ...s, [d.id]: j }))).catch(() => setInfo((s) => ({ ...s, [d.id]: { available: false } })));
  }, []);
  const order: Dl[] = os === 'windows' ? [DOWNLOADS.windows, DOWNLOADS.mac] : [DOWNLOADS.mac, DOWNLOADS.windows];
  return (
    <section className="lp2-download" id="download">
      <div className="lp-wrap">
        <Headline text={t('Download Badr.')} />
        <p className="lp-copy" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('One team, wherever you are: on your desk, in your browser and in your pocket.')}</p>
        <div className="lp2-dl">
          {order.map((d, i) => {
            const ok = info[d.id]?.available !== false;
            const bytes = info[d.id]?.bytes;
            const size = bytes ? ` · ${(bytes / 1048576).toFixed(1)} MB` : '';
            return (
              <article key={d.id} className={`lp2-dl__card${os === d.id ? ' is-yours' : ''}`} data-reveal style={{ '--i': 2 + i } as CSSProperties}>
                <span className="lp2-dl__os">{d.id === 'mac' ? <AppleLogo /> : <WindowsLogo />}{d.id === 'mac' ? 'macOS' : 'Windows'}{os === d.id && <em>{t('Your computer')}</em>}</span>
                <p>{t(d.needs)}{size && <span dir="ltr">{size}</span>}</p>
                {ok ? <DownloadButton d={d} /> : <span className="lp2-btn lp2-btn--soft" aria-disabled="true">{t('Coming soon')}</span>}
                <small>{d.id === 'mac' ? t('Open the download and move Badr to Applications. The first time, if macOS can’t check it, open System Settings → Privacy & Security and choose Open Anyway.') : t('Run the installer. If Windows shows “Windows protected your PC”, choose More info → Run anyway.')}</small>
              </article>
            );
          })}
          <article className="lp2-dl__card" data-reveal style={{ '--i': 4 } as CSSProperties}>
            <span className="lp2-dl__os"><Globe size={17} strokeWidth={2.2} aria-hidden />{t('Web')}</span>
            <p>{t('Any browser, nothing to install')}</p>
            <button type="button" className="lp2-btn lp2-btn--soft" onClick={onWeb}>{t(signedIn ? 'Open Badr' : 'Start on the web')}</button>
            <small>{t('Everything you do on the web is there in the apps too.')}</small>
          </article>
        </div>
      </div>
    </section>
  );
}

/* ---- Questions people ask before they start ---- */
const FAQ: [string, string][] = [
  ['How is Badr different from a chat assistant?', 'A chat assistant answers you. Badr’s bots do the work: each one has a job, its own computer and access to the apps you connect, and they keep going while you’re away.'],
  ['Do I need my own AI account?', 'No. Badr’s own AI models are included in every plan. If you already pay for ChatGPT or Claude, you can connect it too.'],
  ['Can bots do things without asking me?', 'They read and prepare on their own. Anything that sends, posts, deletes or is final waits for your OK, and Badr never pays for you.'],
  ['What does “its own computer” mean?', 'Each bot works in a cloud computer with a real browser. You can watch every move it makes and take over at any time.'],
  ['Which languages does Badr speak?', 'English, Arabic and Dutch, in writing and on calls. It answers in the language you write in.'],
  ['How much does it cost?', 'Plans start at $14.99 a month, and you can try any plan free for one day. Cancel anytime.'],
];
function Faq() {
  return (
    <section className="lp2-faq" id="faq">
      <div className="lp-wrap lp2-faq__in">
        <Headline text={t('Questions')} />
        <div className="lp2-faq__list" data-reveal style={{ '--i': 1 } as CSSProperties}>
          {FAQ.map(([q, a]) => <details key={q}><summary>{t(q)}<Plus size={18} strokeWidth={2.4} aria-hidden /></summary><p>{t(a)}</p></details>)}
        </div>
      </div>
    </section>
  );
}

type Msg = { id: number; who: 'me' | 'bot' | 'step'; text: string };
const RESULTS = ['Financial Analyst · fintech scale-up', 'FP&A Analyst · logistics group', 'Junior Financial Analyst · bank', 'Investment Analyst · climate fund', 'Business Analyst, Finance · retail'];
const FINAL: Msg[] = [
  { id: 1, who: 'me', text: 'Find financial analyst jobs in Amsterdam and shortlist five.' },
  { id: 2, who: 'bot', text: 'Opening a jobs site in my browser.' },
  { id: 3, who: 'step', text: 'Typed “financial analyst”' },
  { id: 4, who: 'step', text: 'Typed “Amsterdam” and searched' },
  { id: 5, who: 'bot', text: 'Here are five that fit. Two are hybrid, one is in English only. Save them to a sheet?' },
];

function Demo() {
  const ref = useRef<HTMLElement>(null);
  const site = useRef<HTMLDivElement>(null);
  const job = useRef<HTMLDivElement>(null);
  const city = useRef<HTMLDivElement>(null);
  const go = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const [jobText, setJobText] = useState('');
  const [cityText, setCityText] = useState('');
  const [focus, setFocus] = useState<'job' | 'city' | null>(null);
  const [cursor, setCursor] = useState({ x: 0.72, y: 0.82, click: 0 });
  const [pressed, setPressed] = useState(false);
  const [results, setResults] = useState(false);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting), { threshold: 0.3 });
    io.observe(el); return () => io.disconnect();
  }, []);

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setMsgs(FINAL); setJobText('financial analyst'); setCityText('Amsterdam'); setResults(true); return; }
    if (!live) return;
    let stop = false;
    const wait = (ms: number) => new Promise<void>((res, rej) => setTimeout(() => (stop ? rej(new Error('stop')) : res()), ms));
    // Cursor targets are measured from the real fields, as a share of the browser page.
    const aim = (el: HTMLElement | null, fx = 0.62, fy = 0.55) => {
      const box = site.current; if (!el || !box) return;
      setCursor((c) => ({ ...c, x: (el.offsetLeft + el.offsetWidth * fx) / box.clientWidth, y: (el.offsetTop + el.offsetHeight * fy) / box.clientHeight }));
    };
    const click = () => setCursor((c) => ({ ...c, click: c.click + 1 }));
    const type = async (text: string, set: (v: string) => void) => {
      for (let i = 1; i <= text.length; i++) { set(text.slice(0, i)); await wait(48 + Math.random() * 46); }
    };
    const say = async (m: Msg) => { setThinking(true); await wait(850); setThinking(false); setMsgs((l) => [...l, m]); };
    (async () => {
      while (!stop) {
        setFade(false); setMsgs([]); setJobText(''); setCityText(''); setResults(false); setFocus(null); setPressed(false);
        setCursor((c) => ({ ...c, x: 0.74, y: 0.86 }));
        await wait(700);
        setMsgs([FINAL[0]]); await wait(500);
        await say(FINAL[1]); await wait(300);
        aim(job.current); await wait(850); click(); setFocus('job'); await wait(220);
        await type('financial analyst', setJobText); setMsgs((l) => [...l, FINAL[2]]); await wait(350);
        aim(city.current); await wait(800); click(); setFocus('city'); await wait(220);
        await type('Amsterdam', setCityText); setFocus(null); await wait(300);
        aim(go.current, 0.5); await wait(780); click(); setPressed(true); await wait(170); setPressed(false);
        setMsgs((l) => [...l, FINAL[3]]); await wait(450);
        setResults(true); await wait(700);
        setCursor((c) => ({ ...c, x: 0.8, y: 0.9 }));
        await say(FINAL[4]);
        await wait(4200);
        setFade(true); await wait(600);
      }
    })().catch(() => {});
    return () => { stop = true; };
  }, [live]);

  return (
    <section className="lp-demo" id="demo" ref={ref}>
      <div className="lp-wrap">
        <Headline text={t('Watch it work.')} />
        <p className="lp-copy" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('Ask in chat. The bot opens its own browser, and you see every move it makes.')}</p>
      </div>
      {/* Fading is a data attribute, not a class: a changing className would wipe the reveal's is-in class and hide the demo. */}
      <div className="lp-desk" data-fading={fade || undefined} data-reveal style={{ '--i': 2 } as CSSProperties} aria-label={t('Demo: a bot searching a jobs site in its browser')}>
        <div className="lp-desk__chat">
          <div className="lp-desk__head"><img src={TEAM[0].img} alt="" width={28} height={28} /> {t('Nour')} <span>{t('Research')}</span></div>
          <div className="lp-msgs">
            {msgs.map((m) => <p key={m.id} className={m.who === 'me' ? 'lp-msg lp-msg--me' : m.who === 'bot' ? 'lp-msg' : 'lp-step'}>{t(m.text)}</p>)}
            {thinking && <p className="lp-msg lp-typing" aria-label={t('Nour is typing')}><i /><i /><i /></p>}
          </div>
          <div className="lp-desk__composer">{t('Message Nour…')}</div>
        </div>
        <div className="lp-desk__browser">
          <div className="lp-desk__bar"><i /><i /><i /><span>jobs.example.com</span><em><b className="lp-live-dot" />{t('Bot connected')}</em></div>
          <div className="lp-site" ref={site}>
            <div className="lp-site__brand">jobboard</div>
            <div ref={job} className={`lp-site__field${focus === 'job' ? ' is-focus' : ''}`}>{jobText || <span>{t('Job title or keyword')}</span>}{focus === 'job' && <b className="lp-caret" />}</div>
            <div ref={city} className={`lp-site__field${focus === 'city' ? ' is-focus' : ''}`}>{cityText || <span>{t('City')}</span>}{focus === 'city' && <b className="lp-caret" />}</div>
            <div ref={go} className={`lp-site__search${pressed ? ' is-pressed' : ''}`}>{t('Search jobs')}</div>
            <ul className={`lp-site__results${results ? ' is-in' : ''}`}>
              {RESULTS.map((r, i) => <li key={r} style={{ transitionDelay: results ? `${i * 90}ms` : '0ms' }}><b>{t(r.split(' · ')[0])}</b><span>{t(r.split(' · ')[1])} · Amsterdam</span></li>)}
            </ul>
            <span className="lp-cursor" aria-hidden style={{ '--x': cursor.x, '--y': cursor.y } as CSSProperties}>
              <i key={cursor.click} className={cursor.click ? 'is-click' : ''} />
              <svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#1c1c1c" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            </span>
          </div>
        </div>
        <span className="lp-desk__tag">{t('Demo')}</span>
      </div>
    </section>
  );
}

/** Below-the-fold blocks rise in once as they scroll into view; everything stays visible without JavaScript. */
function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current; if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.add('lp--reveal');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { root: el, rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    el.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [root]);
}

/** Shown once inside the web workspace after signing up from the landing page: the desktop app for this computer. */
export function MacOffer() {
  const os = useOs();
  const [show, setShow] = useState(() => store.get(OFFER_MAC) === '1');
  if (!show || os === 'other') return null;
  const d = DOWNLOADS[os];
  const close = () => { store.drop(OFFER_MAC); setShow(false); };
  return (
    <aside className="mac-offer" role="status">
      <img src="/icons/badr-app.png" alt="" width={44} height={44} />
      <div><b>{t(os === 'windows' ? 'Get Badr for Windows' : 'Get Badr for Mac')}</b><span>{t('Your team in its own window, always one click away.')}</span></div>
      <a className="mac-offer__dl" href={d.href} download onClick={close}><Download size={16} aria-hidden /> {t('Download')}</a>
      <button type="button" className="mac-offer__x" onClick={close} aria-label={t('Not now')}><X size={16} /></button>
    </aside>
  );
}

// The real plans (server/src/plans.ts): the smallest one that fits the number of roles.
const PLAN_BY_ID = {
  starter: { name: 'Starter', price: 14.99, bots: 'Badr + 5 bots', hours: 3, lines: ['Ready-to-work bots with superpowers', 'Their own computer · 3 h a month', 'Use your own Claude Code and ChatGPT'] },
  pro: { name: 'Pro', price: 49.99, bots: 'Badr + 15 bots', hours: 20, lines: ['Everything in Starter, plus', 'Their own computer · 20 h a month', 'Every marketplace bot', 'Stronger AI models included'] },
  max: { name: 'Max', price: 99.99, bots: 'Badr + 40 bots', hours: 60, lines: ['Everything in Pro, plus', 'Their own computer · 60 h a month', 'Top AI models included', 'Priority support'] },
  ultra: { name: 'Ultra', price: 199.99, bots: 'Unlimited bots', hours: 150, lines: ['Everything in Max, plus', 'Their own computer · 150 h a month', 'Early access to new features'] },
} as const;
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}`;

/* ---- A job for each bot: what it reports, and what it waits for you to approve ---- */
type JobStory = { runs: string; uses: string; says: string[]; waits: string; done: string };
const STORIES: Record<string, JobStory> = {
  finance: { runs: 'Every weekday at 8:30', uses: 'Gmail, Sheets', says: ['The month-end close is nearly done. Two expenses have no receipt, and marketing is 12% over budget.', 'I wrote the one-page summary for the board.'], waits: 'Send the summary to the board', done: 'Sent. I’ll chase the two missing receipts tomorrow morning.' },
  payables: { runs: 'Mondays at 9:00', uses: 'Gmail, Drive', says: ['Six invoices came in this week. The one from Northwind is a copy of #1042, so I set it aside.', 'The other five are checked and lined up: $8,240 in total.'], waits: 'Mark the five as ready for you to pay', done: 'Done. They’re in your payments list. Fino never pays; you do that yourself.' },
  cashier: { runs: 'Every night at 23:00', uses: 'Sheets', says: ['Today: 143 sales, $4,312. The till was $20 short after the evening shift.', 'The sales sheet is up to date.'], waits: 'Message the shift lead about the $20', done: 'Sent, kindly. I’ll tell you what they say.' },
  hr: { runs: 'When someone applies', uses: 'Gmail, Calendar', says: ['Twelve people applied for the barista job. Four fit, and two can work weekends.', 'I drafted interview invites for Thursday afternoon.'], waits: 'Send the four interview invites', done: 'Sent. Three have already picked a time.' },
  travel: { runs: 'When you ask', uses: 'Browser, Calendar', says: ['Lisbon, 12 to 15 March: a direct flight at 8:40 for $186, and a hotel near the office at $132 a night.', 'The full plan is in your Drive.'], waits: 'Fill in the booking for you to pay', done: 'Everything is filled in. The last step, paying, is yours.' },
  data: { runs: 'Every morning at 7:00', uses: 'Sheets, Browser', says: ['The sales dashboard was stuck since Monday: the export renamed a column.', 'I fixed the import and refreshed the numbers.'], waits: 'Replace the shared sheet with the fixed one', done: 'Replaced. The team sees today’s numbers now.' },
};

function Jobs() {
  const [pick, setPick] = useState(JOBS[0].id);
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const job = JOBS.find((j) => j.id === pick) ?? JOBS[0];
  const story = STORIES[job.id];
  const img = characterDataUri(job.character, job.color);
  return (
    <section className="lp-jobs" id="jobs">
      <div className="lp-wrap">
        <Headline text={t('Give each bot a job worth doing.')} />
        <p className="lp-copy" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('Pick a job to see what its bot tells you, and what it waits for you to approve.')}</p>
        <div className="lp-jobs__in" data-reveal style={{ '--i': 2 } as CSSProperties}>
          <div className="lp-jobs__list" role="tablist" aria-label={t('Jobs')}>
            {JOBS.map((j) => (
              <button key={j.id} type="button" role="tab" id={`lp-tab-${j.id}`} aria-selected={j.id === pick} aria-controls="lp-job-panel" onClick={() => setPick(j.id)}>
                <img src={characterDataUri(j.character, j.color)} alt="" width={40} height={40} draggable={false} />
                <span><b>{t(j.title)}</b><small>{t(j.blurb)}</small></span>
              </button>
            ))}
          </div>
          {story && (
            <div className="lp-jobs__chat" role="tabpanel" id="lp-job-panel" aria-labelledby={`lp-tab-${job.id}`} key={job.id}>
              <div className="lp-jobs__head">
                <img src={img} alt="" width={44} height={44} draggable={false} />
                <div><b>{t(job.name)}</b><span>{t(job.title)}</span></div>
                <dl><div><dt>{t('Runs')}</dt><dd>{t(story.runs)}</dd></div><div><dt>{t('Uses')}</dt><dd>{t(story.uses)}</dd></div></dl>
              </div>
              <div className="lp-jobs__msgs">
                {story.says.map((line, i) => <p key={i} className="lp-msg" style={{ '--i': i } as CSSProperties}>{t(line)}</p>)}
                {ok[job.id]
                  ? <><p className="lp-msg lp-msg--me">{t('Approved')}</p><p className="lp-msg">{t(story.done)}</p></>
                  : <div className="lp-ask" style={{ '--i': story.says.length } as CSSProperties}>
                      <span>{t('Waiting for your OK')}</span>
                      <b>{t(story.waits)}</b>
                      <div><button type="button" className="lp-ask__yes" onClick={() => setOk((o) => ({ ...o, [job.id]: true }))}><Check size={16} strokeWidth={2.6} aria-hidden /> {t('Approve')}</button><button type="button" className="lp-ask__no" onClick={() => setPick(JOBS[(JOBS.indexOf(job) + 1) % JOBS.length].id)}>{t('Not now')}</button></div>
                    </div>}
              </div>
              <span className="lp-desk__tag">{t('Example')}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---- Plans ---- */
function Plans({ onStart, signedIn }: { onStart: () => void; signedIn: boolean }) {
  const list = [PLAN_BY_ID.starter, PLAN_BY_ID.pro, PLAN_BY_ID.max];
  return (
    <section className="lp-plans" id="plans">
      <div className="lp-wrap">
        <Headline text={t('Simple plans. No hiring.')} />
        <p className="lp-copy" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('Every plan includes Badr, Fino’s own AI models and the safety rules. Prices in US dollars a month; cancel anytime.')}</p>
        <ul className="lp-plans__row">
          {list.map((p, i) => (
            <li key={p.name} className={p.name === 'Max' ? 'is-pick' : ''} data-reveal style={{ '--i': 2 + i } as CSSProperties}>
              <b>{p.name}</b>
              {p.name === 'Max' && <em>{t('Most teams')}</em>}
              <strong>{usd(p.price)}<small>{t('/month')}</small></strong>
              <span className="lp-plans__bots">{t(p.bots)}</span>
              <ul>{p.lines.map((l) => l.startsWith('Everything in ') ? <li key={l} className="lp-plans__plus">{t(l)}</li> : <li key={l}><Check size={15} strokeWidth={2.6} aria-hidden />{t(l)}</li>)}</ul>
              <button type="button" className={`lp-pill ${p.name === 'Max' ? 'lp-pill--blue' : 'lp-pill--line'}`} onClick={onStart}>{signedIn ? t('Open Fino') : t('Start with {plan}', { plan: p.name })}</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** English or Dutch for the public page; the app follows the same choice. */
const LANGS = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'nl', label: 'Nederlands', short: 'NL' },
  { code: 'ar', label: 'العربية', short: 'عربي' },
] as const;
/** The language picker: a pill showing the current language over a native select (a real picker on phones). */
function LangSwitch() {
  const now = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  return (
    <label className="lp-lang">
      <Globe size={15} strokeWidth={2.4} aria-hidden />
      <span className="lp-lang__long" aria-hidden>{now.label}</span><span className="lp-lang__short" aria-hidden>{now.short}</span>
      <select value={now.code} aria-label={t('Language')} onChange={(e) => setLangChoice(e.target.value as 'en' | 'nl' | 'ar')}>
        {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}
