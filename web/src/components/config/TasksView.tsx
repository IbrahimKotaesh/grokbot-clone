import { t, t as tr } from '../../lib/i18n';
import { useEffect, useMemo, useState } from 'react';
import type { Bot, Task } from '@shared/types';
import { BotAvatarFor } from '../../avatar/BotAvatar';
import { configApi } from '../../lib/configApi';
import { api } from '../../lib/api';
import { relativeShort } from '../../lib/time';
import { chatViewFor, useConfigUI, useVersion } from '../../configStore';
import { useStore } from '../../store';
import { Glyph } from './glyphs';
import './ui';

const STATE_LABEL: Record<Task['state'], string> = { working: t("Working on it"), needs_input: t('Waiting on you'), done: t("Done") };
/** A task still "in progress" with no update for a day has stalled; say so instead of a cheerful "Working on it". */
const STALL_MS = 24 * 3600 * 1000;
const isStalled = (task: Task) => task.state === 'working' && Date.now() - task.updatedAt > STALL_MS;

function when(t: Task): string {
  const r = relativeShort(t.updatedAt);
  const ago = r === 'now' ? tr('just now') : r === tr('Yesterday') ? tr('yesterday') : tr('{time} ago', { time: r });
  if (isStalled(t)) return tr('No update for {time}', { time: r });
  return t.state === 'done' ? tr('Completed {time}', { time: ago }) : t.state === 'needs_input' ? tr('Asked {time}', { time: ago }) : tr('Updated {time}', { time: ago });
}

export function TaskRow({ t, bot, showBot }: { t: Task; bot?: Bot; showBot: boolean }) {
  const open = () => { if (bot) { useStore.getState().selectBot(bot.id); useConfigUI.getState().setView(chatViewFor(bot.id)); } };
  return (
    <button type="button" className={`task-row is-${t.state}${isStalled(t) ? ' is-stalled' : ''}`} onClick={open} disabled={!bot} title={bot ? `Open ${bot.name}` : undefined}>
      <span className={`task-row__check is-${t.state}`} aria-hidden>{t.state === 'done' ? <Glyph name="check_circle" size={18} /> : <span className="task-row__ring" />}</span>
      <span className="task-row__text">
        <span className="task-row__title">{t.title}</span>
        {t.note && <span className="task-row__note">{t.note}</span>}
        <span className="task-row__meta">
          {showBot && bot && <><BotAvatarFor bot={bot} size={14} /><span>{bot.name}</span><span aria-hidden>·</span></>}
          <span>{when(t)}</span>
        </span>
      </span>
      {isStalled(t)
        ? <span className="task-chip is-stalled">{tr('Stalled')}</span>
        : <span className={`task-chip is-${t.state}`}>{STATE_LABEL[t.state]}</span>}
    </button>
  );
}

export function useTasks(botId?: string): Task[] | null {
  const v = useVersion(botId ? `tasks:${botId}` : 'tasks');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  useEffect(() => {
    let alive = true;
    (botId ? configApi.botTasks(botId) : configApi.tasks()).then((r) => { if (alive) setTasks(r.tasks); }).catch(() => { if (alive) setTasks([]); });
    return () => { alive = false; };
  }, [botId, v]);
  return tasks;
}

export function sortTasks(list: Task[]) {
  const rank = { needs_input: 0, working: 1, done: 2 } as const;
  return [...list].sort((a, b) => rank[a.state] - rank[b.state] || b.updatedAt - a.updatedAt);
}

/** "Your team saved you about N hours this week", with what it's based on. */
export function WeekSaved() {
  const v = useVersion('tasks');
  const [stats, setStats] = useState<{ steps: number; replies: number; tasksDone: number; minutes: number } | null>(null);
  const [how, setHow] = useState(false);
  useEffect(() => { let alive = true; api.weekStats().then((r) => { if (alive) setStats(r); }).catch(() => {}); return () => { alive = false; }; }, [v]);
  if (!stats || stats.minutes < 5) return null;
  const hours = stats.minutes / 60;
  const amount = hours >= 1 ? tr('{n} hours', { n: hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10 }) : tr('{n} minutes', { n: Math.round(stats.minutes / 5) * 5 });
  return (
    <section className="week-saved" aria-label={tr('This week')}>
      <div className="week-saved__label">{tr('This week')}</div>
      <div className="week-saved__big">{tr('Your team saved you about {amount}', { amount })}</div>
      <div className="week-saved__facts">
        <span><b>{stats.steps}</b> {tr(stats.steps === 1 ? 'step of work' : 'steps of work')}</span>
        <span><b>{stats.replies}</b> {tr(stats.replies === 1 ? 'reply' : 'replies')}</span>
        <span><b>{stats.tasksDone}</b> {tr(stats.tasksDone === 1 ? 'task done' : 'tasks done')}</span>
        <button type="button" className="link-btn" onClick={() => setHow(!how)} aria-expanded={how}>{tr('How is this counted?')}</button>
      </div>
      {how && <p className="week-saved__how">{tr('An estimate from the last 7 days: each step a bot took for you (a search, a page read, an email, a click on its computer) counts as about 2 minutes of your time, and each reply as about 1 minute.')}</p>}
    </section>
  );
}

/** Tasks for one bot (details panel → Tasks tab). */
export function BotTasks({ bot }: { bot: Bot }) {
  const tasks = useTasks(bot.id);
  const sorted = useMemo(() => sortTasks(tasks ?? []), [tasks]);
  return (
    <div className="details__sections">
      <section>
        <div className="section-label section-label--row">
          <span>{t("Tasks")}</span>
          <button type="button" className="link-btn link-btn--small" onClick={() => useConfigUI.getState().setView('workflow')}>{t("See all")}</button>
        </div>
        {tasks === null ? <div className="panel-card"><div className="panel-empty">{t("Loading…")}</div></div> : sorted.length === 0 ? (
          <div className="panel-card"><div className="panel-empty">No tasks yet. Ask {bot.name} for a few things at once and they’ll be tracked here.</div></div>
        ) : (
          <div className="panel-card task-list task-list--compact">{sorted.map((t) => <TaskRow key={t.id} t={t} bot={bot} showBot={false} />)}</div>
        )}
      </section>
    </div>
  );
}
