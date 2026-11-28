import { useEffect, useMemo, useState } from 'react';
import { Cpu, Sparkles, Timer } from 'lucide-react';
import { lang, locale, t } from '../lib/i18n';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { useStore, displayName } from '../store';
import { BlurWords } from '../lib/motion';

type Range = 'today' | '7d' | '30d' | 'month';
type Metric = 'cost' | 'tokens' | 'turns';
interface Bucket { t: number; turns: number; tokens: number; cost: number }
interface BotUse { botId: string; turns: number; tokens: number; cost: number; busyMinutes: number; computerSteps: number; images: number; lastAt: number }
interface ModelUse { label: string; kind: 'badr' | 'subscription' | 'key'; turns: number; tokens: number; cost: number }
interface Report {
  range: Range; from: number; to: number; hourly: boolean; buckets: Bucket[];
  totals: { turns: number; tokens: number; input: number; output: number; cost: number; busyMinutes: number; computerSteps: number; images: number };
  bots: BotUse[]; models: ModelUse[];
  month: { cost: number; projected: number; plan: { id: string; name: string; priceUsd: number; computerHours: number | null }; computer: { usedMinutes: number; limitMinutes: number | null }; includedUsed: { chat: number | null; computer: number | null }; limits?: { session: { pct: number; resetsAt: number }; week: { pct: number; resetsAt: number }; month: { pct: number; resetsAt: number } } | null };
}

const loc = lang === 'nl' ? 'nl-NL' : lang === 'ar' ? 'ar-u-nu-latn' : 'en-US';
const num = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const usd = (n: number) => {
  if (n > 0 && n < 0.01) return '<$0.01';
  const digits = n < 100 ? 2 : 0;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};
const dur = (min: number) => {
  if (min > 0 && min < 1) return t('{s} sec', { s: Math.max(1, Math.round(min * 60)) });
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return min >= 60 ? (m ? t('{h} h {m} min', { h, m }) : t('{h} h', { h })) : t('{m} min', { m: Math.round(min) });
};
const value = (x: { cost: number; tokens: number; turns: number }, m: Metric) => (m === 'cost' ? x.cost : m === 'tokens' ? x.tokens : x.turns);
const show = (v: number, m: Metric) => (m === 'cost' ? usd(v) : num(v));

function Seg<T extends string>({ value: v, options, onPick, label }: { value: T; options: [T, string][]; onPick: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map(([k, text]) => <button key={k} type="button" role="tab" aria-selected={v === k} className={v === k ? 'is-on' : ''} onClick={() => onPick(k)}>{text}</button>)}
    </div>
  );
}

/** A "what's left" card: a meter that empties as the month is used. */
/** When a usage window comes back: "in 5 h", "on Monday", "on 1 December" (in the reader's language). */
function backIn(at: number): string {
  const mins = Math.max(1, Math.ceil((at - Date.now()) / 60_000));
  if (mins < 60) return t('in {n} min', { n: mins });
  const h = Math.ceil(mins / 60);
  if (h <= 5) return t('in {h} h {m} min', { h: Math.floor(mins / 60), m: mins % 60 });
  if (h <= 24) return t('in {n} h', { n: h });
  const day = new Date(at).toLocaleDateString(locale, h <= 7 * 24 ? { weekday: 'long' } : { day: 'numeric', month: 'long' });
  return t('on {day}', { day });
}

function Left({ icon, title, left, of, pct }: { icon: React.ReactNode; title: string; left: string; of: string; pct: number | null }) {
  const remaining = pct === null ? 100 : Math.max(0, 100 - pct);
  return (
    <div className={`use-left${remaining <= 15 ? ' is-low' : ''}`}>
      <div className="use-left__top"><span className="use-left__icon" aria-hidden>{icon}</span><small>{title}</small></div>
      <b>{left}</b>
      <span className="use-meter" aria-hidden><i style={{ width: `${remaining}%` }} /></span>
      <em>{of}</em>
    </div>
  );
}

