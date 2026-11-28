// The Usage page: what the user's team used over a period, per Bot and per model, what that work costs at public
// API prices, and what's left of the plan this month. Counts and prices only; never what was said.
import { db } from './db.js';
import { FREE_MODEL, HOSTED_MODELS, hostedSummary, listPrice } from './hosted-models.js';
import { computerMinutesThisMonth, monthStart, planOf } from './plans.js';

export type UsageRange = 'today' | '7d' | '30d' | 'month';
const DAY = 86_400_000;

function startOf(range: UsageRange): number {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (range === 'today') return d.getTime();
  if (range === '7d') return d.getTime() - 6 * DAY;
  if (range === '30d') return d.getTime() - 29 * DAY;
  return monthStart();
}

/** What Badr shows for a model: Badr's own names for its models, and plain words for the user's own AI. Never a vendor model id. */
function modelLabel(provider: string, model: string | null, hosted: boolean): { label: string; kind: 'badr' | 'subscription' | 'key' } {
  if (hosted && model && model === FREE_MODEL) return { label: 'Badr 4.8 (free)', kind: 'badr' };
  if (hosted && model?.startsWith('openai/gpt-audio-mini')) return { label: 'Voice calls (OpenAI trial, saver)', kind: 'badr' };
  if (hosted && model?.startsWith('openai/gpt-audio')) return { label: 'Voice calls (OpenAI trial)', kind: 'badr' };
  if (hosted) return { label: HOSTED_MODELS.find((m) => m.id === model)?.name ?? 'Badr (computer work)', kind: 'badr' };
  if (provider === 'codex') return { label: 'ChatGPT (your subscription)', kind: 'subscription' };
  if (provider === 'claude' || provider === 'claude-code') return { label: 'Claude (your subscription)', kind: 'subscription' };
  if (provider === 'xai') return { label: 'Grok (your key)', kind: 'key' };
  return { label: 'Your own AI key', kind: 'key' };
}

interface Row { id: number; turn_id: string | null; bot_id: string; provider: string; model: string | null; hosted: number; input_tokens: number; cached_tokens: number; output_tokens: number; cost_usd: number; computer_steps: number; started_at: number; ended_at: number }
/** At API prices: Badr's own models at what they really cost; the rest at the vendor's list price. */
const costOf = (r: Row) => {
  if (r.hosted) return r.cost_usd ?? 0;
  const [i, c, o] = listPrice(r.provider, r.model), cached = Math.min(r.cached_tokens ?? 0, r.input_tokens ?? 0);
  return (((r.input_tokens ?? 0) - cached) * i + cached * c + (r.output_tokens ?? 0) * o) / 1e6;
};
const round = (n: number) => Math.round(n * 10000) / 10000;

