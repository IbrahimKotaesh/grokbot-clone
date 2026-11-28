import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Download, Eye, Globe, Hand, Minus, Plus, Search, ShieldCheck, X } from 'lucide-react';
import { characterDataUri } from '../../../packages/contracts/src/characters';
import { JOBS } from '../../../packages/contracts/src/jobs';
import { lang, setLangChoice, t } from '../lib/i18n';
import '../styles/auth.css';
import '../styles/landing.css';

/* The public front door for web visitors. Look: a quiet white page, near-black ink and grey reading text, one big
   medium-weight sans, black and warm-grey pill buttons, soft off-white cards with 24px corners, and an app window
   under the headline. Everything fades up as it arrives. */

const FIRST_TASK = 'fino.firstTask';
const OFFER_MAC = 'fino.offerMac';
const store = {
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* private window */ } },
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  drop(key: string) { try { localStorage.removeItem(key); } catch { /* private window */ } },
};
/** The job typed on the landing page, handed once to the first chat after sign-in. */
export const firstTask = { peek: () => store.get(FIRST_TASK) ?? '', used: () => store.drop(FIRST_TASK) };

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ar = lang === 'ar';
/** Arabic headlines and lines run right to left; the page layout itself never flips. */
const rtl = ar ? 'rtl' : undefined;

// Badr, the main character, is the logo.
const MARK = characterDataUri('accountant', 'yellow');
const NOUR = characterDataUri('architect', 'violet');
const KAI = characterDataUri('medic', 'blue');
const SOL = characterDataUri('florist', 'magenta');

