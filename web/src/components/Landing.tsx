import { Fragment, useEffect, useRef, useState, type CSSProperties, type ElementType, type FormEvent, type RefObject } from 'react';
import { ArrowRight, Check, Download, Eye, Globe, Hand, Minus, Plus, ShieldCheck, X } from 'lucide-react';
import { AuthPanel } from './AuthPanel';
import { characterDataUri } from '../../../packages/contracts/src/characters';
import { JOBS } from '../../../packages/contracts/src/jobs';
import { lang, setLangChoice, t } from '../lib/i18n';
import '../styles/lp-fonts.css';
import '../styles/auth.css';
import '../styles/landing.css';

/* The public front door for web visitors: what Badr is, a live demo, the cost, plans, sign-up and the desktop apps.
   Look: warm cream paper, deep green and ink bands, lilac buttons with an ink edge, and a serif whose last words lean
   into italic. One signature moment: a messy request flows along a curve into Badr and comes out as finished work. */

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

type Bot = { id: string; name: string; role: string; img: string; reply: string; match: RegExp };
// An example team. Every new account starts with Badr; people add the others themselves.
const TEAM: Bot[] = [
  { id: 'nour', name: 'Nour', role: 'Research', img: characterDataUri('architect', 'violet'), reply: 'On it. I’ll open my browser, search, and come back with a shortlist.', match: /find|search|research|compare|flight|job|price|look up|best/i },
  { id: 'quinn', name: 'Badr', role: 'Chief of Staff', img: characterDataUri('accountant', 'yellow'), reply: 'Got it. I’ll take this on and hand parts to the right teammate.', match: /$^/ },
  { id: 'kai', name: 'Kai', role: 'Inbox', img: characterDataUri('medic', 'blue'), reply: 'I’ll read your inbox, flag what matters, and draft replies for your OK.', match: /mail|inbox|repl|newsletter|unsubscribe/i },
  { id: 'sol', name: 'Sol', role: 'Planner', img: characterDataUri('florist', 'magenta'), reply: 'I’ll check your calendar and lay out the week, with time to breathe.', match: /plan|week|calendar|schedule|meeting|day|remind/i },
];
const QUINN = TEAM[1];
// Badr, the main character, is the logo.
const MARK = characterDataUri('accountant', 'yellow');
const pickBot = (task: string) => TEAM.find((b) => b.match.test(task)) ?? QUINN;
const EXAMPLES = ['Summarize this report', 'Work out this year’s taxes', 'Find cheap flights to Barcelona', 'What’s on my plate today?', 'Write an email for me'];
// Short jobs that type themselves into the empty task box, one after another; each fits the box on a phone.
const HINTS = ['Write an email for me', 'Find cheap flights to Lisbon', 'What’s on my plate today?', 'Work out this year’s taxes', 'Summarize this report'];

/** The task box's placeholder, typed and erased like someone trying ideas. Still with reduced motion. */
function useTypedHint() {
  const [hint, setHint] = useState(() => t(HINTS[0]));
  useEffect(() => {
    if (reducedMotion()) return;
    let i = 0, n = t(HINTS[0]).length, dir = -1;
    let timer = 0;
    const tick = () => {
      const full = t(HINTS[i]);
      n += dir;
      setHint(full.slice(0, Math.max(0, n)));
      let wait = dir > 0 ? 60 + Math.random() * 50 : 26;
      if (dir > 0 && n >= full.length) { dir = -1; wait = 2200; }
      else if (dir < 0 && n <= 0) { dir = 1; i = (i + 1) % HINTS.length; wait = 380; }
      timer = window.setTimeout(tick, wait);
    };
    timer = window.setTimeout(tick, 2600);
    return () => clearTimeout(timer);
  }, []);
  return hint;
}

