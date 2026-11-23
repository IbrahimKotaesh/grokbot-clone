import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  { id: 'nour', name: 'Nour', role: 'Research', img: '/characters/dino.png', reply: 'On it. I’ll open my browser, search, and come back with a shortlist.', match: /find|search|research|compare|flight|job|price|look up|best/i },
  { id: 'kai', name: 'Kai', role: 'Inbox', img: '/characters/ghost.png', reply: 'I’ll read your inbox, flag what matters, and draft replies for your OK.', match: /mail|inbox|repl|newsletter|unsubscribe/i },
  { id: 'quinn', name: 'Quinn', role: 'Chief of Staff', img: '/characters/fino-brand-blue.png', reply: 'Got it. I’ll split this up and hand each part to the right teammate.', match: /$^/ },
  { id: 'sol', name: 'Sol', role: 'Planner', img: '/characters/pebble.png', reply: 'I’ll check your calendar and lay out the week, with time to breathe.', match: /plan|week|calendar|schedule|meeting|day|remind/i },
  { id: 'mira', name: 'Mira', role: 'Writer', img: '/characters/arch.png', reply: 'Send it over. I’ll read it and write you a clear one-page summary.', match: /write|draft|summar|doc|post|report|translate/i },
];
const pickBot = (task: string) => TEAM.find((b) => b.match.test(task)) ?? TEAM[2];
const EXAMPLES = ['Clear my inbox', 'Plan my week', 'Compare flights to Lisbon', 'Summarize this report'];

