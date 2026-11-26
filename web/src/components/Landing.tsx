import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react';
import { ArrowRight, Check, Download, Eye, Globe, Hand, Minus, Plus, ShieldCheck, X } from 'lucide-react';
import { AuthPanel } from './AuthPanel';
import { CLAY, characterDataUri } from '../../../packages/contracts/src/characters';
import { JOBS } from '../../../packages/contracts/src/jobs';
import { lang, setLangChoice, t } from '../lib/i18n';
import '../styles/landing.css';
import { BlurWords, ScrollContainer, ScrollFade } from '../lib/motion';

/** A section headline: words arrive out of a blur, and it fades away as it scrolls off the top. */
const Headline = ({ text }: { text: string }) => <ScrollFade fadeIn={false}><BlurWords as="h2" className="lp-h2" when="view" text={text} /></ScrollFade>;

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
const QUINN = TEAM[1];
// Badr, Fino's main character, is the logo: yellow on the tomato header.
const MARK = characterDataUri('accountant', 'yellow');
const pickBot = (task: string) => TEAM.find((b) => b.match.test(task)) ?? QUINN;
const EXAMPLES = ['Summarize this report', 'Work out this year’s taxes', 'Find cheap flights to Barcelona', 'What’s on my plate today?', 'Write an email for me'];
// Short jobs that type themselves into the empty task box, one after another; each fits the box on a phone.
const HINTS = ['Write an email for me', 'Find cheap flights to Lisbon', 'What’s on my plate today?', 'Work out this year’s taxes', 'Summarize this report'];