export function Landing({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: (mode: 'signin' | 'signup') => void }) {
  const root = useRef<HTMLDivElement>(null);
  const os = useOs();
  useReveal(root);
  const start = (mode: 'signin' | 'signup' = 'signup') => {
    store.set(OFFER_MAC, '1');
    if (signedIn) { location.href = '/'; return; }
    onSignIn(mode);
  };
  const open = signedIn ? t('Open Fino') : t('Get started');

  return (
    <div className="lp" ref={root}>
      <header className="lp-top">
        <nav className="lp-nav lp-wrap" aria-label="Badr">
          <a className="lp-mark" href="/welcome" aria-label="Badr"><img src={MARK} alt="" width={28} height={28} /><span>{t('Badr')}</span></a>
          <div className="lp-nav__links">
            <a href="#demo">{t('See it work')}</a>
            <a href="#plans">{t('Plans')}</a>
            <a href="#download">{t('Download')}</a>
            <a href="#faq">{t('Questions')}</a>
          </div>
          <div className="lp-nav__end">
            <LangSwitch />
            {!signedIn && <button type="button" className="lp-btn lp-btn--sm lp-btn--soft lp-nav__signin" onClick={() => start('signin')}>{t('Sign in')}</button>}
            <button type="button" className="lp-btn lp-btn--sm" onClick={() => start('signup')}>{open}</button>
          </div>
        </nav>
      </header>

      <section className="lp-hero">
        <a className="lp-news lp-in" href="#download" style={{ '--d': '0ms' } as CSSProperties}>
          <span dir={rtl}>{t('Badr for Mac and Windows.')}</span> <span className="lp-news__go">{t('Download')}</span>
          <i aria-hidden><ArrowUpRight size={12} strokeWidth={2.2} /></i>
        </a>
        <h1 className="lp-h1 lp-in" dir={rtl} style={{ '--d': '80ms' } as CSSProperties}>
          {t('Meet')} <img src={MARK} alt="" width={64} height={64} draggable={false} /> {t('Badr')}
        </h1>
        <p className="lp-lede lp-in" style={{ '--d': '160ms' } as CSSProperties}>{t('Badr is your Chief of Staff. Give it a job by text or by voice, and Badr and its team get it done on their own computers, around the clock.')}</p>
        <div className="lp-cta lp-in" style={{ '--d': '240ms' } as CSSProperties}>
          {os === 'other' || signedIn
            ? <><button type="button" className="lp-btn" onClick={() => start('signup')}>{open}</button>
              {!signedIn && <button type="button" className="lp-btn lp-btn--soft" onClick={() => start('signin')}>{t('Sign in')}</button>}</>
            : <><a className="lp-btn" href={os === 'mac' ? '/api/download/mac/dmg' : DOWNLOADS.windows.href} download onClick={() => store.drop(OFFER_MAC)}>
                {os === 'mac' ? <AppleLogo /> : <WindowsLogo />}{t(DOWNLOADS[os].label)}
              </a>
              <button type="button" className="lp-btn lp-btn--soft" onClick={() => start('signup')}>{open}</button></>}
        </div>
        <HeroWindow />
      </section>

      <section className="lp-team">
        <div className="lp-wrap lp-split">
          <h2 className="lp-h2 lp-h2--xl" data-reveal dir={rtl}>{t('Meet your team')}</h2>
          <div data-reveal style={{ '--i': 1 } as CSSProperties}>
            <p className="lp-body">{t('Fino bots have a name, a memory and their own computer. Tell them what you need, by text or by voice, and they get to work around the clock. Plans start at less a month than an assistant earns in a day.')}</p>
            <p className="lp-body">{t('Each one learns how you like things done, and checks with you before anything final.')}</p>
          </div>
        </div>
        <div className="lp-wrap lp-faces" aria-hidden>
          {JOBS.slice(0, 6).map((j, i) => (
            <img key={j.id} src={characterDataUri(j.character, j.color)} alt="" width={120} height={120} draggable={false} data-reveal style={{ '--i': i + 2 } as CSSProperties} />
          ))}
        </div>
      </section>

      <Demo />

      <section className="lp-charge">
        <div className="lp-wrap">
          <h2 className="lp-h2 lp-center" data-reveal dir={rtl}>{t('You stay in charge.')}</h2>
          <div className="lp-cards">
            <article className="lp-card" data-reveal style={{ '--i': 1 } as CSSProperties}>
              <h3 dir={rtl}><Eye size={18} aria-hidden /> {t('Watch it live.')}</h3>
              <p>{t('Every click the bot makes shows up on screen, cursor and all.')}</p>
              <div className="lp-card__art">
                <div className="lp-mini">
                  <div className="lp-mini__bar"><i /><i /><i /><span>jobs.example.com</span><em><b className="lp-live-dot" />{t('Bot connected')}</em></div>
                  <div className="lp-mini__body"><div className="lp-mini__field">financial analyst<b className="lp-caret" /></div><div className="lp-mini__field lp-mini__field--dim">Amsterdam</div><div className="lp-mini__go">{t('Search jobs')}</div></div>
                </div>
              </div>
            </article>
            <article className="lp-card" data-reveal style={{ '--i': 2 } as CSSProperties}>
              <h3 dir={rtl}><ShieldCheck size={18} aria-hidden /> {t('Approve first.')}</h3>
              <p>{t('Emails, posts and anything final wait until you say yes. Fino never pays for you.')}</p>
              <div className="lp-card__art">
                <div className="lp-ask lp-ask--still">
                  <span>{t('Waiting for your OK')}</span>
                  <b>{t('Send the summary to the board')}</b>
                  <div><span className="lp-ask__yes"><Check size={15} strokeWidth={2.6} aria-hidden /> {t('Approve')}</span><span className="lp-ask__no">{t('Not now')}</span></div>
                </div>
              </div>
            </article>
            <article className="lp-card" data-reveal style={{ '--i': 3 } as CSSProperties}>
              <h3 dir={rtl}><Hand size={18} aria-hidden /> {t('Take over anytime.')}</h3>
              <p>{t('Grab the browser yourself, then hand it back.')}</p>
              <div className="lp-card__art">
                <div className="lp-control">
                  <img src={NOUR} alt="" width={40} height={40} />
                  <span><b>{t('You’re in control')}</b><small>{t('Nour is waiting')}</small></span>
                  <em>{t('Hand back')}</em>
                </div>
              </div>
            </article>
            <article className="lp-card" data-reveal style={{ '--i': 4 } as CSSProperties}>
              <h3 dir={rtl}><Globe size={18} aria-hidden /> {t('It works where you already work.')}</h3>
              <p>{t('Connect Gmail, Google Calendar, Drive, Slack, Notion and hundreds more. Bots read on their own; anything that sends, posts or deletes waits for your OK first.')}</p>
              <div className="lp-card__art lp-apps">
                {APPS.map(([name, src]) => <span key={name} title={name}><img src={src} alt={name} width={28} height={28} /></span>)}
              </div>
            </article>
          </div>
        </div>
      </section>

      <Jobs onStart={() => start('signup')} open={open} />

      <Cost onStart={() => start('signup')} open={signedIn ? t('Open Fino') : t('Build my team')} />

      <Plans onStart={() => start('signup')} signedIn={signedIn} />

      <DesktopBand os={os} />

      <Faq />

      <section className="lp-close" id="start">
        <div className="lp-wrap lp-center">
          <h2 className="lp-h2" data-reveal dir={rtl}>{t('Meet your team today.')}</h2>
          <p className="lp-lede lp-lede--sm" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('Create your account with Google or your email. Badr, your Chief of Staff, is waiting in the first chat.')}</p>
          <div className="lp-cta" data-reveal style={{ '--i': 2 } as CSSProperties}>
            <button type="button" className="lp-btn" onClick={() => start('signup')}>{open}</button>
            <a className="lp-btn lp-btn--soft" href="#download">{t('Download')}</a>
          </div>
        </div>
        <svg className="lp-moon" viewBox="0 0 1000 420" aria-hidden>
          <path d="M 120 420 A 380 380 0 0 1 880 420" />
          <rect x="370" y="190" width="56" height="150" rx="28" />
          <rect x="574" y="190" width="56" height="150" rx="28" />
        </svg>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot__in">
          <div className="lp-foot__brand">
            <span className="lp-mark"><img src={MARK} alt="" width={26} height={26} /><span>{t('Badr')}</span></span>
            <small>© 2026 {t('Badr')}</small>
            <LangSwitch />
          </div>
          <nav aria-label={t('Product')}><b>{t('Product')}</b><a href="#demo">{t('See it work')}</a><a href="#plans">{t('Plans')}</a><a href="#download">{t('Download')}</a></nav>
          <nav aria-label={t('Help')}><b>{t('Help')}</b><a href="#faq">{t('Questions')}</a><a href="/support.html">{t('Support')}</a></nav>
          <nav aria-label={t('Legal')}><b>{t('Legal')}</b><a href="/privacy.html">{t('Privacy')}</a><a href="/terms.html">{t('Terms')}</a></nav>
        </div>
      </footer>
    </div>
  );
}

