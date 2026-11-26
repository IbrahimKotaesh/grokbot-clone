import { t } from '../lib/i18n';
import {BotConversations} from './BotConversations';
import {BotRoster} from './BotRoster';
import {NotificationBell} from './config/NotificationsSection';
import { memo, useCallback, useRef, useState } from 'react';
import { useConfigUI } from '../configStore';
import { useTasks } from './config/TasksView';
import { CalendarDays, LayoutGrid, PanelLeft, Search, Settings, Users, Workflow } from 'lucide-react';
import { relativeShort } from '../lib/time';
import type { Bot } from '@shared/types';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { displayName, useStore } from '../store';
import { api } from '../lib/api';
import { Icon } from './Icon';
import { Menu } from './Menu';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function TrafficLights() {
  return (
    <div className="traffic-lights" aria-hidden>
      <span style={{ background: '#FF5F57' }} />
      <span style={{ background: '#FEBC2E' }} />
      <span style={{ background: '#28C840' }} />
    </div>
  );
}

function previewFor(bot: Bot, running: boolean, awaiting: string | null) {
  if (awaiting) return `Waiting for you: ${awaiting}`;
  if (running && !bot.lastPreview) return 'Working…';
  return bot.lastPreview ?? t("No messages yet");
}

const BotRow = memo(function BotRow({ bot, selected, running, awaiting, onSelect }: { bot: Bot; selected: boolean; running: boolean; awaiting: string | null; onSelect: (id: string) => void }) {
  return (
    <button type="button" className={`bot-row${selected ? ' is-selected' : ''}${bot.unread > 0 && !selected && !running ? ' is-unread' : ''}`} onClick={() => onSelect(bot.id)} aria-current={selected || undefined}>
      <span className="bot-row__avatar">
        <BotAvatarFor bot={bot} size={44} />
        {(running || awaiting || bot.unread > 0) && (
          <span className={`status-dot ${awaiting ? 'is-attention' : running ? 'is-working' : 'is-unread'}`} aria-label={awaiting ? t("Needs attention") : running ? t("Working") : t("Unread activity")} />
        )}
      </span>
      <span className="bot-row__text">
        <span className="bot-row__top"><span className="bot-row__name" dir="auto">{displayName(bot)}</span>{bot.lastActivityAt > 0 && <time className="bot-row__time">{relativeShort(bot.lastActivityAt)}</time>}</span>
        <span className="bot-row__preview" dir="auto">{previewFor(bot, running, awaiting)}</span>
      </span>
    </button>
  );
});

/** The slim rail on the far left: the team, its Workflow and the week's Calendar; apps, alerts, settings and you below. */
function NavRail({ collapsed }: { collapsed: boolean }) {
  const view = useConfigUI((s) => s.view);
  const set = useStore((s) => s.set);
  const setModal = useStore((s) => s.setModal);
  const user = useStore((s) => s.user);
  const tasks = useTasks();
  const waiting = tasks?.filter((x) => x.state === 'needs_input').length ?? 0;
  const [accountMenu, setAccountMenu] = useState(false);
  const logout = async () => { await api.logout().catch(() => {}); location.reload(); };
  const go = (v: 'chat' | 'workflow' | 'calendar') => {
    useConfigUI.getState().setView(v);
    // On phones the page opens straight away; the bot list stays one tap away.
    if (v !== 'chat' && matchMedia('(max-width: 900px)').matches) set({ mobileNavOpen: false });
    if (v === 'chat' && collapsed) set({ sidebarCollapsed: false });
  };
  const item = (v: 'chat' | 'workflow' | 'calendar', label: string, icon: React.ReactNode, badge = 0) => (
    <button type="button" className={`rail__item${view === v ? ' is-active' : ''}`} aria-current={view === v ? 'page' : undefined} aria-label={badge ? `${label}, ${badge}` : label} title={label} onClick={() => go(v)}>
      {icon}{badge > 0 && <span className="rail__badge">{badge > 9 ? '9+' : badge}</span>}
    </button>
  );
  return (
    <nav className="rail" aria-label={t('Main')}>
      <button type="button" className="rail__item mobile-drawer-close" aria-label={t('Close conversations')} onClick={() => set({ mobileNavOpen: false })}><Icon name="close" size={20} /></button>
      <button type="button" className="rail__item rail__toggle" onClick={() => set({ sidebarCollapsed: !collapsed })} aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')} title="Toggle sidebar (⌘B)"><PanelLeft size={19} strokeWidth={1.8} /></button>
      <div className="rail__group">
        {item('chat', t('Bots'), <Users size={20} strokeWidth={1.8} />)}
        {item('workflow', t('Workflow'), <Workflow size={20} strokeWidth={1.8} />, waiting)}
        {item('calendar', t('Calendar'), <CalendarDays size={20} strokeWidth={1.8} />)}
      </div>
      <div className="rail__spacer" />
      <div className="rail__group">
        <button type="button" className="rail__item" onClick={() => setModal('apps')} aria-label={t('Connect apps')} title={t('Connect apps')}><LayoutGrid size={19} strokeWidth={1.8} /></button>
        <NotificationBell />
        <button type="button" className="rail__item" onClick={() => useConfigUI.getState().openAppSettings()} aria-label={t('Settings')} title={`${t('Settings')} (⌘,)`}><Settings size={19} strokeWidth={1.8} /></button>
        <span className="rail__account">
          <button type="button" className="rail__me" onClick={() => setAccountMenu(!accountMenu)} aria-haspopup="menu" aria-expanded={accountMenu} aria-label={user?.name ?? user?.email ?? t('Account')} title={user?.email}>{initials(user?.name ?? user?.email ?? '')}</button>
          {accountMenu && (
            <Menu placement="above" onClose={() => setAccountMenu(false)} items={[
              { label: t('Settings'), hint: '⌘,', onSelect: () => useConfigUI.getState().openAppSettings() },
              { label: t('Connect apps'), onSelect: () => setModal('apps') },
              { label: t('Log out'), danger: true, onSelect: logout },
            ]}>
              <div className="menu__header">{user?.name ? <><b>{user.name}</b><br /></> : null}{user?.email}</div>
            </Menu>
          )}
        </span>
      </div>
    </nav>
  );
}