export function Landing({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: (mode: 'signin' | 'signup') => void }) {
  const [task, setTask] = useState('');
  const [said, setSaid] = useState<Bot | null>(null);
  const start = (mode: 'signin' | 'signup' = 'signup') => {
    store.set(OFFER_MAC, '1');
    if (signedIn) { location.href = '/'; return; }
    onSignIn(mode);
  };
  const giveJob = (e: FormEvent) => {
    e.preventDefault();
    const job = task.trim();
    if (!job) { setSaid(TEAM[2]); return; }
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
    <div className="lp">
      <section className="lp-open">
        <nav className="lp-nav" aria-label="Fino">
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
          <h1 className="lp-h1">Give your AI&nbsp;team a&nbsp;job.</h1>
          <p className="lp-lede">Fino bots have a name, a memory and their own browser. They read your email, research, plan your days and click through websites for you, while you watch.</p>

          <form className="lp-slip" onSubmit={giveJob}>
            <label htmlFor="lp-task" className="lp-sr">What should your team do?</label>
            <input id="lp-task" value={task} onChange={(e) => setTask(e.target.value)} placeholder="Find five flats near my office and compare the rent…" autoComplete="off" maxLength={2000} />
            <button type="submit" className="lp-slip__go">{signedIn ? 'Open Fino' : 'Get started'} <ArrowRight size={20} strokeWidth={2.4} aria-hidden /></button>
          </form>
          <div className="lp-chips" role="group" aria-label="Example jobs">
            {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => choose(ex)} aria-pressed={task === ex}>{ex}</button>)}
          </div>
        </div>

        <div className="lp-team">
          <div className="lp-bubble-slot" aria-live="polite">{said && <blockquote key={said.id} className="lp-bubble"><b>{said.name} · {said.role}</b>{said.reply}</blockquote>}</div>
          {TEAM.map((b) => (
            <figure key={b.id} className={`lp-bot lp-bot--${b.id}${said?.id === b.id ? ' is-up' : ''}`}>
              <img src={b.img} alt="" draggable={false} />
              <figcaption><b>{b.name}</b> <span>{b.role}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <Demo />

      <section className="lp-apps">
        <div className="lp-wrap lp-apps__in">
          <h2 className="lp-h2">It works where you already work.</h2>
          <p className="lp-copy">Connect Gmail, Google Calendar, Drive, Slack, Notion and hundreds more. Bots read on their own; anything that sends, posts or deletes waits for your OK first.</p>
          <ul className="lp-logos" aria-label="Some apps you can connect">
            {[['Slack', '/assets/icons/slack.svg'], ['Notion', '/assets/apps/notion.png'], ['Google Docs', '/assets/apps/google-docs.png'], ['Google Sheets', '/assets/apps/google-sheets.png'], ['Dropbox', '/assets/apps/dropbox.png'], ['Linear', '/assets/apps/linear.png'], ['Canva', '/assets/apps/canva.png']].map(([name, src]) => (
              <li key={name}><img src={src} alt="" width={30} height={30} /><span>{name}</span></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lp-charge">
        <div className="lp-wrap">
          <h2 className="lp-h2">You stay in charge.</h2>
          <ol className="lp-rules">
            <li><Eye size={28} aria-hidden /><div><b>Watch it live.</b> Every click the bot makes shows up on screen, cursor and all.</div></li>
            <li><ShieldCheck size={28} aria-hidden /><div><b>Approve first.</b> Emails, posts and payments wait until you say yes.</div></li>
            <li><Hand size={28} aria-hidden /><div><b>Take over anytime.</b> Grab the browser yourself, then hand it back.</div></li>
          </ol>
        </div>
      </section>

      <MacBand />

      <section className="lp-close" id="start">
        <div className="lp-wrap lp-close__in">
          <div className="lp-close__copy">
            <h2 className="lp-h2">Meet your team today.</h2>
            <p className="lp-copy">Create your account with Google or your email. Quinn, your Chief of Staff, is waiting in the first chat.</p>
          </div>
          <div className="lp-close__panel">
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
const STEPS = 9;
function Demo() {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const [live, setLive] = useState(false);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting), { threshold: 0.35 });
    io.observe(el); return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (reduced) { setStep(STEPS - 1); return; }
    if (!live) return;
    const id = setTimeout(() => setStep((s) => (s + 1) % STEPS), step === STEPS - 1 ? 4200 : step === 0 ? 900 : 1150);
    return () => clearTimeout(id);
  }, [live, step, reduced]);
  const typed = (text: string, from: number) => (step > from ? text : step === from ? text.slice(0, Math.ceil(text.length / 2)) : '');
  const done = step >= 7;

  return (
    <section className="lp-demo" id="demo" ref={ref}>
      <div className="lp-wrap">
        <h2 className="lp-h2">Watch it work.</h2>
        <p className="lp-copy">Ask in chat. The bot opens its own browser, and you see every move it makes.</p>
      </div>
      <div className="lp-desk" aria-label="Demo: a bot searching a jobs site in its browser">
        <div className="lp-desk__chat">
          <div className="lp-desk__head"><img src="/characters/dino.png" alt="" width={28} height={28} /> Nour <span>Research</span></div>
          <div className="lp-msgs">
            <p className="lp-msg lp-msg--me">Find financial analyst jobs in Amsterdam and shortlist five.</p>
            {step >= 1 && <p className="lp-msg">Opening a jobs site in my browser.</p>}
            {step >= 3 && <p className="lp-step">Typing “financial analyst”</p>}
            {step >= 5 && <p className="lp-step">Typing “Amsterdam” · Search</p>}
            {done && <p className="lp-msg">Here are five that fit. Two are hybrid, one is in English only. Save them to a sheet?</p>}
          </div>
          <div className="lp-desk__composer">Message Nour…</div>
        </div>
        <div className="lp-desk__browser">
          <div className="lp-desk__bar"><i /><i /><i /><span>jobs.example.com</span><em>Bot connected</em></div>
          <div className={`lp-site lp-site--s${step}`}>
            <div className="lp-site__brand">jobboard</div>
            <div className="lp-site__field">{typed('financial analyst', 2) || <span>Job title or keyword</span>}</div>
            <div className="lp-site__field">{typed('Amsterdam', 4) || <span>City</span>}</div>
            <div className={`lp-site__search${step === 6 ? ' is-pressed' : ''}`}>Search jobs</div>
            <ul className={`lp-site__results${done ? ' is-in' : ''}`}>
              {['Financial Analyst · fintech scale-up', 'FP&A Analyst · logistics group', 'Junior Financial Analyst · bank', 'Investment Analyst · climate fund', 'Business Analyst, Finance · retail'].map((r, i) => <li key={r} style={{ transitionDelay: `${i * 70}ms` }}><b>{r.split(' · ')[0]}</b><span>{r.split(' · ')[1]} · Amsterdam</span></li>)}
            </ul>
            <span className="lp-cursor" aria-hidden><svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#1c1c1c" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg><i /></span>
          </div>
        </div>
        <span className="lp-desk__tag">Demo</span>
      </div>
    </section>
  );
}

function MacBand() {
  const [info, setInfo] = useState<{ available: boolean; bytes?: number } | null>(null);
  useEffect(() => { fetch('/api/download/mac/info').then((r) => r.json()).then(setInfo).catch(() => setInfo({ available: false })); }, []);
  const size = info?.bytes ? `${(info.bytes / 1048576).toFixed(1)} MB` : '';
  return (
    <section className="lp-mac" id="mac">
      <div className="lp-wrap lp-mac__in">
        <div>
          <h2 className="lp-h2">Fino for Mac.</h2>
          <p className="lp-copy">The same workspace in its own window, with the Fino Browser docked beside your chat. Your bot drives it with a visible cursor; you can grab it any time.</p>
          {info?.available === false
            ? <p className="lp-mac__soon">The Mac app download is coming soon.</p>
            : <a className="lp-pill lp-pill--dark lp-mac__dl" href="/api/download/mac" download onClick={() => store.drop(OFFER_MAC)}><Download size={20} aria-hidden /> Download for Mac</a>}
          <p className="lp-mac__fine">For macOS 14 or later on Apple silicon{size && ` · ${size}`}. Unzip, move Fino to Applications. The first time, right-click Fino and choose Open.</p>
        </div>
        <div className="lp-mac__window" aria-hidden>
          <div className="lp-mac__lights"><i /><i /><i /></div>
          <div className="lp-mac__panes">
            <div className="lp-mac__side">{TEAM.slice(0, 4).map((b) => <span key={b.id}><img src={b.img} alt="" />{b.name}</span>)}</div>
            <div className="lp-mac__chat"><p /><p /><p className="me" /><p /></div>
            <div className="lp-mac__browser"><em>Fino Browser</em><div /><div /><div /><span className="lp-cursor lp-cursor--still"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#1c1c1c" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg><i /></span></div>
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
