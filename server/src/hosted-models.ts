// Fino's own OpenRouter models: the server pays, so computer work is routed cheap-first and every plan has
// a monthly cost cap. Users who add their own OpenRouter key pay for themselves and are never routed.
import { db } from './db.js';
import { usesServerResources } from './lib/owner.js';
import { planOf, type PlanId } from './plans.js';

/** The server's OpenRouter key, or null when Fino doesn't host models on this server. */
export const hostedKey = () => process.env.OPENROUTER_API_KEY || null;

/** Cheap vision model for routine screen steps, and the stronger one used when a task gets stuck. */
export const COMPUTER_CHEAP = process.env.OR_COMPUTER_CHEAP ?? 'qwen/qwen3.7-flash';
export const COMPUTER_STRONG = process.env.OR_COMPUTER_STRONG ?? 'deepseek/deepseek-v4.1-flash';

/**
 * Monthly computer-work AI budget (USD, at cost) per plan. Past it, work continues on the cheap model only,
 * so a heavy user never pushes a plan below its margin. null = no cap.
 */
const COMPUTER_CAP: Record<PlanId, number | null> = { free: 0, starter: 0.5, pro: 8, max: 30, enterprise: null };
/** Monthly chat AI budget (USD, at cost). Past it replies use the cheapest model; past twice it, they stop. */
const CHAT_CAP: Record<PlanId, number | null> = { free: 0.25, starter: 3, pro: 5, max: 20, enterprise: null };