export function Sidebar() {
  const bots = useStore((s) => s.bots);
  const live = useStore((s) => s.live);
  const storeSelectedBotId = useStore((s) => s.selectedBotId);
  const inPage = useConfigUI((s) => s.view !== 'chat');
  const selectedBotId = inPage ? null : storeSelectedBotId; // nothing highlighted while Workflow or Calendar is open
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const storeSelectBot = useStore((s) => s.selectBot);
  // Picking a bot (even the one already selected) leaves the Tasks view.
  const selectBot = useCallback((id: string) => { useConfigUI.getState().setView('chat'); storeSelectBot(id); }, [storeSelectBot]);
  const setModal = useStore((s) => s.setModal);

  const primary = bots.find((b) => b.isPrimary);
  // A bot with a reply you haven't read rises to the top, newest first, like a messaging app.
  // The one you open stays up there while you read it; after that it goes back to its usual place.
  const keepUp = useRef(new Set<string>());
  for (const b of bots) if (b.unread > 0 && !b.isPrimary) keepUp.current.add(b.id);
  for (const id of [...keepUp.current]) {
    const b = bots.find((x) => x.id === id);
    if (!b || (b.unread === 0 && id !== storeSelectedBotId)) keepUp.current.delete(id);
  }
  const byOrder = (a: Bot, b: Bot) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || b.lastActivityAt - a.lastActivityAt;
  const rest = bots.filter((b) => !b.isPrimary);
  const fresh = rest.filter((b) => keepUp.current.has(b.id)).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  const others = [...fresh, ...rest.filter((b) => !keepUp.current.has(b.id)).sort(byOrder)];

  return (
    <aside id="workspace-sidebar" aria-label={t("Conversations")} className={`sidebar sidebar--rail${collapsed ? ' is-collapsed' : ''}`}>
      <NavRail collapsed={collapsed} />
      {!collapsed && (
        <div className="side-panel">
          <div className="side-panel__head">
            <button type="button" className="side-search" onClick={() => setModal('search')} title="Search (⌘K)"><Search size={15} strokeWidth={2} /><span>{t('Search')}</span><kbd>⌘K</kbd></button>
            <button type="button" className="icon-btn side-panel__new" onClick={() => setModal('create')} aria-label={t("New Bot")} title={t("New Bot")}><Icon name="plus" opacity={0.7} /></button>
          </div>
          <div className="sidebar__scroll">
            {primary && (
              <div className="pinned"><BotConversations bot={primary} collapsed={false}>
                <button type="button" className={`pinned__tile${selectedBotId === primary.id ? ' is-selected' : ''}${primary.unread > 0 && selectedBotId !== primary.id && !live[primary.id]?.isRunning ? ' is-unread' : ''}`} onClick={() => selectBot(primary.id)} title={displayName(primary)}>
                  <span className="pinned__avatar">
                    <BotAvatarFor bot={primary} size={64} />
                    {live[primary.id]?.isRunning ? <span className="status-dot is-working pinned__dot" /> : primary.unread > 0 && selectedBotId !== primary.id && <span className="status-dot is-unread pinned__dot" aria-label={t("Unread activity")} />}
                  </span>
                  <span className="pinned__label" dir="auto">{displayName(primary)}</span>
                </button>
              </BotConversations></div>
            )}
            {others.length > 0 && <div className="sidebar__team-label">{t("Your team")}</div>}
            <div className="bot-list">
              <BotRoster bots={others} collapsed={false} render={(b) =>
                <BotConversations key={b.id} bot={b} collapsed={false}><BotRow bot={b} selected={selectedBotId === b.id} running={!!live[b.id]?.isRunning} awaiting={live[b.id]?.awaiting?.reason ?? null} onSelect={selectBot} /></BotConversations>
              }/>
              {others.length === 0 && (
                <button type="button" className="bot-list__empty" onClick={() => setModal('create')}>
                  <span className="bot-list__empty-plus"><Icon name="plus" size={14} opacity={0.66} /></span>
                  <span>
                    <span className="bot-row__name">{t("Create a Bot")}</span>
                    <span className="bot-row__preview">{t("Give it a job, like research or inbox triage")}</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
