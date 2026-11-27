import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { lang, t } from '../lib/i18n';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { useStore } from '../store';
import { useConfigUI, useVersion } from '../configStore';
import { clock } from '../lib/time';
import { botVars } from '../lib/colors';
import { BlurWords } from '../lib/motion';

interface CalEvent { routineId: string; botId: string; name: string; description: string; at: number }
const DAY = 86_400_000;
const loc = lang === 'nl' ? 'nl-NL' : lang === 'ar' ? 'ar' : 'en-GB';

/** Monday 00:00 of the week `offset` weeks from this one. */
function weekStart(offset: number) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** A routine that runs many times a day (hourly checks) shows once, with its first and last run and a count. */
function foldRepeats(list: CalEvent[]): (CalEvent & { times: number; last?: number })[] {
  const byRoutine = new Map<string, CalEvent[]>();
  for (const e of list) byRoutine.set(e.routineId, [...(byRoutine.get(e.routineId) ?? []), e]);
  const out: (CalEvent & { times: number; last?: number })[] = [];
  for (const runs of byRoutine.values()) {
    if (runs.length > 3) out.push({ ...runs[0], times: runs.length, last: runs[runs.length - 1].at });
    else for (const e of runs) out.push({ ...e, times: 1 });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The week ahead: every routine run by every Bot, day by day. */
export function CalendarView() {
  const bots = useStore((s) => s.bots);
  const byId = useMemo(() => new Map(bots.map((b) => [b.id, b])), [bots]);
  const [offset, setOffset] = useState(0);
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  // Compact by default: each day shows its first few runs and folds the rest; "Expand all" shows everything.
  const [expanded, setExpanded] = useState(() => { try { return localStorage.getItem('badr.calExpanded') === '1'; } catch { return false; } });
  const [openDays, setOpenDays] = useState<string[]>([]);
  const toggleAll = () => { const next = !expanded; setExpanded(next); setOpenDays([]); try { localStorage.setItem('badr.calExpanded', next ? '1' : '0'); } catch { /* private window */ } };
  const toggleDay = (key: string) => setOpenDays((cur) => (cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]));
  const SHOWN = 3;
  const v = useVersion('routines');
  const start = weekStart(offset);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY));
  const end = new Date(start.getTime() + 7 * DAY);

  useEffect(() => {
    let on = true; setEvents(null);
    fetch(`/api/calendar?from=${start.getTime()}&to=${end.getTime()}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { events: [] })).then((d) => on && setEvents(d.events ?? [])).catch(() => on && setEvents([]));
    return () => { on = false; };
  }, [offset, v]);
  // On a phone the week is a list: open it at today instead of Monday.
  useEffect(() => {
    if (events && offset === 0 && matchMedia('(max-width: 900px)').matches) document.querySelector('.cal-day.is-today')?.scrollIntoView({ block: 'start' });
  }, [events === null, offset]);

  const today = new Date();
  const range = `${start.toLocaleDateString(loc, { day: 'numeric', month: 'short' })} – ${new Date(end.getTime() - DAY).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const open = (e: CalEvent) => useConfigUI.getState().openBotSettings(e.botId, 'routines');

  return (
    <main className="chat page-view">
      <header className="page-view__head page-view__head--row">
        <div>
          <BlurWords as="h1" className="page-view__title" text={t('Calendar')} />
          <p className="page-view__sub">{t('Your team’s routines for the week.')}</p>
        </div>
        <div className="cal-nav">
          <button type="button" className="icon-btn" aria-label={t('Previous week')} onClick={() => setOffset(offset - 1)}><ChevronLeft size={18} /></button>
          <button type="button" className="cal-nav__today" disabled={offset === 0} onClick={() => setOffset(0)}>{t('This week')}</button>
          <button type="button" className="icon-btn" aria-label={t('Next week')} onClick={() => setOffset(offset + 1)}><ChevronRight size={18} /></button>
          <span className="cal-nav__range">{range}</span>
          <button type="button" className="cal-nav__today cal-nav__size" onClick={toggleAll} aria-pressed={expanded}>{expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{expanded ? t('Compact') : t('Expand all')}</button>
        </div>
      </header>
      <div className="page-view__scroll">
        <div className="page-view__inner page-view__inner--wide">
          {events !== null && events.length === 0 && (
            <div className="cal-empty">
              <b>{t('No routines this week')}</b>
              <span>{t('Ask any Bot for something on a schedule, like “every weekday at 8, send me the news”, and it shows up here.')}</span>
            </div>
          )}
          <div className="cal-week" aria-busy={events === null}>
            {days.map((d) => {
              const list = foldRepeats((events ?? []).filter((e) => sameDay(new Date(e.at), d)));
              const isToday = sameDay(d, today);
              const key = d.toDateString(), dayOpen = expanded || openDays.includes(key);
              const shown = dayOpen ? list : list.slice(0, SHOWN), hidden = list.length - shown.length;
              return (
                <section key={d.toDateString()} className={`cal-day${isToday ? ' is-today' : ''}${d < today && !isToday ? ' is-past' : ''}`} aria-label={d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}>
                  <header className="cal-day__head"><span>{d.toLocaleDateString(loc, { weekday: 'short' })}</span><b>{d.getDate()}</b></header>
                  <div className="cal-day__list">
                    {shown.map((e) => {
                      const bot = byId.get(e.botId);
                      return (
                        <button key={`${e.routineId}-${e.at}`} type="button" className={`cal-event${(e.last ?? e.at) < Date.now() ? ' is-done' : ''}`} style={botVars(bot?.avatarColor)} onClick={() => open(e)} title={e.description || e.name}>
                          <time>{e.times > 1 ? `${clock(e.at)}–${clock(e.last!)} · ${e.times}×` : clock(e.at)}</time>
                          <span className="cal-event__name" dir="auto">{e.name}</span>
                          {bot && <span className="cal-event__bot"><BotAvatarFor bot={bot} size={16} /><span dir="auto">{bot.name}</span></span>}
                        </button>
                      );
                    })}
                    {hidden > 0 && <button type="button" className="cal-day__more" onClick={() => toggleDay(key)}>{t('+{n} more', { n: hidden })}</button>}
                    {!expanded && openDays.includes(key) && list.length > SHOWN && <button type="button" className="cal-day__more" onClick={() => toggleDay(key)}>{t('Show less')}</button>}
                    {events !== null && list.length === 0 && <span className="cal-day__free">{t('Free')}</span>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
