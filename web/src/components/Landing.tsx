import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react';
import { ArrowRight, Download, Eye, Hand, ShieldCheck, X } from 'lucide-react';
import { AuthPanel } from './AuthPanel';
import '../styles/landing.css';

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

type Bot = { id: string; name: string; role: string; img: string; reply: string; match: RegExp };
// An example team. Every new account starts with Quinn; people add the others themselves.
const TEAM: Bot[] = [
  { id: 'nour', name: 'Nour', role: 'Research', img: '/characters/fruits/orange.webp', reply: 'On it. I’ll open my browser, search, and come back with a shortlist.', match: /find|search|research|compare|flight|job|price|look up|best/i },
  { id: 'quinn', name: 'Quinn', role: 'Chief of Staff', img: '/characters/fruits/watermelon.webp', reply: 'Got it. I’ll take this on and hand parts to the right teammate.', match: /$^/ },
  { id: 'kai', name: 'Kai', role: 'Inbox', img: '/characters/fruits/olive.webp', reply: 'I’ll read your inbox, flag what matters, and draft replies for your OK.', match: /mail|inbox|repl|newsletter|unsubscribe/i },
  { id: 'sol', name: 'Sol', role: 'Planner', img: '/characters/fruits/fig.webp', reply: 'I’ll check your calendar and lay out the week, with time to breathe.', match: /plan|week|calendar|schedule|meeting|day|remind/i },
];
const QUINN = TEAM[1];
const pickBot = (task: string) => TEAM.find((b) => b.match.test(task)) ?? QUINN;
const EXAMPLES = ['Clear my inbox', 'Plan my week', 'Compare flights to Lisbon', 'Summarize this report'];