const APPS: [string, string][] = [['Slack', '/assets/icons/slack.svg'], ['Notion', '/assets/apps/notion.png'], ['Google Docs', '/assets/apps/google-docs.png'], ['Google Sheets', '/assets/apps/google-sheets.png'], ['Dropbox', '/assets/apps/dropbox.png'], ['Linear', '/assets/apps/linear.png'], ['Canva', '/assets/apps/canva.png'], ['ChatGPT', '/brands/chatgpt.svg'], ['Claude', '/brands/claude.svg']];

/* ---- The app window under the headline: Badr's morning chat plays out, then waits for your OK. Demo content. ---- */
const SCRIPT = [
  { who: 'bot', text: 'Good morning. Two invoices need your OK, the team meeting moved to 15:00, and Nour found five flats in your budget.' },
  { who: 'me', text: 'Nice. Show me the flats.' },
  { who: 'bot', text: 'Here are the three best. Shall I book viewings for Saturday?' },
  { who: 'ask', text: 'Book three viewings for Saturday' },
] as const;
function HeroWindow() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (reducedMotion()) { setShown(SCRIPT.length); return; }
    let stop = false, timer = 0;
    const wait = (ms: number) => new Promise<void>((res) => { timer = window.setTimeout(res, ms); });
    (async () => {
      await wait(900);
      while (!stop) {
        setOk(false); setShown(0);
        await wait(500); if (stop) return;
        for (let i = 0; i < SCRIPT.length; i++) {
          if (SCRIPT[i].who !== 'me') { setTyping(true); await wait(1100); setTyping(false); }
          else await wait(900);
          if (stop) return;
          setShown(i + 1);
          await wait(700);
        }
        await wait(2400); if (stop) return;
        setOk(true);
        await wait(3600);
      }
    })();
    return () => { stop = true; clearTimeout(timer); };
  }, []);
  return (
    <div className="lp-window lp-in" ref={ref} style={{ '--d': '360ms' } as CSSProperties} aria-label={t('Demo: Badr’s morning chat')}>
      <aside className="lp-window__side">
        <div className="lp-window__top"><span className="lp-dots"><i /><i /><i /></span><span className="lp-window__icons"><Search size={15} aria-hidden /><Plus size={15} aria-hidden /></span></div>
        <div className="lp-window__tiles">
          <span className="is-on"><img src={MARK} alt="" width={44} height={44} />{t('Badr')}</span>
          <span><img src={KAI} alt="" width={44} height={44} />{t('Kai')}</span>
          <span><img src={SOL} alt="" width={44} height={44} />{t('Sol')}</span>
        </div>
        <ul className="lp-window__list">
          <li><img src={NOUR} alt="" width={30} height={30} /><span><b>{t('Nour')} · {t('Research')}</b><small>{t('Five flats in your budget')}</small></span></li>
          <li><img src={KAI} alt="" width={30} height={30} /><span><b>{t('Kai')} · {t('Inbox')}</b><small>{t('3 replies drafted for your OK')}</small></span></li>
          <li><img src={SOL} alt="" width={30} height={30} /><span><b>{t('Sol')} · {t('Planner')}</b><small>{t('Your week is planned')}</small></span></li>
        </ul>
      </aside>
      <div className="lp-window__chat">
        <div className="lp-window__head"><span className="lp-chip"><img src={MARK} alt="" width={20} height={20} />{t('Badr')} · {t('Chief of Staff')}</span><span className="lp-window__tag">{t('Demo')}</span></div>
        <div className="lp-window__msgs">
          <p className="lp-window__time">{t('Today 7:48')}</p>
          {SCRIPT.slice(0, shown).map((m, i) => m.who === 'ask'
            ? (ok
              ? <p key="done" className="lp-bubble lp-bubble--me">{t('Approved')}</p>
              : <div key={i} className="lp-ask"><span>{t('Waiting for your OK')}</span><b>{t(m.text)}</b><div><span className="lp-ask__yes"><Check size={15} strokeWidth={2.6} aria-hidden /> {t('Approve')}</span><span className="lp-ask__no">{t('Not now')}</span></div></div>)
            : <p key={i} className={m.who === 'me' ? 'lp-bubble lp-bubble--me' : 'lp-bubble'}>{t(m.text)}</p>)}
          {typing && <p className="lp-bubble lp-typing" aria-label={t('Badr is typing')}><i /><i /><i /></p>}
        </div>
        <div className="lp-window__composer">{t('Message Badr…')}<span aria-hidden><ArrowRight size={15} /></span></div>
      </div>
    </div>
  );
}