/** Bars for the period: one per day (or per hour today). Hover a bar for its value. */
function Chart({ buckets, metric, hourly }: { buckets: Bucket[]; metric: Metric; hourly: boolean }) {
  const top = Math.max(...buckets.map((b) => value(b, metric)), 0);
  const label = (ts: number) => (hourly ? new Date(ts).toLocaleTimeString(loc, { hour: 'numeric' }) : new Date(ts).toLocaleDateString(lang === 'nl' ? 'nl-NL' : lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' }));
  const every = Math.ceil(buckets.length / 8);
  return (
    <div className="use-chart" role="img" aria-label={t('Usage over time')}>
      <div className="use-chart__bars">
        {buckets.map((b, i) => {
          const v = value(b, metric), h = top ? Math.max(v ? 4 : 0, (v / top) * 100) : 0;
          return (
            <div key={b.t} className="use-chart__col" title={`${label(b.t)} · ${show(v, metric)}`}>
              <span className={`use-chart__bar${v === top && v > 0 ? ' is-top' : ''}`} style={{ height: `${h}%` }} />
              <small className={i % every === 0 ? '' : 'is-hidden'}>{label(b.t)}</small>
            </div>
          );
        })}
      </div>
      {top === 0 && <p className="use-chart__empty">{t('Nothing in this period yet.')}</p>}
    </div>
  );
}

/** Usage: what's left of the plan, what the work costs at API prices, and where it went. Counts only, never content. */
export function UsageView() {
  const bots = useStore((s) => s.bots);
  const byId = useMemo(() => new Map(bots.map((b) => [b.id, b])), [bots]);
  const read = <T extends string>(k: string, d: T, ok: T[]): T => { try { const v = localStorage.getItem(k) as T; return ok.includes(v) ? v : d; } catch { return d; } };
  const [range, setRange] = useState<Range>(() => read('badr.usageRange', 'month', ['today', '7d', '30d', 'month']));
  const [metric, setMetric] = useState<Metric>(() => read('badr.usageMetric', 'cost', ['cost', 'tokens', 'turns']));
  const [by, setBy] = useState<'bot' | 'model'>(() => read('badr.usageBy', 'bot', ['bot', 'model']));
  const remember = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
  const [r, setR] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true; setFailed(false); setLoading(true);
    fetch(`/api/usage?range=${range}`, { credentials: 'include' }).then((x) => (x.ok ? x.json() : Promise.reject())).then((d) => live && setR(d)).catch(() => live && setFailed(true)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [range]);

  const m = r?.month;
  const compLeft = m && m.computer.limitMinutes !== null ? Math.max(0, m.computer.limitMinutes - m.computer.usedMinutes) : null;
  const compPct = m && m.computer.limitMinutes ? Math.round((m.computer.usedMinutes / m.computer.limitMinutes) * 100) : m?.computer.limitMinutes === 0 ? 100 : null;
  const rows = useMemo(() => {
    const list = by === 'bot' ? (r?.bots ?? []).map((b) => ({ key: b.botId, ...b })) : (r?.models ?? []).map((x) => ({ key: x.label, ...x }));
    return [...list].sort((a, b) => value(b, metric) - value(a, metric));
  }, [r, by, metric]);
  const topRow = Math.max(1e-9, ...rows.map((x) => value(x, metric)));
  const worth = m ? m.projected - m.plan.priceUsd : 0;

  return (
    <main className="chat page-view">
      <header className="page-view__head page-view__head--row">
        <div>
          <BlurWords as="h1" className="page-view__title" text={t('Usage')} />
          <p className="page-view__sub">{failed ? t('Usage is unavailable right now.') : t('What your team used, what it would cost at API prices, and what’s left this month.')}</p>
        </div>
      </header>
      <div className="page-view__scroll">
        <div className="page-view__inner">
          {r && m && (
            <>
              <h2 className="use-box__title use-month-title">{t('This month')}</h2>
              <section className="use-hero">
                <div className="use-hero__main">
                  <small>{t('This month at API prices')}</small>
                  <b>{usd(m.cost)}</b>
                  <span>{t('On track for about {amount} by the end of the month', { amount: usd(m.projected) })}</span>
                </div>
                <div className="use-hero__plan">
                  <small>{t('Your plan')}</small>
                  <b>{m.plan.name} · {usd(m.plan.priceUsd)}<em>/{t('month')}</em></b>
                  {/* One track: the plan's price is the full bar, the fill is where API prices would land this month. */}
                  <div className="use-compare" aria-hidden><i style={{ width: `${m.plan.priceUsd > 0 ? Math.min(100, Math.max(m.projected > 0 ? 2 : 0, (m.projected / m.plan.priceUsd) * 100)) : 0}%` }} /></div>
                  <span>{m.plan.priceUsd > 0 && worth > 0 ? t('Paying per token would cost about {amount} more.', { amount: usd(worth) }) : t('Well within what your plan includes.')}</span>
                </div>
              </section>

              <section className="use-lefts">
                <Left icon={<Timer size={15} />} title={t('Computer time left')} pct={compPct}
                  left={compLeft === null ? t('Unlimited') : dur(compLeft)}
                  of={m.computer.limitMinutes === null ? t('{used} used this month', { used: dur(m.computer.usedMinutes) }) : t('{used} of {all} used', { used: dur(m.computer.usedMinutes), all: dur(m.computer.limitMinutes) })} />
                {/* Badr's own AI, spread over the month like the big AI apps: today, this week, this month. */}
                {m.limits ? ([['session', t('Badr AI left this session')], ['week', t('Badr AI left this week')], ['month', t('Badr AI left this month')]] as const).map(([k, title]) => (
                  <Left key={k} icon={k === 'month' ? <Cpu size={15} /> : <Sparkles size={15} />} title={title} pct={m.limits![k].pct}
                    left={`${Math.max(0, 100 - m.limits![k].pct)}%`} of={t('Comes back {when}', { when: backIn(m.limits![k].resetsAt) })} />
                )) : <Left icon={<Sparkles size={15} />} title={t('Badr AI')} pct={null} left={t('Unlimited')} of={t('No daily or weekly limit on your account')} />}
              </section>

              <div className="use-period">
                <h2 className="use-box__title">{t('In this period')}</h2>
                <Seg value={range} label={t('Period')} onPick={(v) => { setRange(v); remember('badr.usageRange', v); }} options={[['today', t('Today')], ['7d', t('7 days')], ['30d', t('30 days')], ['month', t('This month')]]} />
              </div>
              <section className={`use-tiles${loading ? ' is-loading' : ''}`}>
                <div className="use-tile"><small>{t('Cost at API prices')}</small><b>{usd(r.totals.cost)}</b></div>
                <div className="use-tile"><small>{t('Messages handled')}</small><b>{num(r.totals.turns)}</b></div>
                <div className="use-tile"><small>{t('Tokens')}</small><b>{num(r.totals.tokens)}</b><em>{t('{i} in · {o} out', { i: num(r.totals.input), o: num(r.totals.output) })}</em></div>
                <div className="use-tile"><small>{t('Time working')}</small><b>{dur(r.totals.busyMinutes)}</b>{r.totals.computerSteps > 0 && <em>{t('{n} computer steps', { n: num(r.totals.computerSteps) })}</em>}</div>
              </section>

              <section className={`use-box${loading ? ' is-loading' : ''}`}>
                <div className="use-box__head">
                  <h2 className="use-box__title">{t('Over time')}</h2>
                  <Seg value={metric} label={t('Show')} onPick={(v) => { setMetric(v); remember('badr.usageMetric', v); }} options={[['cost', t('Cost')], ['tokens', t('Tokens')], ['turns', t('Messages')]]} />
                </div>
                <Chart buckets={r.buckets} metric={metric} hourly={r.hourly} />
              </section>

              <section className={`use-box${loading ? ' is-loading' : ''}`}>
                <div className="use-box__head">
                  <h2 className="use-box__title">{t('Breakdown')}</h2>
                  <Seg value={by} label={t('Group by')} onPick={(v) => { setBy(v); remember('badr.usageBy', v); }} options={[['bot', t('By Bot')], ['model', t('By model')]]} />
                </div>
                {rows.length === 0 ? <p className="use-box__empty">{t('No activity in this period. Give a Bot a job and it shows up here.')}</p> : (
                  <ul className="use-list">
                    {rows.map((x) => {
                      const bot = by === 'bot' ? byId.get(x.key) : undefined;
                      const name = by === 'bot' ? (bot ? displayName(bot) : t('Removed Bot')) : t(x.key);
                      const b = x as unknown as BotUse;
                      return (
                        <li key={x.key} className="use-row">
                          {by === 'bot' ? (bot ? <BotAvatarFor bot={bot} size={34} /> : <span className="use-row__dot" />) : <span className="use-row__dot use-row__dot--model"><Sparkles size={15} /></span>}
                          <span className="use-row__main">
                            <span className="use-row__top"><b dir="auto">{name}</b><strong>{show(value(x, metric), metric)}</strong></span>
                            <span className="use-meter use-meter--thin" aria-hidden><i style={{ width: `${Math.max(2, (value(x, metric) / topRow) * 100)}%` }} /></span>
                            <small>
                              {[metric !== 'cost' && usd(x.cost), metric !== 'turns' && t('{n} messages', { n: num(x.turns) }), metric !== 'tokens' && t('{n} tokens', { n: num(x.tokens) })].filter(Boolean).join(' · ')}
                              {by === 'bot' && b.busyMinutes > 0 ? ` · ${dur(b.busyMinutes)}` : ''}
                              {by === 'bot' && b.computerSteps ? ` · ${t('{n} computer steps', { n: num(b.computerSteps) })}` : ''}
                              {by === 'bot' && b.images ? ` · ${t('{n} images', { n: b.images })}` : ''}
                            </small>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="use-note">{t('API prices: Badr’s own models at what they cost; work on your own ChatGPT or Claude subscription priced at OpenAI’s or Anthropic’s public API rates, as an estimate (your subscription covers it).')}</p>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
