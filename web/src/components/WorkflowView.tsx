import { useMemo } from 'react';
import type { Bot, Task } from '@shared/types';
import { t } from '../lib/i18n';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { displayName, useStore } from '../store';
import { useConfigUI } from '../configStore';
import { relativeShort } from '../lib/time';
import { TaskRow, WeekSaved, sortTasks, useTasks } from './config/TasksView';
import { BlurWords } from '../lib/motion';

/** What a Bot is doing right now, in a few words. */
function statusOf(bot: Bot, live: { isRunning?: boolean; awaiting?: { reason?: string } | null } | undefined) {
  if (live?.awaiting) return { tone: 'attention', text: t('Waiting for you') };
  if (live?.isRunning) return { tone: 'working', text: t('Working now') };
  return { tone: 'idle', text: bot.lastActivityAt ? t('Last active {time}', { time: relativeShort(bot.lastActivityAt) }) : t('Ready for a job') };
}

function Node({ bot, chief = false }: { bot: Bot; chief?: boolean }) {
  const live = useStore((s) => s.live[bot.id]);
  const st = statusOf(bot, live);
  const open = () => { useStore.getState().selectBot(bot.id); useConfigUI.getState().setView('chat'); };
  return (
    <button type="button" className={`flow-node${chief ? ' is-chief' : ''} is-${st.tone}`} onClick={open} title={t('Open {name}', { name: bot.name })}>
      <span className="flow-node__avatar"><BotAvatarFor bot={bot} size={chief ? 52 : 40} />{st.tone !== 'idle' && <i className={`status-dot is-${st.tone === 'working' ? 'working' : 'attention'}`} />}</span>
      <span className="flow-node__text">
        <b dir="auto">{displayName(bot)}</b>
        <small>{bot.label ? t(bot.label) : chief ? t('Chief of Staff') : t('Teammate')}</small>
        <em className={`flow-node__status is-${st.tone}`}>{st.text}</em>
      </span>
    </button>
  );
}

const COLUMNS: { state: Task['state']; title: string; empty: string }[] = [
  { state: 'needs_input', title: 'Waiting on you', empty: 'Nothing needs you right now.' },
  { state: 'working', title: 'In progress', empty: 'No one is mid-task.' },
  { state: 'done', title: 'Done', empty: 'Finished work shows up here.' },
];

/** The team at a glance: who hands work to whom, what each Bot is doing, and every task by stage. */
export function WorkflowView() {
  const bots = useStore((s) => s.bots);
  const tasks = useTasks();
  const chief = bots.find((b) => b.isPrimary);
  const team = bots.filter((b) => !b.isPrimary && b.kind !== 'room');
  const byId = useMemo(() => new Map(bots.map((b) => [b.id, b])), [bots]);
  const columns = useMemo(() => COLUMNS.map((c) => ({ ...c, tasks: sortTasks((tasks ?? []).filter((x) => x.state === c.state)).slice(0, c.state === 'done' ? 12 : 50) })), [tasks]);

  return (
    <main className="chat page-view">
      <header className="page-view__head">
        <BlurWords as="h1" className="page-view__title" text={t('Workflow')} />
        <p className="page-view__sub">{t('How your team works together, and where every task stands.')}</p>
      </header>
      <div className="page-view__scroll">
        <div className="page-view__inner">
          <section className="flow" aria-label={t('Your team')}>
            {chief && <Node bot={chief} chief />}
            {team.length > 0 ? (
              <>
                <span className="flow__trunk" aria-hidden />
                <div className="flow__team">{team.map((b) => <div key={b.id} className="flow__branch"><Node bot={b} /></div>)}</div>
              </>
            ) : (
              <button type="button" className="flow__add" onClick={() => useStore.getState().setModal('create')}>{t('Add a teammate so {name} can hand work over', { name: chief?.name ?? 'Badr' })}</button>
            )}
          </section>

          <WeekSaved />

          <section className="board" aria-label={t('Tasks')}>
            {columns.map((c) => (
              <div key={c.state} className={`board__col is-${c.state}`}>
                <div className="board__head"><span>{t(c.title)}</span>{c.tasks.length > 0 && <b>{c.tasks.length}</b>}</div>
                {tasks === null ? <div className="board__empty">{t('Loading…')}</div>
                  : c.tasks.length === 0 ? <div className="board__empty">{t(c.empty)}</div>
                  : <div className="task-list">{c.tasks.map((x) => <TaskRow key={x.id} t={x} bot={byId.get(x.botId)} showBot />)}</div>}
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