/** The models Fino includes, and the lowest plan that unlocks each. The first one is everyone's default. */
export const HOSTED_MODELS: { id: string; name: string; note: string; tier: PlanId }[] = [
  { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', note: 'Fast everyday model', tier: 'free' },
  { id: 'qwen/qwen3.7-flash', name: 'Qwen 3.7 Flash', note: 'Light and quick, sees images', tier: 'starter' },
  { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', note: 'Careful with numbers and logic', tier: 'starter' },
  { id: 'qwen/qwen3.7-plus', name: 'Qwen 3.7 Plus', note: 'Stronger Qwen, sees images', tier: 'pro' },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', note: 'Deeper reasoning from DeepSeek', tier: 'pro' },
  { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 mini', note: 'Balanced model from OpenAI', tier: 'pro' },
  { id: 'x-ai/grok-4.3', name: 'Grok 4.3', note: 'Sharp and up to date, from xAI', tier: 'pro' },
  { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', note: 'Top writing and reasoning', tier: 'max' },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', note: "OpenAI's flagship", tier: 'max' },
];
const RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2, max: 3, enterprise: 4 };
export const modelAllowed = (plan: PlanId, id: string) => {
  const m = HOSTED_MODELS.find((x) => x.id === id);
  return !!m && RANK[plan] >= RANK[m.tier];
};

// USD per million tokens: [input, cached input, output]. Fallback when OpenRouter doesn't report the cost.
const PRICES: Record<string, [number, number, number]> = {
  'qwen/qwen3.7-flash': [0.03, 0.003, 0.13],
  'deepseek/deepseek-v4.1-flash': [0.05, 0.005, 0.2],
  'qwen/qwen3.7-plus': [0.32, 0.032, 1.28],
  'qwen/qwen3.8-flash': [0.15, 0.015, 0.47],
  'deepseek/deepseek-v4-pro': [0.9, 0.09, 1.5],
  'minimax/minimax-m3.1-flash': [0.075, 0.0075, 0.3],
  'z-ai/glm-4.6v': [0.3, 0.03, 0.9],
  'openai/gpt-5.4-mini': [0.75, 0.075, 4.5],
  'x-ai/grok-4.3': [1.25, 0.125, 2.5],
  'anthropic/claude-sonnet-5.5': [2, 0.2, 10],
  'openai/gpt-5.4': [2.5, 0.25, 15],
  'z-ai/glm-5.3-flash': [0.04, 0.004, 0.078],
  'openai/gpt-5.4-nano': [0.2, 0.02, 1.25],
};

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  cost?: number;
}

/** What a call cost: OpenRouter's own figure when present, else an estimate from the price table. */
export function costOf(model: string, u: Usage | undefined): number {
  if (!u) return 0;
  if (typeof u.cost === 'number') return u.cost;
  const p = PRICES[model] ?? [1, 0.1, 5];
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  const fresh = Math.max(0, (u.input_tokens ?? 0) - cached);
  return (fresh * p[0] + cached * p[1] + (u.output_tokens ?? 0) * p[2]) / 1e6;
}

/** What Fino paid for this user's chat or computer work this calendar month. */
export function hostedSpend(userId: string, kind: 'chat' | 'computer'): number {
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const row = db
    .prepare('SELECT COALESCE(SUM(cost_usd),0) AS s FROM model_usage WHERE user_id=? AND kind=? AND hosted=1 AND started_at>=?')
    .get(userId, kind, monthStart) as { s: number };
  return row.s;
}
export const computerSpend = (userId: string) => hostedSpend(userId, 'computer');

/**
 * The model a chat step runs on with Fino's key: the bot's choice if the plan includes it, else the default.
 * Past the month's chat budget everything runs on the cheapest model; past twice the budget, replies stop.
 */
export function hostedChatModel(userId: string, wanted: string): string {
  const plan = planOf(userId).id;
  const cap = CHAT_CAP[plan];
  const spent = hostedSpend(userId, 'chat');
  if (cap !== null && spent >= cap * 2)
    throw Object.assign(new Error("This month's included AI is used up. Upgrade your plan, or add your own AI key in Settings → AI models."), { status: 402 });
  if (cap !== null && spent >= cap) return HOSTED_MODELS[0].id;
  return modelAllowed(plan, wanted) ? wanted : HOSTED_MODELS[0].id;
}

/** What the app shows in the model picker: every included model, which ones this plan unlocks, and usage. */
export function hostedSummary(userId: string) {
  const plan = planOf(userId).id;
  const pct = (spent: number, cap: number | null) => (cap === null ? null : cap === 0 ? (spent > 0 ? 100 : 0) : Math.min(100, Math.round((spent / cap) * 100)));
  return {
    available: !!hostedKey() && (usesServerResources(userId) || plan !== 'free'),
    plan,
    models: HOSTED_MODELS.map((m) => ({ id: m.id, name: m.name, note: m.note, tier: m.tier, allowed: modelAllowed(plan, m.id) })),
    // Percent of the month's included AI used, not dollars: the app shows it as a simple meter.
    usage: { chat: pct(hostedSpend(userId, 'chat'), CHAT_CAP[plan]), computer: pct(computerSpend(userId), COMPUTER_CAP[plan]) },
  };
}

export function overComputerCap(userId: string): boolean {
  const cap = COMPUTER_CAP[planOf(userId).id];
  return cap !== null && computerSpend(userId) >= cap;
}

/** Per-turn routing state for one bot's computer work. */
export interface RouteState {
  computer: boolean; // the last step used the screen
  cheapSteps: number;
  trouble: number; // failed or no-op screen actions on the cheap model
  escalated: boolean;
  uses: Record<string, number>; // how often each tool ran in this turn (the loop watcher)
}
export const newRoute = (): RouteState => ({ computer: false, cheapSteps: 0, trouble: 0, escalated: false, uses: {} });

/** Stay on the cheap model until it struggles (2 failed/no-op actions or 25 steps), unless the month's budget is used up. */
export function computerModel(userId: string, r: RouteState): string {
  if (!r.escalated && (r.trouble >= 2 || r.cheapSteps >= 25) && !overComputerCap(userId)) r.escalated = true;
  return r.escalated ? COMPUTER_STRONG : COMPUTER_CHEAP;
}