/* A scripted replay of a bot using the Fino Browser. Demo content: no real site is opened. */
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
    if (reducedMotion()) { setMsgs(FINAL); setJobText('financial analyst'); setCityText('Amsterdam'); setResults(true); return; }
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
      <div className="lp-wrap lp-center">
        <h2 className="lp-h2" data-reveal dir={rtl}>{t('Watch it work.')}</h2>
        <p className="lp-lede lp-lede--sm" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('Ask in chat. The bot opens its own browser, and you see every move it makes.')}</p>
      </div>
      <div className="lp-wrap">
        <div className="lp-stage" data-reveal style={{ '--i': 2 } as CSSProperties}>
          {/* Fading is a data attribute, not a class: a changing className would wipe the reveal's is-in class and hide the demo. */}
          <div className="lp-desk" data-fading={fade || undefined} aria-label={t('Demo: a bot searching a jobs site in its browser')}>
            <div className="lp-desk__chat">
              <div className="lp-desk__head"><img src={NOUR} alt="" width={26} height={26} /> {t('Nour')} <span>{t('Research')}</span></div>
              <div className="lp-msgs">
                {msgs.map((m) => <p key={m.id} className={m.who === 'me' ? 'lp-bubble lp-bubble--me' : m.who === 'bot' ? 'lp-bubble' : 'lp-step'}>{t(m.text)}</p>)}
                {thinking && <p className="lp-bubble lp-typing" aria-label={t('Nour is typing')}><i /><i /><i /></p>}
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
                  <svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#0a0a0a" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                </span>
              </div>
            </div>
            <span className="lp-desk__tag">{t('Demo')}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Blocks fade up once as they scroll into view; everything stays visible without JavaScript. */
