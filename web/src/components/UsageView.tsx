import { useEffect, useMemo, useState } from 'react';
import { lang, t } from '../lib/i18n';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { useStore, displayName } from '../store';
import { relativeShort } from '../lib/time';
import { BlurWords } from '../lib/motion';

interface BotUsage { botId: string; turns: number; tokens: number; costUsd: number; computerSteps: number; busyMinutes: number; images: number; lastAt: number | null }
interface Usage { since: number; plan: { id: string; name: string; computerHours: number | null }; computerMinutes: number; bots: BotUsage[] }

const num = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
const hours = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);

/** Usage: what your team used this month, in total and per Bot. Counts only; never what was said. */
export function UsageView() {
  const bots = useStore((s) => s.bots);
  const byId = useMemo(() => new Map(bots.map((b) => [b.id, b])), [bots]);
  const [u, setU] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch('/api/usage', { credentials: 'include' }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setU).catch(() => setFailed(true));
  }, []);
  const total = useMemo(() => (u?.bots ?? []).reduce((a, b) => ({ turns: a.turns + b.turns, tokens: a.tokens + b.tokens, busy: a.busy + b.busyMinutes, images: a.images + b.images }), { turns: 0, tokens: 0, busy: 0, images: 0 }), [u]);
  const top = Math.max(1, ...(u?.bots ?? []).map((b) => b.tokens));
  const month = u ? new Date(u.since).toLocaleDateString(lang === 'nl' ? 'nl-NL' : lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', year: 'numeric' }) : '';
  const limitMin = u?.plan.computerHours != null ? u.plan.computerHours * 60 : null;
  const pct = limitMin ? Math.min(100, Math.round((u!.computerMinutes / limitMin) * 100)) : 0;

  return (
    <main className="chat page-view">
      <header className="page-view__head">
        <BlurWords as="h1" className="page-view__title" text={t('Usage')} />
        <p className="page-view__sub">{u ? t('What your team used in {month}.', { month }) : failed ? t('Usage is unavailable right now.') : t('Loading…')}</p>
      </header>
      <div className="page-view__scroll">
        <div className="page-view__inner">
          {u && (
            <>
              <section className="use-tiles">
                <div className="use-tile"><small>{t('Messages handled')}</small><b>{num(total.turns)}</b></div>
                <div className="use-tile"><small>{t('Words processed')}</small><b>{num(Math.round(total.tokens * 0.75))}</b><em>{t('{n} tokens', { n: num(total.tokens) })}</em></div>
                <div className="use-tile"><small>{t('Time working')}</small><b>{hours(total.busy)}</b></div>
                <div className="use-tile">
                  <small>{t('Computer time')}</small>
                  <b>{hours(u.computerMinutes)}</b>
                  {limitMin !== null && limitMin > 0 && <><span className="use-meter" aria-hidden><i style={{ width: `${pct}%` }} /></span><em>{t('{used} of {all} h on {plan}', { used: Math.round(u.computerMinutes / 6) / 10, all: u.plan.computerHours ?? 0, plan: u.plan.name })}</em></>}
                </div>
              </section>

              <section className="use-box">
                <h2 className="use-box__title">{t('By Bot')}</h2>
                {u.bots.length === 0 ? <p className="use-box__empty">{t('No activity yet this month. Give a Bot a job and it shows up here.')}</p> : (
                  <ul className="use-list">
                    {u.bots.map((b) => {
                      const bot = byId.get(b.botId);
                      return (
                        <li key={b.botId} className="use-row">
                          {bot ? <BotAvatarFor bot={bot} size={34} /> : <span className="use-row__dot" />}
                          <span className="use-row__main">
                            <span className="use-row__top"><b dir="auto">{bot ? displayName(bot) : t('Removed Bot')}</b>{b.lastAt && <time>{relativeShort(b.lastAt)}</time>}</span>
                            <span className="use-meter use-meter--thin" aria-hidden><i style={{ width: `${Math.max(3, Math.round((b.tokens / top) * 100))}%` }} /></span>
                            <small>{t('{n} messages', { n: num(b.turns) })} · {t('{n} tokens', { n: num(b.tokens) })} · {hours(b.busyMinutes)}{b.computerSteps ? ` · ${t('{n} computer steps', { n: num(b.computerSteps) })}` : ''}{b.images ? ` · ${t('{n} images', { n: b.images })}` : ''}</small>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