export function usageReport(userId: string, range: UsageRange) {
  const from = startOf(range), now = Date.now();
  const rows = db.prepare('SELECT id, turn_id, bot_id, provider, model, hosted, input_tokens, cached_tokens, output_tokens, cost_usd, computer_steps, started_at, ended_at FROM model_usage WHERE user_id=? AND started_at>=? ORDER BY started_at').all(userId, Math.min(from, monthStart())) as Row[];
  const inRange = rows.filter((r) => r.started_at >= from);
  let images = new Map<string, number>();
  try { images = new Map((db.prepare('SELECT bot_id, SUM(units) n FROM image_usage WHERE user_id=? AND created_at>=? GROUP BY bot_id').all(userId, from) as any[]).map((r) => [r.bot_id, r.n])); } catch { /* no images made on this server yet */ }
  const names = new Map((db.prepare('SELECT id, name FROM bots WHERE user_id=?').all(userId) as any[]).map((b) => [b.id, b.name]));

  // Buckets for the chart: hours for today, days otherwise.
  const hourly = range === 'today', size = hourly ? 3_600_000 : DAY;
  const count = hourly ? 24 : Math.round((new Date(now).setHours(0, 0, 0, 0) - from) / DAY) + 1;
  const buckets = Array.from({ length: count }, (_, i) => ({ t: from + i * size, turns: 0, tokens: 0, cost: 0 }));
  const totals = { turns: 0, tokens: 0, input: 0, output: 0, cost: 0, busyMinutes: 0, computerSteps: 0, images: [...images.values()].reduce((a, b) => a + b, 0) };
  const bots = new Map<string, { botId: string; turns: number; tokens: number; cost: number; busyMs: number; computerSteps: number; lastAt: number }>();
  const models = new Map<string, { label: string; kind: string; turns: number; tokens: number; cost: number }>();
  // One message can take several model calls: they share a turn id, count as one message, and its working time
  // runs from the first call to the last. (Older rows have no turn id and count one each.)
  const turns = new Map<string, Row[]>();
  for (const r of inRange) { const k = r.turn_id ?? `row:${r.id}`; (turns.get(k) ?? turns.set(k, []).get(k)!).push(r); }
  for (const calls of turns.values()) {
    const started = Math.min(...calls.map((r) => r.started_at)), ended = Math.max(...calls.map((r) => r.ended_at));
    const busy = Math.max(0, ended - started), botId = calls[0].bot_id;
    const b = buckets[Math.min(count - 1, Math.max(0, Math.floor((started - from) / size)))];
    const seen = new Set<string>();
    b.turns++; totals.turns++; totals.busyMinutes += busy / 60000;
    const x = names.has(botId) ? bots.get(botId) ?? { botId, turns: 0, tokens: 0, cost: 0, busyMs: 0, computerSteps: 0, lastAt: 0 } : null;
    if (x) { x.turns++; x.busyMs += busy; x.lastAt = Math.max(x.lastAt, ended); bots.set(botId, x); }
    for (const r of calls) {
      const tokens = (r.input_tokens ?? 0) + (r.output_tokens ?? 0), cost = costOf(r);
      b.tokens += tokens; b.cost += cost;
      totals.tokens += tokens; totals.input += r.input_tokens ?? 0; totals.output += r.output_tokens ?? 0; totals.cost += cost; totals.computerSteps += r.computer_steps ?? 0;
      if (x) { x.tokens += tokens; x.cost += cost; x.computerSteps += r.computer_steps ?? 0; }
      const m = modelLabel(r.provider, r.model, !!r.hosted), mx = models.get(m.label) ?? { ...m, turns: 0, tokens: 0, cost: 0 };
      if (!seen.has(m.label)) { mx.turns++; seen.add(m.label); }
      mx.tokens += tokens; mx.cost += cost; models.set(m.label, mx);
    }
  }

  // This month against the plan: what's left, and where the month is heading.
  const monthCost = rows.filter((r) => r.started_at >= monthStart()).reduce((a, r) => a + costOf(r), 0);
  const d = new Date(), daysIn = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), elapsed = Math.max(1, (now - monthStart()) / DAY);
  const plan = planOf(userId), included = hostedSummary(userId).usage;
  return {
    range, from, to: now, hourly,
    buckets: buckets.map((b) => ({ ...b, cost: round(b.cost) })),
    totals: { ...totals, cost: round(totals.cost), busyMinutes: Math.round(totals.busyMinutes * 10) / 10 },
    bots: [...bots.values()].map((x) => ({ botId: x.botId, turns: x.turns, tokens: x.tokens, cost: round(x.cost), busyMinutes: Math.round(x.busyMs / 6000) / 10, computerSteps: x.computerSteps, images: images.get(x.botId) ?? 0, lastAt: x.lastAt })),
    models: [...models.values()].map((m) => ({ ...m, cost: round(m.cost) })),
    month: {
      cost: round(monthCost), projected: round((monthCost / elapsed) * daysIn),
      plan: { id: plan.id, name: plan.name, priceUsd: plan.priceUsd, computerHours: plan.computerHours },
      computer: { usedMinutes: computerMinutesThisMonth(userId), limitMinutes: plan.computerHours === null ? null : plan.computerHours * 60 },
      // Percent of the month's included AI already used (chat and computer work), as the model picker shows it.
      includedUsed: { chat: included.chat, computer: included.computer },
    },
  };
}
