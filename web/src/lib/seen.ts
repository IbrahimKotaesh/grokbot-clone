// When you last looked at each Bot's chat, on this device. Opening a chat shows a "New messages" line above
// what arrived since then.
const KEY = 'badr.seenAt';
const read = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; } };

export const seenAt = (botId: string): number | null => { const v = read()[botId]; return Number.isFinite(v) ? v : null; };
export function markSeen(botId: string, ts = Date.now()) {
  try { const all = read(); if ((all[botId] ?? 0) >= ts) return; all[botId] = ts; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
}