function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current; if (!el) return;
    if (reducedMotion()) return;
    el.classList.add('lp--reveal');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { root: el, rootMargin: '0px 0px -8% 0px', threshold: 0 });
    el.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [root]);
}

/* ---- Desktop downloads: which system the visitor is on, and a row for each app ---- */
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
const AppleLogo = () => <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M16.37 12.5c-.02-2.1 1.72-3.12 1.8-3.17-.98-1.43-2.5-1.63-3.05-1.65-1.3-.13-2.53.77-3.19.77-.66 0-1.67-.75-2.75-.73-1.41.02-2.72.82-3.45 2.09-1.47 2.55-.38 6.33 1.06 8.4.7 1.01 1.53 2.15 2.62 2.11 1.05-.04 1.45-.68 2.72-.68 1.27 0 1.63.68 2.74.66 1.13-.02 1.85-1.03 2.54-2.05.8-1.17 1.13-2.3 1.15-2.36-.03-.01-2.2-.84-2.22-3.39zM14.3 6.33c.58-.7.97-1.68.86-2.65-.83.03-1.84.55-2.44 1.25-.53.62-1 1.61-.88 2.56.93.07 1.88-.47 2.46-1.16z" /></svg>;
const WindowsLogo = () => <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M3 5.1l7.4-1v7.2H3V5.1zm8.4-1.2L21 2.5v8.8h-9.6V3.9zM3 12.6h7.4v7.3L3 18.9v-6.3zm8.4 0H21v8.9l-9.6-1.4v-7.5z" /></svg>;
function DesktopBand({ os }: { os: Os }) {
  const [info, setInfo] = useState<Record<string, { available: boolean; bytes?: number; installerBytes?: number | null }>>({});
  useEffect(() => {
    (['mac', 'windows'] as const).forEach((id) => fetch(DOWNLOADS[id].info).then((r) => r.json()).then((v) => setInfo((m) => ({ ...m, [id]: v }))).catch(() => setInfo((m) => ({ ...m, [id]: { available: false } }))));
  }, []);
  // The visitor's own computer comes first.
  const order: ('mac' | 'windows')[] = os === 'windows' ? ['windows', 'mac'] : ['mac', 'windows'];
  const note = os === 'windows' ? 'If Windows shows a blue warning, choose More info → Run anyway.' : 'First time only: if macOS says it can’t check Badr, press Done (not Move to Trash), then open System Settings → Privacy & Security and choose Open Anyway.';
  return (
    <section className="lp-dl" id="download">
      <div className="lp-wrap lp-split">
        <div data-reveal>
          <h2 className="lp-h2" dir={rtl}>{t('Badr for Mac and Windows.')}</h2>
          <p className="lp-body lp-muted">{t('Your team in its own window, always one click away. Included in every plan.')}</p>
        </div>
        <div className="lp-dl__rows" data-reveal style={{ '--i': 1 } as CSSProperties}>
          {order.map((id) => {
            const d = DOWNLOADS[id], v = info[id];
            const bytes = id === 'mac' ? (v?.installerBytes ?? v?.bytes) : v?.bytes;
            const size = bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '';
            const href = id === 'mac' ? '/api/download/mac/dmg' : d.href;
            const off = v?.available === false;
            const Row = off ? 'div' : 'a';
            return (
              <Row key={id} className={`lp-dl__row${off ? ' is-off' : ''}`} {...(off ? {} : { href, download: true, onClick: () => store.drop(OFFER_MAC) })}>
                <span className="lp-dl__logo" aria-hidden>{id === 'mac' ? <AppleLogo /> : <WindowsLogo />}</span>
                <span className="lp-dl__txt"><b>{id === 'mac' ? 'macOS' : 'Windows'}{os === id && <em>{t('Your computer')}</em>}</b><small dir={rtl}>{t(d.needs)}{size && <span className="lp-dl__size" dir="ltr">{size}</span>}</small></span>
                <span className="lp-dl__go" aria-hidden>{off ? <small>{t('Coming soon')}</small> : <Download size={17} />}</span>
              </Row>
            );
          })}
          <a className="lp-dl__row" href="/">
            <span className="lp-dl__logo" aria-hidden><Globe size={16} /></span>
            <span className="lp-dl__txt"><b>{t('Web')}</b><small>{t('Open in your browser')}</small></span>
            <span className="lp-dl__go" aria-hidden><ArrowUpRight size={17} /></span>
          </a>
          <p className="lp-dl__note">{t(note)}</p>
        </div>
      </div>
    </section>
  );
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

/* ---- The cost of people vs. a Badr team ---- */
// The low end for one full-time assistant: $2,500 salary plus about $500 of employer costs a month.
const ASSISTANT_SALARY = 2500;
const ASSISTANT_EXTRA = 500;
// The real plans (server/src/plans.ts): the smallest one that fits the number of roles.
const PLAN_BY_ID = {
  starter: { name: 'Starter', price: 14.99, bots: 'Badr + 5 bots', hours: 3, lines: ['Ready-to-work bots with superpowers', 'Their own computer · 3 h a month', 'Use your own Claude Code and ChatGPT'] },
  pro: { name: 'Pro', price: 49.99, bots: 'Badr + 15 bots', hours: 20, lines: ['Everything in Starter, plus', 'Their own computer · 20 h a month', 'Every marketplace bot', 'Stronger AI models included'] },
  max: { name: 'Max', price: 99.99, bots: 'Badr + 40 bots', hours: 60, lines: ['Everything in Pro, plus', 'Their own computer · 60 h a month', 'Top AI models included', 'Priority support'] },
} as const;
const planFor = (roles: number) => (roles <= 1 ? PLAN_BY_ID.pro : PLAN_BY_ID.max);
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}`;

function Cost({ onStart, open }: { onStart: () => void; open: string }) {
  const [roles, setRoles] = useState(3);
  const plan = planFor(roles);
  const humanYear = roles * (ASSISTANT_SALARY + ASSISTANT_EXTRA) * 12;
  const finoYear = Math.round(plan.price * 12);
  return (
    <section className="lp-cost" id="cost">
      <div className="lp-wrap lp-center">
        <h2 className="lp-h2" data-reveal dir={rtl}>{t('A team for less than one day of wages.')}</h2>
        <p className="lp-lede lp-lede--sm" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('One full-time assistant costs at least {amount} a month, before employer costs. Fino bots work nights and weekends, remember how you like things done, and each one has its own computer.', { amount: usd(ASSISTANT_SALARY) })}</p>

        <div className="lp-cost__ask" data-reveal style={{ '--i': 2 } as CSSProperties}>
          <span id="lp-roles-label">{t('How many people’s routine work?')}</span>
          <div className="lp-stepper" role="group" aria-labelledby="lp-roles-label">
            <button type="button" onClick={() => setRoles((r) => Math.max(1, r - 1))} disabled={roles <= 1} aria-label={t('Fewer')}><Minus size={16} aria-hidden /></button>
            <output aria-live="polite">{roles}</output>
            <button type="button" onClick={() => setRoles((r) => Math.min(6, r + 1))} disabled={roles >= 6} aria-label={t('More')}><Plus size={16} aria-hidden /></button>
          </div>
        </div>

        <div className="lp-cost__docs">
          <article className="lp-slip" data-reveal style={{ '--i': 3 } as CSSProperties} aria-label={t('Payroll for assistants')}>
            <header><b>{t('Payroll')}</b><span>{t(roles === 1 ? '{n} assistant · per month' : '{n} assistants · per month', { n: roles })}</span></header>
            <dl>
              <div><dt>{t('Salary')}</dt><dd>{usd(ASSISTANT_SALARY * roles)}</dd></div>
              <div><dt>{t('Employer costs')}</dt><dd>{usd(ASSISTANT_EXTRA * roles)}</dd></div>
              <div><dt>{t('Working hours')}</dt><dd>{t('40 a week each')}</dd></div>
              <div><dt>{t('Evenings, weekends, holidays')}</dt><dd>{t('Off')}</dd></div>
            </dl>
            <footer><span>{t('A year')}</span><strong key={humanYear} className="lp-total lp-slip__old">{usd(humanYear)}</strong></footer>
          </article>
          <article className="lp-slip lp-slip--badr" data-reveal style={{ '--i': 4 } as CSSProperties} aria-label={t('Fino {plan} plan', { plan: plan.name })}>
            <header><b>{t('Badr')} {plan.name}</b><span>{usd(plan.price)} · {t('per month')}</span></header>
            <dl>
              <div><dt>{t('Bots')}</dt><dd>{t(plan.bots)}</dd></div>
              <div><dt>{t('Their own computer')}</dt><dd>{t('{n} h a month', { n: plan.hours })}</dd></div>
              <div><dt>{t('Working hours')}</dt><dd>{t('Around the clock')}</dd></div>
              <div><dt>{t('Anything final')}</dt><dd>{t('Waits for your OK')}</dd></div>
            </dl>
            <footer><span>{t('A year')}</span><strong key={finoYear} className="lp-total">{usd(finoYear)}</strong></footer>
          </article>
        </div>

        <div className="lp-cost__out" data-reveal style={{ '--i': 5 } as CSSProperties}>
          <p>{t('You keep')} <strong key={humanYear - finoYear} className="lp-total">{usd(humanYear - finoYear)}</strong> {t('a year.')}</p>
          <button type="button" className="lp-btn" onClick={onStart}>{open}</button>
        </div>
      </div>
    </section>
  );
}

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

function Jobs({ onStart, open }: { onStart: () => void; open: string }) {
  const [pick, setPick] = useState(JOBS[0].id);
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const job = JOBS.find((j) => j.id === pick) ?? JOBS[0];
  const story = STORIES[job.id];
  const img = characterDataUri(job.character, job.color);
  return (
    <section className="lp-jobs" id="jobs">
      <div className="lp-wrap lp-jobs__in">
        <div className="lp-jobs__side" data-reveal>
          <h2 className="lp-h2" dir={rtl}>{t('Give each bot a job worth doing.')}</h2>
          <div className="lp-jobs__chips" role="tablist" aria-label={t('Jobs')}>
            {JOBS.map((j) => (
              <button key={j.id} type="button" role="tab" id={`lp-tab-${j.id}`} aria-selected={j.id === pick} aria-controls="lp-job-panel" onClick={() => setPick(j.id)}>
                {j.id === pick && <img src={characterDataUri(j.character, j.color)} alt="" width={20} height={20} draggable={false} />}{t(j.title)}
              </button>
            ))}
          </div>
          <p className="lp-jobs__say"><b>{t(job.title)}.</b> {t(job.blurb)}</p>
          <button type="button" className="lp-btn lp-btn--soft" onClick={onStart}>{open}</button>
        </div>
        {story && (
          <div className="lp-jobs__stage" data-reveal style={{ '--i': 1 } as CSSProperties}>
            <div className="lp-jobs__chat" role="tabpanel" id="lp-job-panel" aria-labelledby={`lp-tab-${job.id}`} key={job.id}>
              <div className="lp-jobs__head">
                <img src={img} alt="" width={40} height={40} draggable={false} />
                <div><b>{t(job.name)}</b><span>{t(job.title)}</span></div>
                <dl><div><dt>{t('Runs')}</dt><dd>{t(story.runs)}</dd></div><div><dt>{t('Uses')}</dt><dd>{t(story.uses)}</dd></div></dl>
              </div>
              <div className="lp-jobs__msgs">
                {story.says.map((line, i) => <p key={i} className="lp-bubble" style={{ '--i': i } as CSSProperties}>{t(line)}</p>)}
                {ok[job.id]
                  ? <><p className="lp-bubble lp-bubble--me">{t('Approved')}</p><p className="lp-bubble">{t(story.done)}</p></>
                  : <div className="lp-ask" style={{ '--i': story.says.length } as CSSProperties}>
                      <span>{t('Waiting for your OK')}</span>
                      <b>{t(story.waits)}</b>
                      <div><button type="button" className="lp-ask__yes" onClick={() => setOk((o) => ({ ...o, [job.id]: true }))}><Check size={15} strokeWidth={2.6} aria-hidden /> {t('Approve')}</button><button type="button" className="lp-ask__no" onClick={() => setPick(JOBS[(JOBS.indexOf(job) + 1) % JOBS.length].id)}>{t('Not now')}</button></div>
                    </div>}
              </div>
              <span className="lp-desk__tag">{t('Example')}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---- Plans ---- */
function Plans({ onStart, signedIn }: { onStart: () => void; signedIn: boolean }) {
  const list = [PLAN_BY_ID.starter, PLAN_BY_ID.pro, PLAN_BY_ID.max];
  return (
    <section className="lp-plans" id="plans">
      <div className="lp-wrap lp-center">
        <h2 className="lp-h2" data-reveal dir={rtl}>{t('Simple plans. No hiring.')}</h2>
        <p className="lp-lede lp-lede--sm" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('Every plan includes Badr, Fino’s own AI models and the safety rules. Prices in US dollars a month; cancel anytime.')}</p>
        <ul className="lp-plans__row">
          {list.map((p, i) => (
            <li key={p.name} data-reveal style={{ '--i': 2 + i } as CSSProperties}>
              <span className="lp-plans__name">{p.name}{p.name === 'Max' && <em>{t('Most teams')}</em>}</span>
              <strong>{usd(p.price)}<small>{t('/month')}</small></strong>
              <span className="lp-plans__bots">{t(p.bots)}</span>
              <button type="button" className="lp-btn lp-btn--block" onClick={onStart}>{signedIn ? t('Open Fino') : t('Start with {plan}', { plan: p.name })}</button>
              <ul>{p.lines.map((l) => l.startsWith('Everything in ') ? <li key={l} className="lp-plans__plus">{t(l)}</li> : <li key={l}><Check size={15} strokeWidth={2.2} aria-hidden />{t(l)}</li>)}</ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---- Questions ---- */
const FAQ: [string, string][] = [
  ['What can the bots do?', 'Bots take on routine work on a computer: email, research, sheets, forms and follow-ups. You decide what they do, and they ask before anything final.'],
  ['Do they do things without asking?', 'Emails, posts and anything final wait until you say yes. Fino never pays for you.'],
  ['How much does Badr cost?', 'Plans start at $14.99 a month, and your first day is free. Cancel anytime.'],
  ['Do I need my own AI account?', 'With Google or your email. No AI account or setup needed.'],
  ['Where can I use Badr?', 'On Mac, Windows and the web. Your team and your chats are the same everywhere.'],
];
function Faq() {
  const [openAt, setOpenAt] = useState<number | null>(null);
  return (
    <section className="lp-faq" id="faq">
      <div className="lp-wrap lp-split">
        <h2 className="lp-h2" data-reveal dir={rtl}>{t('Questions')}</h2>
        <div className="lp-faq__list" data-reveal style={{ '--i': 1 } as CSSProperties}>
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`lp-faq__item${openAt === i ? ' is-open' : ''}`}>
              <button type="button" aria-expanded={openAt === i} onClick={() => setOpenAt(openAt === i ? null : i)}><span>{t(q)}</span><Plus size={16} aria-hidden /></button>
              <div className="lp-faq__a"><p>{t(a)}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** English, Dutch or Arabic for the public page; the app follows the same choice. */
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
      <Globe size={14} strokeWidth={2} aria-hidden />
      <span className="lp-lang__long" aria-hidden>{now.label}</span><span className="lp-lang__short" aria-hidden>{now.short}</span>
      <ChevronDown size={13} aria-hidden />
      <select value={now.code} aria-label={t('Language')} onChange={(e) => setLangChoice(e.target.value as 'en' | 'nl' | 'ar')}>
        {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}
