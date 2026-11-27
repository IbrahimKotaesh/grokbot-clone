import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Clock, List, Network, Play, Zap } from 'lucide-react';
import type { Bot, Routine } from '@shared/types';
import { lang, t } from '../lib/i18n';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { useStore, displayName } from '../store';
import { useConfigUI, useVersion } from '../configStore';
import { configApi } from '../lib/configApi';
import { clock, relativeShort } from '../lib/time';
import { Switch } from './config/ui';
import { scheduleText } from '../lib/schedule';
import { BlurWords } from '../lib/motion';
import { WorkflowDiagram } from './WorkflowDiagram';
import { Collapse } from './Collapse';

const LS_CLOSED = 'badr.workflowClosed';
const loc = lang === 'nl' ? 'nl-NL' : lang === 'ar' ? 'ar' : 'en-GB';
const readClosed = (): string[] => { try { return JSON.parse(localStorage.getItem(LS_CLOSED) ?? '[]'); } catch { return []; } };

/** When it next runs, in a few words: "Today 08:00", "Tomorrow 08:00", or a date. */
function nextLabel(ts: number | null) {
  if (!ts) return null;
  const d = new Date(ts), now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  const when = diff === 0 ? t('Today') : diff === 1 ? t('Tomorrow') : d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${when} ${clock(ts)}`;
}

function AutomationRow({ r, onChange }: { r: Routine; onChange: (r: Routine) => void }) {
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);
  const isEvent = r.schedule.startsWith('event:');
  const toggle = async (on: boolean) => {
    setBusy(true);
    onChange({ ...r, enabled: on });
    try { const { routine } = await configApi.setRoutine(r.id, on); onChange(routine); } catch { onChange(r); } finally { setBusy(false); }
  };
  const run = async () => { setBusy(true); try { await configApi.runRoutine(r.id); setRan(true); setTimeout(() => setRan(false), 2500); } finally { setBusy(false); } };
  const next = r.enabled && !isEvent ? nextLabel(r.nextRunAt) : null;
  return (
    <li className={`auto-row${r.enabled ? '' : ' is-off'}`}>
      <span className={`auto-row__icon${isEvent ? ' is-event' : ''}`} aria-hidden>{isEvent ? <Zap size={15} strokeWidth={2.2} /> : <Clock size={15} strokeWidth={2.2} />}</span>
      <span className="auto-row__text">
        <b dir="auto">{r.name}</b>
        <small dir="auto">{scheduleText(r)}{next ? ` · ${t('Next')}: ${next}` : ''}{r.lastRunAt ? ` · ${t('Last ran {time}', { time: relativeShort(r.lastRunAt) })}` : ''}</small>
      </span>
      <button type="button" className="auto-row__run" onClick={() => void run()} disabled={busy} title={t('Run now')} aria-label={t('Run {name} now', { name: r.name })}>
        {ran ? t('Started') : <><Play size={13} strokeWidth={2.4} /> {t('Run now')}</>}
      </button>
      <Switch on={r.enabled} disabled={busy} onChange={(on) => void toggle(on)} label={r.enabled ? t('Turn off') : t('Turn on')} />
    </li>
  );
}

/** One Bot's automations, in a box that opens and closes. */
function BotBox({ bot, items, open, onToggle, onChange }: { bot: Bot; items: Routine[]; open: boolean; onToggle: () => void; onChange: (r: Routine) => void }) {
  const on = items.filter((r) => r.enabled).length;
  return (
    <section className={`auto-box${open ? ' is-open' : ''}`}>
      <button type="button" className="auto-box__head" aria-expanded={open} onClick={onToggle}>
        <ChevronRight size={16} strokeWidth={2.2} className="auto-box__chev" />
        <BotAvatarFor bot={bot} size={30} />
        <span className="auto-box__name" dir="auto">{displayName(bot)}</span>
        <span className="auto-box__count">{t('{on} of {all} on', { on, all: items.length })}</span>
      </button>
      <Collapse open={open}>
        <div className="auto-box__body">
          <ul className="auto-list">{items.map((r) => <AutomationRow key={r.id} r={r} onChange={onChange} />)}</ul>
          <button type="button" className="auto-box__settings" onClick={() => useConfigUI.getState().openBotSettings(bot.id, 'routines')}>{t('Edit in {name}’s settings', { name: bot.name })}</button>
        </div>
      </Collapse>
    </section>
  );
}

/** Workflow: everything your Bots do on their own (schedules and app triggers), grouped by Bot. */
export function WorkflowView() {
  const bots = useStore((s) => s.bots);
  const v = useVersion('routines');
  const [list, setList] = useState<Routine[] | null>(null);
  const [closed, setClosed] = useState<string[]>(readClosed);
  // Two ways to look at it: a diagram of the flow, or the list of boxes. The choice is remembered.
  const [mode, setMode] = useState<'diagram' | 'list'>(() => { try { return localStorage.getItem('badr.workflowMode') === 'list' ? 'list' : 'diagram'; } catch { return 'diagram'; } });
  const pick = (m: 'diagram' | 'list') => { setMode(m); try { localStorage.setItem('badr.workflowMode', m); } catch { /* private window */ } };
  useEffect(() => {
    let live = true;
    fetch('/api/automations', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { automations: [] })).then((d) => live && setList(d.automations ?? [])).catch(() => live && setList([]));
    return () => { live = false; };
  }, [v]);
  const byBot = useMemo(() => {
    const m = new Map<string, Routine[]>();
    for (const r of list ?? []) m.set(r.botId, [...(m.get(r.botId) ?? []), r]);
    return bots.filter((b) => m.has(b.id)).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((b) => ({ bot: b, items: m.get(b.id)! }));
  }, [list, bots]);
  const toggleBox = (id: string) => setClosed((cur) => { const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; try { localStorage.setItem(LS_CLOSED, JSON.stringify(next)); } catch { /* private window */ } return next; });
  const change = (r: Routine) => setList((cur) => (cur ?? []).map((x) => (x.id === r.id ? r : x)));
  const total = list?.length ?? 0, on = list?.filter((r) => r.enabled).length ?? 0;

  return (
    <main className="chat page-view">
      <header className="page-view__head page-view__head--row">
        <div>
        <BlurWords as="h1" className="page-view__title" text={t('Workflow')} />
        <p className="page-view__sub">{list === null ? t('Loading…') : total ? t('{on} of {all} automations are on. Your Bots run them by themselves.', { on, all: total }) : t('Everything your Bots do on their own: on a schedule, or when something happens in your apps.')}</p>
        </div>
        {total > 0 && (
          <div className="seg" role="tablist" aria-label={t('View')}>
            <button type="button" role="tab" aria-selected={mode === 'diagram'} className={mode === 'diagram' ? 'is-on' : ''} onClick={() => pick('diagram')}><Network size={14} strokeWidth={2.2} />{t('Diagram')}</button>
            <button type="button" role="tab" aria-selected={mode === 'list'} className={mode === 'list' ? 'is-on' : ''} onClick={() => pick('list')}><List size={14} strokeWidth={2.2} />{t('List')}</button>
          </div>
        )}
      </header>
      <div className="page-view__scroll">
        <div className="page-view__inner">
          {list !== null && total === 0 && (
            <div className="cal-empty">
              <b>{t('No automations yet')}</b>
              <span>{t('Ask any Bot, like “every weekday at 8, send me the news” or “when an email from my bank arrives, summarize it”. It shows up here.')}</span>
            </div>
          )}
          {mode === 'diagram' && total > 0
            ? <WorkflowDiagram lanes={byBot} />
            : byBot.map(({ bot, items }) => <BotBox key={bot.id} bot={bot} items={items} open={!closed.includes(bot.id)} onToggle={() => toggleBox(bot.id)} onChange={change} />)}
        </div>
      </div>
    </main>
  );
}