/** The task box's placeholder, typed and erased like someone trying ideas. Still with reduced motion. */
function useTypedHint() {
  const [hint, setHint] = useState(() => t(HINTS[0]));
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
    <ScrollContainer value={root}>
    <div className="lp" ref={root}>
      <section className="lp-open">
        <nav className="lp-nav lp-in" style={{ '--d': '0ms' } as CSSProperties} aria-label="Badr">
          <a className="lp-mark" href="/welcome" aria-label="Badr"><img src={MARK} alt="" width={36} height={36} /><span>{t('Badr')}</span></a>
          <div className="lp-nav__links">
            <a href="#demo">{t('See it work')}</a>
            <a href="#plans">{t('Plans')}</a>
            <a href="#mac">{t('Mac app')}</a>
            <LangSwitch />
            {signedIn
              ? <a className="lp-pill lp-pill--light" href="/">{t('Open Fino')}</a>
              : <><button type="button" className="lp-nav__signin" onClick={() => start('signin')}>{t('Sign in')}</button>
                <button type="button" className="lp-pill lp-pill--light" onClick={() => start('signup')}>{t('Get started')}</button></>}
          </div>
        </nav>

        <div className="lp-open__body">
          <h1 className="lp-h1" aria-label={`${t('Hire a team.')} ${t('Not a payroll.')}`}><BlurWords className="lp-line lp-line--words" text={t('Hire a team.')} delay={0.1} stagger={0.09} /> <BlurWords className="lp-line lp-line--words" text={t('Not a payroll.')} delay={0.32} stagger={0.09} /></h1>
          <p className="lp-lede lp-in" style={{ '--d': '300ms' } as CSSProperties}>{t('Fino bots have a name, a memory and their own computer. Tell them what you need, by text or by voice, and they get to work around the clock. Plans start at less a month than an assistant earns in a day.')}</p>

          <form className="lp-slip lp-in" style={{ '--d': '400ms' } as CSSProperties} onSubmit={giveJob}>
            <label htmlFor="lp-task" className="lp-sr">{t('What should your team do?')}</label>
            <input id="lp-task" value={task} onChange={(e) => setTask(e.target.value)} placeholder={hint} autoComplete="off" maxLength={2000} />
            <button type="submit" className="lp-slip__go">{t(signedIn ? 'Open Fino' : 'Get started')} <ArrowRight size={20} strokeWidth={2.4} aria-hidden /></button>
          </form>
          <div className="lp-chips lp-in" style={{ '--d': '480ms' } as CSSProperties} role="group" aria-label={t('Example jobs')}>
            {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => choose(ex)} aria-pressed={task === t(ex)}>{t(ex)}</button>)}
          </div>
          <p className="lp-models lp-in" style={{ '--d': '540ms' } as CSSProperties}>
            <span>{t('Powered by the world’s best AI')}</span>
            <b><img src="/brands/chatgpt.svg" alt="" width={18} height={18} />ChatGPT</b>
            <b><img src="/brands/claude.svg" alt="" width={18} height={18} />Claude</b>
          </p>
        </div>

        <div className="lp-team">
          <div className="lp-bubble-slot" aria-live="polite">{said && <blockquote key={said.id} className="lp-bubble"><b>{t(said.name)} · {t(said.role)}</b>{t(said.reply)}</blockquote>}</div>
          {TEAM.map((b, i) => (
            <figure key={b.id} className={`lp-bot lp-bot--${b.id}${said?.id === b.id ? ' is-up' : ''}`} style={{ '--d': `${560 + i * 90}ms`, '--bob': `${i * -0.9}s`, '--c': CLAY[b.color], '--k': `${i * -1.7}s` } as CSSProperties}>
              <span className="lp-bot__pop">
                <Screen id={b.id} />
                <span className="lp-bot__lift"><span className="lp-bot__float"><img src={b.img} alt="" draggable={false} /></span></span>
              </span>
              <span className="lp-deskbar" aria-hidden>
                <span className="lp-kb"><i className="lp-hand" /><i className="lp-hand lp-hand--r" /></span>
                {b.id === 'quinn' && <span className="lp-mug"><i /><i /></span>}
                {b.id === 'sol' && <span className="lp-plant"><i /><i /><i /></span>}
              </span>
              <figcaption><b>{t(b.name)}</b> <span>{t(b.role)}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <Cost onStart={() => start('signup')} signedIn={signedIn} />

      <Demo />

      <Jobs />

      <FirstSteps />

      <section className="lp-apps">
        <div className="lp-wrap lp-apps__in">
          <Headline text={t('It works where you already work.')} />
          <p className="lp-copy" data-reveal style={{ '--i': 1 } as CSSProperties}>{t('Connect Gmail, Google Calendar, Drive, Slack, Notion and hundreds more. Bots read on their own; anything that sends, posts or deletes waits for your OK first.')}</p>
          <ul className="lp-logos" aria-label={t('Some apps you can connect')}>
            {[['Slack', '/assets/icons/slack.svg'], ['Notion', '/assets/apps/notion.png'], ['Google Docs', '/assets/apps/google-docs.png'], ['Google Sheets', '/assets/apps/google-sheets.png'], ['Dropbox', '/assets/apps/dropbox.png'], ['Linear', '/assets/apps/linear.png'], ['Canva', '/assets/apps/canva.png']].map(([name, src], i) => (
              <li key={name} data-reveal style={{ '--i': 2 + i } as CSSProperties}><img src={src} alt="" width={30} height={30} /><span>{name}</span></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lp-charge">
        <div className="lp-wrap">
          <Headline text={t('You stay in charge.')} />
          <ol className="lp-rules">
            <li data-reveal style={{ '--i': 1 } as CSSProperties}><Eye size={28} aria-hidden /><div><b>{t('Watch it live.')}</b> {t('Every click the bot makes shows up on screen, cursor and all.')}</div></li>
            <li data-reveal style={{ '--i': 2 } as CSSProperties}><ShieldCheck size={28} aria-hidden /><div><b>{t('Approve first.')}</b> {t('Emails, posts and anything final wait until you say yes. Fino never pays for you.')}</div></li>
            <li data-reveal style={{ '--i': 3 } as CSSProperties}><Hand size={28} aria-hidden /><div><b>{t('Take over anytime.')}</b> {t('Grab the browser yourself, then hand it back.')}</div></li>
          </ol>
        </div>
      </section>

      <Plans onStart={() => start('signup')} signedIn={signedIn} />

      <MacBand />

      <section className="lp-close" id="start">
        <div className="lp-wrap lp-close__in">
          <div className="lp-close__copy" data-reveal>
            <h2 className="lp-h2">{t('Meet your team today.')}</h2>
            <p className="lp-copy">{t('Create your account with Google or your email. Badr, your Chief of Staff, is waiting in the first chat.')}</p>
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
    </ScrollContainer>
  );
}

/* Each bot's own computer on the opening scene: a looping, wordless picture of the work it does.
   Nour searches the web, Badr ticks off the team's tasks, Kai writes an email that waits for your OK,
   Sol fills the week. Pure CSS; with reduced motion every screen shows its finished state. */
function Screen({ id }: { id: string }) {
  const rows = (n: number) => Array.from({ length: n }, (_, k) => k);
  return (
    <span className={`lp-scr lp-scr--${id}`} aria-hidden>
      {id === 'nour' && <>
        <i className="lp-scr__url" />
        <i className="lp-scr__find"><b /></i>
        {rows(3).map((k) => <i key={k} className={`lp-scr__hit lp-k${k + 1}`}><s /><u /></i>)}
      </>}
      {id === 'quinn' && <>
        {rows(3).map((k) => <i key={k} className={`lp-scr__task lp-k${k + 1}`}><s><b /></s><u /></i>)}
        <i className="lp-scr__bar"><b /></i>
      </>}
      {id === 'kai' && <>
        <i className="lp-scr__to" /><i className="lp-scr__subj" />
        {rows(3).map((k) => <i key={k} className={`lp-scr__line lp-l${k + 1}`} />)}
        <i className="lp-scr__ok lp-k4">✓</i>
      </>}
      {id === 'sol' && <>
        <i className="lp-scr__grid" />
        {rows(4).map((k) => <i key={k} className={`lp-scr__slot lp-s${k + 1} lp-k${k + 1}`} />)}
      </>}
    </span>
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

function MacBand() {
  const [info, setInfo] = useState<{ available: boolean; bytes?: number } | null>(null);
  useEffect(() => { fetch('/api/download/mac/info').then((r) => r.json()).then(setInfo).catch(() => setInfo({ available: false })); }, []);
  const size = info?.bytes ? `${(info.bytes / 1048576).toFixed(1)} MB` : '';
  return (
    <section className="lp-mac" id="mac">
      <div className="lp-wrap lp-mac__in">
        <div data-reveal>
          <h2 className="lp-h2">{t('Fino for Mac.')}</h2>
          <p className="lp-copy">{t('The same workspace in its own window, with the Fino Browser docked beside your chat. Your bot drives it with a visible cursor; you can grab it any time.')}</p>
          {info?.available === false
            ? <p className="lp-mac__soon">{t('The Mac app download is coming soon.')}</p>
            : <a className="lp-pill lp-pill--dark lp-mac__dl" href="/api/download/mac" download onClick={() => store.drop(OFFER_MAC)}><Download size={20} aria-hidden /> {t('Download for Mac')}</a>}
          <p className="lp-mac__fine">{t('For macOS 14 or later on Apple silicon')}{size && ` · ${size}`}. {t('Open the download and move Fino to Applications. If macOS says it can’t check Fino the first time, open System Settings → Privacy & Security and choose Open Anyway.')}</p>
        </div>
        <div className="lp-mac__window" data-reveal style={{ '--i': 2 } as CSSProperties} aria-hidden>
          <div className="lp-mac__lights"><i /><i /><i /></div>
          <div className="lp-mac__panes">
            <div className="lp-mac__side">{TEAM.slice(0, 4).map((b) => <span key={b.id}><img src={b.img} alt="" />{t(b.name)}</span>)}</div>
            <div className="lp-mac__chat"><p /><p /><p className="me" /><p /></div>
            <div className="lp-mac__browser"><em>{t('Fino Browser')}</em><div /><div /><div /><span className="lp-cursor lp-cursor--still" style={{ '--x': 0.56, '--y': 0.5 } as CSSProperties}><svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#1c1c1c" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg><i /></span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Shown once inside the web workspace after signing up from the landing page. */
export function MacOffer() {
  const [show, setShow] = useState(() => store.get(OFFER_MAC) === '1');
  if (!show) return null;
  const close = () => { store.drop(OFFER_MAC); setShow(false); };
  return (
    <aside className="mac-offer" role="status">
      <img src={MARK} alt="" width={44} height={44} />
      <div><b>{t('Get Fino for Mac')}</b><span>{t('Your bot gets its own browser beside your chat.')}</span></div>
      <a className="mac-offer__dl" href="/api/download/mac" download onClick={close}><Download size={16} aria-hidden /> {t('Download')}</a>
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
        <Headline text={t('A team for less than one day of wages.')} />
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
          <button type="button" className="lp-pill lp-pill--blue" onClick={onStart}>{t(signedIn ? 'Open Fino' : 'Build my team')} <ArrowRight size={18} strokeWidth={2.4} aria-hidden /></button>
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
        <Headline text={t('Your first job in three steps.')} />
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