/** A section headline in the serif, its last words leaning into italic. Words rise out of a soft blur as it arrives. */
function Head({ text, em = 1, as: Tag = 'h2', className = 'lp-h2' }: { text: string; em?: number; as?: ElementType; className?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  const cut = Math.max(0, words.length - em);
  return (
    // Arabic needs dir="rtl" here: the words are separate boxes, so the page's automatic direction can't see the letters.
    <Tag className={className} data-reveal="words" aria-label={text} dir={/[\u0590-\u08ff]/.test(text) ? 'rtl' : undefined}>
      {words.map((w, i) => (
        <Fragment key={i}>{i > 0 && ' '}<span aria-hidden className={i >= cut ? 'lp-w lp-w--em' : 'lp-w'} style={{ '--w': i } as CSSProperties}>{w}</span></Fragment>
      ))}
    </Tag>
  );
}

export function Landing({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: (mode: 'signin' | 'signup') => void }) {
  const [task, setTask] = useState('');
  const [said, setSaid] = useState<Bot | null>(null);
  const hint = useTypedHint();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const start = (mode: 'signin' | 'signup' = 'signup') => {
    store.set(OFFER_MAC, '1');
    if (signedIn) { location.href = '/'; return; }
    onSignIn(mode);
  };
  const giveJob = (e: FormEvent) => {
    e.preventDefault();
    const job = task.trim();
    if (!job) { setSaid(QUINN); return; }
    store.set(FIRST_TASK, job.slice(0, 2000));
    start('signup');
  };
  const choose = (example: string) => { setTask(t(example)); setSaid(pickBot(example)); };
  // The matching bot answers a moment after typing stops.
  useEffect(() => {
    if (!task.trim()) return;
    const id = setTimeout(() => setSaid(pickBot(task)), 450);
    return () => clearTimeout(id);
  }, [task]);

  return (
    <div className="lp" ref={root}>
      <a className="lp-news" href="#download">{t('Badr for Mac and Windows.')} <span>{t('Download')} <ArrowRight size={15} strokeWidth={2.4} aria-hidden /></span></a>
      <header className="lp-top">
        <nav className="lp-nav" aria-label="Badr">
          <a className="lp-mark" href="/welcome" aria-label="Badr"><img src={MARK} alt="" width={34} height={34} /><span>{t('Badr')}</span></a>
          <div className="lp-nav__links">
            <a href="#demo">{t('See it work')}</a>
            <a href="#plans">{t('Plans')}</a>
            <a href="#download">{t('Download')}</a>
          </div>
          <div className="lp-nav__end">
            <LangSwitch />
            {signedIn
              ? <a className="lp-btn lp-btn--sm" href="/">{t('Open Fino')}</a>
              : <><button type="button" className="lp-nav__signin" onClick={() => start('signin')}>{t('Sign in')}</button>
                <button type="button" className="lp-btn lp-btn--sm" onClick={() => start('signup')}>{t('Get started')}</button></>}
          </div>
        </nav>
      </header>

      <section className="lp-hero">
        <h1 className="lp-h1" aria-label={`${t('Hire a team.')} ${t('Not a payroll.')}`}>
          <span className="lp-h1__a" aria-hidden>{t('Hire a team.')}</span>
          <em className="lp-h1__b" aria-hidden>{t('Not a payroll.')}</em>
        </h1>
        <p className="lp-lede lp-in" style={{ '--d': '420ms' } as CSSProperties}>{t('Fino bots have a name, a memory and their own computer. Tell them what you need, by text or by voice, and they get to work around the clock. Plans start at less a month than an assistant earns in a day.')}</p>

        <form className="lp-task lp-in" style={{ '--d': '540ms' } as CSSProperties} onSubmit={giveJob}>
          <label htmlFor="lp-task" className="lp-sr">{t('What should your team do?')}</label>
          <input id="lp-task" value={task} onChange={(e) => setTask(e.target.value)} placeholder={hint} autoComplete="off" maxLength={2000} />
          <button type="submit" className="lp-btn">{t(signedIn ? 'Open Fino' : 'Get started')} <ArrowRight size={19} strokeWidth={2.4} aria-hidden /></button>
        </form>
        <div className="lp-reply" aria-live="polite">
          {said && <p key={said.id}><img src={said.img} alt="" width={30} height={30} /><span><b>{t(said.name)} · {t(said.role)}</b>{t(said.reply)}</span></p>}
        </div>
        <div className="lp-chips lp-in" style={{ '--d': '640ms' } as CSSProperties} role="group" aria-label={t('Example jobs')}>
          {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => choose(ex)} aria-pressed={task === t(ex)}>{t(ex)}</button>)}
        </div>
        <p className="lp-models lp-in" style={{ '--d': '720ms' } as CSSProperties}>
          <span>{t('Powered by the world’s best AI')}</span>
          <b><img src="/brands/chatgpt.svg" alt="" width={16} height={16} />ChatGPT</b>
          <b><img src="/brands/claude.svg" alt="" width={16} height={16} />Claude</b>
        </p>
      </section>

      <FlowBand />

      <section className="lp-apps">
        <p className="lp-apps__say" data-reveal>{t('It works where you already work.')}</p>
        <div className="lp-marquee" aria-label={t('Some apps you can connect')} role="list">
          {[0, 1].map((copy) => (
            <div key={copy} className="lp-marquee__row" aria-hidden={copy === 1 || undefined}>
              {APPS.map(([name, src]) => <span key={name} role={copy ? undefined : 'listitem'} className="lp-marquee__app"><img src={src} alt="" width={26} height={26} />{name}</span>)}
            </div>
          ))}
        </div>
        <p className="lp-apps__copy" data-reveal>{t('Connect Gmail, Google Calendar, Drive, Slack, Notion and hundreds more. Bots read on their own; anything that sends, posts or deletes waits for your OK first.')}</p>
      </section>

      <Cost onStart={() => start('signup')} signedIn={signedIn} />

      <Demo />

      <Jobs />

      <section className="lp-charge">
        <div className="lp-wrap">
          <Head text={t('You stay in charge.')} em={2} />
          <ol className="lp-rules">
            <li data-reveal style={{ '--i': 1 } as CSSProperties}><span className="lp-rules__icon"><Eye size={22} aria-hidden /></span><b>{t('Watch it live.')}</b><p>{t('Every click the bot makes shows up on screen, cursor and all.')}</p></li>
            <li data-reveal style={{ '--i': 2 } as CSSProperties}><span className="lp-rules__icon"><ShieldCheck size={22} aria-hidden /></span><b>{t('Approve first.')}</b><p>{t('Emails, posts and anything final wait until you say yes. Fino never pays for you.')}</p></li>
            <li data-reveal style={{ '--i': 3 } as CSSProperties}><span className="lp-rules__icon"><Hand size={22} aria-hidden /></span><b>{t('Take over anytime.')}</b><p>{t('Grab the browser yourself, then hand it back.')}</p></li>
          </ol>
        </div>
      </section>

      <FirstSteps />

      <Plans onStart={() => start('signup')} signedIn={signedIn} />

      <DesktopBand />

      <section className="lp-close" id="start">
        <div className="lp-wrap lp-close__in">
          <div className="lp-close__copy">
            <Head text={t('Meet your team today.')} em={1} />
            <p className="lp-copy" data-reveal>{t('Create your account with Google or your email. Badr, your Chief of Staff, is waiting in the first chat.')}</p>
            <img className="lp-close__badr" src={MARK} alt="" width={120} height={120} draggable={false} />
          </div>
          <div className="lp-close__panel" data-reveal style={{ '--i': 2 } as CSSProperties}>
            {signedIn ? <div className="auth"><h2 className="auth__title">{t('You’re signed in.')}</h2><a className="auth__submit" href="/">{t('Open Fino')}</a></div> : <AuthPanel initial="signup" />}
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot__in">
          <span className="lp-mark lp-mark--small"><img src={MARK} alt="" width={24} height={24} /> {t('Badr')}</span>
          <nav aria-label={t('Legal')}><LangSwitch /><a href="/privacy.html">{t('Privacy')}</a><a href="/terms.html">{t('Terms')}</a><a href="/support.html">{t('Support')}</a></nav>
        </div>
      </footer>
    </div>
  );
}

