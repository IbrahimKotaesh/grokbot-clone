import type { Bot } from '@shared/types';
import { api } from './api';
import { useStore } from '../store';

/** Pause or resume a Bot, showing the change at once. */
export async function setPaused(bot: Bot, paused: boolean) {
  const flip = (p: boolean) => useStore.setState((st) => ({ bots: st.bots.map((b) => (b.id === bot.id ? { ...b, paused: p } : b)) }));
  flip(paused);
  try { await api.pause(bot.id, paused); } catch (e) { flip(!paused); throw e; }
}