export function Landing({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: (mode: 'signin' | 'signup') => void }) {
  const [task, setTask] = useState('');
  const [said, setSaid] = useState<Bot | null>(null);
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
  const choose = (example: string) => { setTask(example); setSaid(pickBot(example)); };
  // The matching bot answers a moment after typing stops.
  useEffect(() => {
    if (!task.trim()) return;
    const id = setTimeout(() => setSaid(pickBot(task)), 450);
    return () => clearTimeout(id);
  }, [task]);

  return (
    <div className="lp" ref={root}>
      <section className="lp-open">
        <nav className="lp-nav lp-in" style={{ '--d': '0ms' } as CSSProperties} aria-label="Fino">
          <a className="lp-mark" href="/welcome"><img src="/characters/fino-brand-blue.png" alt="" width={36} height={36} /><span>Fino</span></a>
          <div className="lp-nav__links">
            <a href="#demo">See it work</a>
            <a href="#mac">Mac app</a>
            {signedIn
              ? <a className="lp-pill lp-pill--light" href="/">Open Fino</a>
              : <><button type="button" className="lp-nav__signin" onClick={() => start('signin')}>Sign in</button>
                <button type="button" className="lp-pill lp-pill--light" onClick={() => start('signup')}>Get started</button></>}
          </div>
        </nav>

        <div className="lp-open__body">
          <h1 className="lp-h1"><span className="lp-line"><span className="lp-in" style={{ '--d': '80ms' } as CSSProperties}>Give your</span></span> <span className="lp-line"><span className="lp-in" style={{ '--d': '170ms' } as CSSProperties}>AI team a job.</span></span></h1>
          <p className="lp-lede lp-in" style={{ '--d': '300ms' } as CSSProperties}>Fino bots have a name, a memory and their own browser. They read your email, research, plan your days and click through websites for you, while you watch.</p>

          <form className="lp-slip lp-in" style={{ '--d': '400ms' } as CSSProperties} onSubmit={giveJob}>
            <label htmlFor="lp-task" className="lp-sr">What should your team do?</label>
            <input id="lp-task" value={task} onChange={(e) => setTask(e.target.value)} placeholder="Find five flats near my office and compare the rent…" autoComplete="off" maxLength={2000} />
            <button type="submit" className="lp-slip__go">{signedIn ? 'Open Fino' : 'Get started'} <ArrowRight size={20} strokeWidth={2.4} aria-hidden /></button>
          </form>
          <div className="lp-chips lp-in" style={{ '--d': '480ms' } as CSSProperties} role="group" aria-label="Example jobs">
            {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => choose(ex)} aria-pressed={task === ex}>{ex}</button>)}
          </div>
        </div>

        <div className="lp-team">
          <div className="lp-bubble-slot" aria-live="polite">{said && <blockquote key={said.id} className="lp-bubble"><b>{said.name} · {said.role}</b>{said.reply}</blockquote>}</div>
          {TEAM.map((b, i) => (
            <figure key={b.id} className={`lp-bot lp-bot--${b.id}${said?.id === b.id ? ' is-up' : ''}`} style={{ '--d': `${560 + i * 90}ms`, '--bob': `${i * -0.9}s` } as CSSProperties}>
              <span className="lp-bot__pop"><span className="lp-bot__float"><img src={b.img} alt="" draggable={false} /></span></span>
              <figcaption><b>{b.name}</b> <span>{b.role}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <Demo />

      <section className="lp-apps">
        <div className="lp-wrap lp-apps__in">
          <h2 className="lp-h2" data-reveal>It works where you already work.</h2>
          <p className="lp-copy" data-reveal style={{ '--i': 1 } as CSSProperties}>Connect Gmail, Google Calendar, Drive, Slack, Notion and hundreds more. Bots read on their own; anything that sends, posts or deletes waits for your OK first.</p>
          <ul className="lp-logos" aria-label="Some apps you can connect">
            {[['Slack', '/assets/icons/slack.svg'], ['Notion', '/assets/apps/notion.png'], ['Google Docs', '/assets/apps/google-docs.png'], ['Google Sheets', '/assets/apps/google-sheets.png'], ['Dropbox', '/assets/apps/dropbox.png'], ['Linear', '/assets/apps/linear.png'], ['Canva', '/assets/apps/canva.png']].map(([name, src], i) => (
              <li key={name} data-reveal style={{ '--i': 2 + i } as CSSProperties}><img src={src} alt="" width={30} height={30} /><span>{name}</span></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lp-charge">
        <div className="lp-wrap">
          <h2 className="lp-h2" data-reveal>You stay in charge.</h2>
          <ol className="lp-rules">
            <li data-reveal style={{ '--i': 1 } as CSSProperties}><Eye size={28} aria-hidden /><div><b>Watch it live.</b> Every click the bot makes shows up on screen, cursor and all.</div></li>
            <li data-reveal style={{ '--i': 2 } as CSSProperties}><ShieldCheck size={28} aria-hidden /><div><b>Approve first.</b> Emails, posts and payments wait until you say yes.</div></li>
            <li data-reveal style={{ '--i': 3 } as CSSProperties}><Hand size={28} aria-hidden /><div><b>Take over anytime.</b> Grab the browser yourself, then hand it back.</div></li>
          </ol>
        </div>
      </section>

      <MacBand />

      <section className="lp-close" id="start">
        <div className="lp-wrap lp-close__in">
          <div className="lp-close__copy" data-reveal>
            <h2 className="lp-h2">Meet your team today.</h2>
            <p className="lp-copy">Create your account with Google or your email. Quinn, your Chief of Staff, is waiting in the first chat.</p>
          </div>
          <div className="lp-close__panel" data-reveal style={{ '--i': 2 } as CSSProperties}>
            {signedIn ? <div className="auth"><h2 className="auth__title">You’re signed in.</h2><a className="auth__submit" href="/">Open Fino</a></div> : <AuthPanel initial="signup" />}
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot__in">
          <span className="lp-mark lp-mark--small"><img src="/characters/fino-brand-blue.png" alt="" width={24} height={24} /> Fino</span>
          <nav aria-label="Legal"><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/support.html">Support</a></nav>
        </div>
      </footer>
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
        <h2 className="lp-h2" data-reveal>Watch it work.</h2>
        <p className="lp-copy" data-reveal style={{ '--i': 1 } as CSSProperties}>Ask in chat. The bot opens its own browser, and you see every move it makes.</p>
      </div>
      <div className={`lp-desk${fade ? ' is-fading' : ''}`} data-reveal style={{ '--i': 2 } as CSSProperties} aria-label="Demo: a bot searching a jobs site in its browser">
        <div className="lp-desk__chat">
          <div className="lp-desk__head"><img src="/characters/fruits/orange.webp" alt="" width={28} height={28} /> Nour <span>Research</span></div>
          <div className="lp-msgs">
            {msgs.map((m) => <p key={m.id} className={m.who === 'me' ? 'lp-msg lp-msg--me' : m.who === 'bot' ? 'lp-msg' : 'lp-step'}>{m.text}</p>)}
            {thinking && <p className="lp-msg lp-typing" aria-label="Nour is typing"><i /><i /><i /></p>}
          </div>
          <div className="lp-desk__composer">Message Nour…</div>
        </div>
        <div className="lp-desk__browser">
          <div className="lp-desk__bar"><i /><i /><i /><span>jobs.example.com</span><em><b className="lp-live-dot" />Bot connected</em></div>
          <div className="lp-site" ref={site}>
            <div className="lp-site__brand">jobboard</div>
            <div ref={job} className={`lp-site__field${focus === 'job' ? ' is-focus' : ''}`}>{jobText || <span>Job title or keyword</span>}{focus === 'job' && <b className="lp-caret" />}</div>
            <div ref={city} className={`lp-site__field${focus === 'city' ? ' is-focus' : ''}`}>{cityText || <span>City</span>}{focus === 'city' && <b className="lp-caret" />}</div>
            <div ref={go} className={`lp-site__search${pressed ? ' is-pressed' : ''}`}>Search jobs</div>
            <ul className={`lp-site__results${results ? ' is-in' : ''}`}>
              {RESULTS.map((r, i) => <li key={r} style={{ transitionDelay: results ? `${i * 90}ms` : '0ms' }}><b>{r.split(' · ')[0]}</b><span>{r.split(' · ')[1]} · Amsterdam</span></li>)}
            </ul>
            <span className="lp-cursor" aria-hidden style={{ '--x': cursor.x, '--y': cursor.y } as CSSProperties}>
              <i key={cursor.click} className={cursor.click ? 'is-click' : ''} />
              <svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#1c1c1c" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            </span>
          </div>
        </div>
        <span className="lp-desk__tag">Demo</span>
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
          <h2 className="lp-h2">Fino for Mac.</h2>
          <p className="lp-copy">The same workspace in its own window, with the Fino Browser docked beside your chat. Your bot drives it with a visible cursor; you can grab it any time.</p>
          {info?.available === false
            ? <p className="lp-mac__soon">The Mac app download is coming soon.</p>
            : <a className="lp-pill lp-pill--dark lp-mac__dl" href="/api/download/mac" download onClick={() => store.drop(OFFER_MAC)}><Download size={20} aria-hidden /> Download for Mac</a>}
          <p className="lp-mac__fine">For macOS 14 or later on Apple silicon{size && ` · ${size}`}. Open the download and move Fino to Applications. If macOS says it can’t check Fino the first time, open System Settings → Privacy & Security and choose Open Anyway.</p>
        </div>
        <div className="lp-mac__window" data-reveal style={{ '--i': 2 } as CSSProperties} aria-hidden>
          <div className="lp-mac__lights"><i /><i /><i /></div>
          <div className="lp-mac__panes">
            <div className="lp-mac__side">{TEAM.slice(0, 4).map((b) => <span key={b.id}><img src={b.img} alt="" />{b.name}</span>)}</div>
            <div className="lp-mac__chat"><p /><p /><p className="me" /><p /></div>
            <div className="lp-mac__browser"><em>Fino Browser</em><div /><div /><div /><span className="lp-cursor lp-cursor--still" style={{ '--x': 0.56, '--y': 0.5 } as CSSProperties}><svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#1c1c1c" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg><i /></span></div>
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
      <img src="/characters/fino-brand-blue.png" alt="" width={44} height={44} />
      <div><b>Get Fino for Mac</b><span>Your bot gets its own browser beside your chat.</span></div>
      <a className="mac-offer__dl" href="/api/download/mac" download onClick={close}><Download size={16} aria-hidden /> Download</a>
      <button type="button" className="mac-offer__x" onClick={close} aria-label="Not now"><X size={16} /></button>
    </aside>
  );
}