const APPS: [string, string][] = [['Slack', '/assets/icons/slack.svg'], ['Notion', '/assets/apps/notion.png'], ['Google Docs', '/assets/apps/google-docs.png'], ['Google Sheets', '/assets/apps/google-sheets.png'], ['Dropbox', '/assets/apps/dropbox.png'], ['Linear', '/assets/apps/linear.png'], ['Canva', '/assets/apps/canva.png'], ['ChatGPT', '/brands/chatgpt.svg'], ['Claude', '/brands/claude.svg']];

/* The signature moment. A request, said the way people really talk, drifts along a curve into Badr; finished work
   flows out the other side. Each line holds its phrase a few times and slides by exactly one phrase, so the loop has
   no seam. It runs only while on screen; with reduced motion both lines rest in place. */
const MESSY = 'umm so can you find me a flight to Lisbon next week, not too early… oh and a hotel near the office, and tell Sara I’m coming, thanks —';
const CLEAN = 'Lisbon, 12–15 March · direct flight at 8:40, $186 · hotel near the office, $132 a night · Sara knows you’re coming · ready for your OK ·';
const REPEAT = 3;
function FlowBand() {
  const box = useRef<HTMLDivElement>(null);
  const inText = useRef<SVGTextElement>(null);
  const outText = useRef<SVGTextElement>(null);
  const inPath = useRef<SVGTextPathElement>(null);
  const outPath = useRef<SVGTextPathElement>(null);
  useEffect(() => {
    const a = inPath.current, b = outPath.current, ta = inText.current, tb = outText.current, el = box.current;
    if (!a || !b || !ta || !tb || !el) return;
    let la = 1, lb = 1, raf = 0, on = false, last = 0, sa = 0, sb = 0;
    const measure = () => { la = ta.getComputedTextLength() / REPEAT || 1; lb = tb.getComputedTextLength() / REPEAT || 1; };
    const place = () => { a.setAttribute('startOffset', String(-la + (sa % la))); b.setAttribute('startOffset', String(-lb + (sb % lb))); };
    measure(); place();
    document.fonts?.ready.then(() => { measure(); place(); });
    // Phones use bigger letters (CSS), so the phrase length changes with the window.
    const resize = () => { measure(); place(); };
    window.addEventListener('resize', resize);
    if (reducedMotion()) { sa = la * 0.55; sb = lb * 0.6; place(); return () => window.removeEventListener('resize', resize); }
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      sa += dt * 58; sb += dt * 46;
      place();
      if (on) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      const was = on; on = e.isIntersecting;
      if (on && !was) { last = 0; raf = requestAnimationFrame(tick); }
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); on = false; window.removeEventListener('resize', resize); };
  }, []);
  const messy = Array(REPEAT).fill(t(MESSY)).join('  ');
  const clean = Array(REPEAT).fill(t(CLEAN)).join('  ');
  // Phones see the middle of the scene a little larger, so both lines stay long enough to read.
  const [phone, setPhone] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 560px)').matches);
  useEffect(() => {
    const mq = matchMedia('(max-width: 560px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return (
    <div className="lp-flow" ref={box} role="img" aria-label={t('Badr turns a messy request into finished work')}>
      <svg viewBox={phone ? '370 40 700 290' : '0 0 1440 340'} preserveAspectRatio={phone ? 'xMidYMid meet' : 'xMidYMid slice'} aria-hidden>
        <defs>
          <path id="lp-flow-in" d="M -80 64 C 230 30, 420 290, 646 196" />
          <path id="lp-flow-out" d="M 794 196 C 1010 92, 1170 330, 1520 236" />
        </defs>
        <text ref={inText} className="lp-flow__in"><textPath ref={inPath} href="#lp-flow-in">{messy}</textPath></text>
        <text ref={outText} className="lp-flow__out"><textPath ref={outPath} href="#lp-flow-out">{clean}</textPath></text>
        <g className="lp-flow__pill" transform="translate(720 196)">
          <rect x="-92" y="-36" width="184" height="72" rx="36" />
          <image href={MARK} x="-82" y="-29" width="58" height="58" />
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} className="lp-flow__bar" x={-8 + i * 13} y="-14" width="6" height="28" rx="3" style={{ '--b': i } as CSSProperties} />)}
        </g>
      </svg>
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
        <Head text={t('Watch it work.')} em={1} />
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
    if (reducedMotion()) return;
    el.classList.add('lp--reveal');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { root: el, rootMargin: '0px 0px 15% 0px', threshold: 0 });
    el.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [root]);
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
function DesktopBand() {
  const os = useOs();
  const [info, setInfo] = useState<Record<string, { available: boolean; bytes?: number; installerBytes?: number | null }>>({});
  useEffect(() => {
    (['mac', 'windows'] as const).forEach((id) => fetch(DOWNLOADS[id].info).then((r) => r.json()).then((v) => setInfo((m) => ({ ...m, [id]: v }))).catch(() => setInfo((m) => ({ ...m, [id]: { available: false } }))));
  }, []);
  // The visitor's own computer comes first and gets the yellow button.
  const order: ('mac' | 'windows')[] = os === 'windows' ? ['windows', 'mac'] : ['mac', 'windows'];
  const mine = os === 'other' ? 'mac' : os;
  const steps = {
    mac: ['Open Badr.dmg', 'Drag Badr into Applications', 'Open Badr from Applications'],
    windows: ['Open Badr-Setup.exe', 'It installs by itself in a few seconds', 'Badr opens on its own'],
  };
  const note = {
    mac: 'First time only: if macOS says it can’t check Badr, press Done (not Move to Trash), then open System Settings → Privacy & Security and choose Open Anyway.',
    windows: 'If Windows shows a blue warning, choose More info → Run anyway.',
  };
  return (
    <section className="lp-dl" id="download">
      <div className="lp-wrap">
        <div className="lp-dl__head" data-reveal>
          <Head text={t('Badr for Mac and Windows.')} em={2} />
          <p className="lp-copy">{t('Your team in its own window, always one click away. Included in every plan.')}</p>
        </div>
        <div className="lp-dl__grid">
          {order.map((id, i) => {
            const d = DOWNLOADS[id], v = info[id];
            const bytes = id === 'mac' ? (v?.installerBytes ?? v?.bytes) : v?.bytes;
            const size = bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '';
            const href = id === 'mac' ? '/api/download/mac/dmg' : d.href;
            return (
              <article key={id} className={`lp-dl__card${id === mine ? ' is-mine' : ''}`} data-reveal style={{ '--i': i + 1 } as CSSProperties}>
                <header>
                  <span className="lp-dl__logo" aria-hidden>{id === 'mac' ? <AppleLogo /> : <WindowsLogo />}</span>
                  <div><b>{id === 'mac' ? 'Mac' : 'Windows'}</b><small dir={lang === 'ar' ? 'rtl' : undefined}>{t(d.needs)}{size && <span className="lp-dl__size" dir="ltr">{size}</span>}</small></div>
                  {os === id && <em>{t('Your computer')}</em>}
                </header>
                {v?.available === false
                  ? <span className="lp-btn lp-btn--line lp-dl__btn is-off">{t('Coming soon')}</span>
                  : <a className={`lp-btn ${id === mine ? '' : 'lp-btn--line'} lp-dl__btn`} href={href} download onClick={() => store.drop(OFFER_MAC)}>
                      <Download size={18} strokeWidth={2.6} aria-hidden />{t(id === 'mac' ? 'Download for Mac' : 'Download for Windows')}
                    </a>}
                <ol className="lp-dl__steps">{steps[id].map((s) => <li key={s}>{t(s)}</li>)}</ol>
                <p className="lp-dl__note">{t(note[id])}</p>
              </article>
            );
          })}
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


/* ---- The cost of people vs. a Fino team ---- */
// The low end for one full-time assistant: $2,500 salary plus about $500 of employer costs a month.
const ASSISTANT_SALARY = 2500;
const ASSISTANT_EXTRA = 500;
// The real plans (server/src/plans.ts): the smallest one that fits the number of roles.
const PLAN_BY_ID = {
  starter: { name: 'Starter', price: 14.99, bots: 'Badr + 5 bots', hours: 3, lines: ['Ready-to-work bots with superpowers', 'Their own computer · 3 h a month', 'Use your own Claude Code and ChatGPT'] },
  pro: { name: 'Pro', price: 49.99, bots: 'Badr + 15 bots', hours: 20, lines: ['Everything in Starter, plus', 'Their own computer · 20 h a month', 'Every marketplace bot', 'Stronger AI models included'] },
  max: { name: 'Max', price: 99.99, bots: 'Badr + 40 bots', hours: 60, lines: ['Everything in Pro, plus', 'Their own computer · 60 h a month', 'Top AI models included', 'Priority support'] },
  ultra: { name: 'Ultra', price: 199.99, bots: 'Unlimited bots', hours: 150, lines: ['Everything in Max, plus', 'Their own computer · 150 h a month', 'Early access to new features'] },
} as const;
const planFor = (roles: number) => (roles <= 1 ? PLAN_BY_ID.pro : PLAN_BY_ID.max);
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}`;

function Cost({ onStart, signedIn }: { onStart: () => void; signedIn: boolean }) {
  const [roles, setRoles] = useState(3);
  const plan = planFor(roles);
  const humanYear = roles * (ASSISTANT_SALARY + ASSISTANT_EXTRA) * 12;
  const finoYear = Math.round(plan.price * 12);
  return (
    <section className="lp-cost" id="cost">
      <div className="lp-wrap">
        <Head text={t('A team for less than one day of wages.')} em={3} />
        <p className="lp-copy" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('One full-time assistant costs at least {amount} a month, before employer costs. Fino bots work nights and weekends, remember how you like things done, and each one has its own computer.', { amount: usd(ASSISTANT_SALARY) })}</p>

        <div className="lp-cost__ask" data-reveal style={{ '--i': 2 } as CSSProperties}>
          <span id="lp-roles-label">{t('How many people’s routine work?')}</span>
          <div className="lp-stepper" role="group" aria-labelledby="lp-roles-label">
            <button type="button" onClick={() => setRoles((r) => Math.max(1, r - 1))} disabled={roles <= 1} aria-label={t('Fewer')}><Minus size={18} aria-hidden /></button>
            <output aria-live="polite">{roles}</output>
            <button type="button" onClick={() => setRoles((r) => Math.min(6, r + 1))} disabled={roles >= 6} aria-label={t('More')}><Plus size={18} aria-hidden /></button>
          </div>
        </div>

        <div className="lp-cost__docs">
          <article className="lp-slipdoc lp-slipdoc--pay" data-reveal style={{ '--i': 3 } as CSSProperties} aria-label={t('Payroll for assistants')}>
            <header><b>{t('Payroll')}</b><span>{t(roles === 1 ? '{n} assistant · per month' : '{n} assistants · per month', { n: roles })}</span></header>
            <dl>
              <div><dt>{t('Salary')}</dt><dd>{usd(ASSISTANT_SALARY * roles)}</dd></div>
              <div><dt>{t('Employer costs')}</dt><dd>{usd(ASSISTANT_EXTRA * roles)}</dd></div>
              <div><dt>{t('Working hours')}</dt><dd>{t('40 a week each')}</dd></div>
              <div><dt>{t('Evenings, weekends, holidays')}</dt><dd>{t('Off')}</dd></div>
            </dl>
            <footer><span>{t('A year')}</span><strong key={humanYear} className="lp-total">{usd(humanYear)}</strong></footer>
          </article>

          <article className="lp-slipdoc lp-slipdoc--fino" data-reveal style={{ '--i': 4 } as CSSProperties} aria-label={t('Fino {plan} plan', { plan: plan.name })}>
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
          <button type="button" className="lp-btn" onClick={onStart}>{t(signedIn ? 'Open Fino' : 'Build my team')} <ArrowRight size={18} strokeWidth={2.4} aria-hidden /></button>
        </div>
        <p className="lp-fine" data-reveal style={{ '--i': 6 } as CSSProperties}>{t('Bots take on routine work on a computer: email, research, sheets, forms and follow-ups. You decide what they do, and they ask before anything final.')}</p>
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

function Jobs() {
  const [pick, setPick] = useState(JOBS[0].id);
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const job = JOBS.find((j) => j.id === pick) ?? JOBS[0];
  const story = STORIES[job.id];
  const img = characterDataUri(job.character, job.color);
  return (
    <section className="lp-jobs" id="jobs">
      <div className="lp-wrap">
        <Head text={t('Give each bot a job worth doing.')} em={2} />
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

/* ---- From sign-up to the first job ---- */
function FirstSteps() {
  const steps = [
    { t: 'Sign up', d: 'With Google or your email. No AI account or setup needed.' },
    { t: 'Meet Badr', d: 'Your Chief of Staff says hi and helps you pick the team you need.' },
    { t: 'Give a job', d: 'Type or say it. Watch the bot work, and approve what matters.' },
  ];
  return (
    <section className="lp-steps">
      <div className="lp-wrap">
        <Head text={t('Your first job in three steps.')} em={2} />
        <ol className="lp-steps__row">
          {steps.map((s, i) => (
            <li key={s.t} data-reveal style={{ '--i': 1 + i } as CSSProperties}><span className="lp-steps__n" aria-hidden>{i + 1}</span><b>{t(s.t)}</b><p>{t(s.d)}</p></li>
          ))}
        </ol>
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
        <Head text={t('Simple plans. No hiring.')} em={2} />
        <p className="lp-copy" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('Every plan includes Badr, Fino’s own AI models and the safety rules. Prices in US dollars a month; cancel anytime.')}</p>
        <ul className="lp-plans__row">
          {list.map((p, i) => (
            <li key={p.name} className={p.name === 'Max' ? 'is-pick' : ''} data-reveal style={{ '--i': 2 + i } as CSSProperties}>
              <b>{p.name}</b>
              {p.name === 'Max' && <em>{t('Most teams')}</em>}
              <strong>{usd(p.price)}<small>{t('/month')}</small></strong>
              <span className="lp-plans__bots">{t(p.bots)}</span>
              <ul>{p.lines.map((l) => l.startsWith('Everything in ') ? <li key={l} className="lp-plans__plus">{t(l)}</li> : <li key={l}><Check size={15} strokeWidth={2.6} aria-hidden />{t(l)}</li>)}</ul>
              <button type="button" className={`lp-btn ${p.name === 'Max' ? '' : 'lp-btn--line'}`} onClick={onStart}>{signedIn ? t('Open Fino') : t('Start with {plan}', { plan: p.name })}</button>
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
