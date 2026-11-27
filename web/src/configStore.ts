import { create } from 'zustand';
import type { ServerEvent } from '@shared/types';
import { useStore } from './store';

/** UI state for bot settings, app settings, the Tasks view and the theme. Kept apart from store.ts on purpose. */

export type Theme = 'system' | 'light' | 'dark';
/** The main column: a chat, the team's Workflow board, or the week's Calendar of routines. */
export type View = 'home' | 'chat' | 'groups' | 'workflow' | 'calendar' | 'usage';
export type BotSettingsTab = 'general' | 'skills' | 'memories' | 'routines' | 'library' | 'members';
export type AppSection = 'notifications' | 'general' | 'computer' | 'permissions' | 'apps' | 'plan' | 'account';

interface ConfigUI {
  botSettings: { botId: string; tab: BotSettingsTab } | null;
  appSettings: AppSection | null;
  view: View;
  theme: Theme;
  /** Bumped by server events (tasks, memories) so open views refetch. Keys: 'tasks', 'memories:<botId>'. */
  versions: Record<string, number>;
  openBotSettings(botId: string, tab?: BotSettingsTab): void;
  closeBotSettings(): void;
  openAppSettings(section?: AppSection): void;
  closeAppSettings(): void;
  setView(v: View): void;
  setTheme(t: Theme): void;
  bump(key: string): void;
}

const LS_THEME = 'grokbot.theme';
const readTheme = (): Theme => {
  try { const t = localStorage.getItem(LS_THEME); return t === 'light' || t === 'dark' || t === 'system' ? t : 'system'; } catch { return 'system'; }
};

const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function applyTheme(t: Theme) {
  const resolved = t === 'system' ? (darkQuery?.matches ? 'dark' : 'light') : t;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export const useConfigUI = create<ConfigUI>((set, get) => ({
  botSettings: null,
  appSettings: null,
  view: 'chat',
  theme: readTheme(),
  versions: {},
  openBotSettings: (botId, tab = 'general') => set({ botSettings: { botId, tab } }),
  closeBotSettings: () => set({ botSettings: null }),
  openAppSettings: (section = 'general') => set({ appSettings: section }),
  closeAppSettings: () => set({ appSettings: null }),
  setView: (view) => set({ view }),
  setTheme: (theme) => {
    try { localStorage.setItem(LS_THEME, theme); } catch { /* ignore */ }
    applyTheme(theme);
    set({ theme });
  },
  bump: (key) => set({ versions: { ...get().versions, [key]: (get().versions[key] ?? 0) + 1 } }),
}));

// Apply the saved theme as early as possible, and follow the OS while on "system".
applyTheme(readTheme());
darkQuery?.addEventListener?.('change', () => { if (useConfigUI.getState().theme === 'system') applyTheme('system'); });

// store.ts forwards events it doesn't handle itself as a DOM event.
window.addEventListener('grokbot:event', (e) => {
  const ev = (e as CustomEvent<ServerEvent>).detail;
  const { bump } = useConfigUI.getState();
  if (ev.type === 'tasks') { bump('tasks'); bump(`tasks:${ev.botId}`); }
  if (ev.type === 'memories') bump(`memories:${ev.botId}`);
  if (ev.type === 'routines') bump('routines');
});

// Picking a Bot anywhere (sidebar, search, Home) opens its chat; picking a group chat opens it under Groups.
/** The last Bot (not group) and the last group you had open, so Bots and Groups each come back where you were. */
export const lastOpen: { agent: string | null; group: string | null } = { agent: null, group: null };
useStore.subscribe((s, prev) => {
  if (s.selectedBotId === prev.selectedBotId) return;
  const room = s.bots.find((b) => b.id === s.selectedBotId)?.kind === 'room';
  // Remember what you're leaving too: the Bot open when the page loaded never "changed" to get recorded.
  const kindOf = (id: string) => (s.bots.find((b) => b.id === id)?.kind === 'room' ? 'group' : 'agent');
  if (prev.selectedBotId) lastOpen[kindOf(prev.selectedBotId)] = prev.selectedBotId;
  if (s.selectedBotId) lastOpen[room ? 'group' : 'agent'] = s.selectedBotId;
  const view = useConfigUI.getState().view;
  if (room && view !== 'groups') useConfigUI.getState().setView('groups');
  else if (!room && view !== 'chat') useConfigUI.getState().setView('chat');
});
/** The view a Bot's chat opens in: Groups for group chats, Bots for everyone else. */
export const chatViewFor = (botId: string | null) => (useStore.getState().bots.find((b) => b.id === botId)?.kind === 'room' ? 'groups' : 'chat');

export const useVersion = (key: string) => useConfigUI((s) => s.versions[key] ?? 0);
