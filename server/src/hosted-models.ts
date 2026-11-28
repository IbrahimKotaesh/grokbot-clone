// Fino's own OpenRouter models: the server pays, so computer work is routed cheap-first and every plan has
// a monthly cost cap. Users who add their own OpenRouter key pay for themselves and are never routed.
import { db } from './db.js';
import { planOf, TRIAL, trialUntil, type PlanId } from './plans.js';

/**
 * Hosts for Fino's included models: any host that neither keeps prompts nor trains on them (OpenRouter's
 * data_collection: deny). OpenRouter picks the cheapest healthy one (often Baidu for Badr 1) and keeps each
 * conversation on it for the prompt cache. OR_PROVIDER_ONLY (comma-separated host slugs) limits it to a list,
 * e.g. US/EU hosts only, at about twice the cost per cached step.
 */
const HOSTED_PROVIDERS = (process.env.OR_PROVIDER_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
export const hostedProviderPrefs = () => ({ data_collection: 'deny' as const, ...(HOSTED_PROVIDERS.length ? { only: HOSTED_PROVIDERS } : {}) });

/** The server's OpenRouter key, or null when Fino doesn't host models on this server. */
export const hostedKey = () => process.env.OPENROUTER_API_KEY || null;

/** Cheap vision model for routine screen steps, and the stronger one used when a task gets stuck. */
export const COMPUTER_CHEAP = process.env.OR_COMPUTER_CHEAP ?? 'z-ai/glm-5.3-flash';
export const COMPUTER_STRONG = process.env.OR_COMPUTER_STRONG ?? 'deepseek/deepseek-v4.1-flash';

/**
 * Monthly computer-work AI budget (USD, at cost) per plan. Past it, work continues on the cheap model only,
 * so a heavy user never pushes a plan below its margin. null = no cap.
 */
const COMPUTER_CAP: Record<PlanId, number | null> = { free: 0, starter: 1, pro: 6, max: 14, ultra: 35, enterprise: null };
/** Monthly chat AI budget (USD, at cost). Past it replies use the cheapest model; past twice it, they stop. */
const CHAT_CAP: Record<PlanId, number | null> = { free: 0.25, starter: 1.5, pro: 4, max: 8, ultra: 15, enterprise: null };

/** The models Fino includes, and the lowest plan that unlocks each. The first one is everyone's default. */
export const HOSTED_MODELS: { id: string; name: string; note: string; tier: PlanId; base: string }[] = [
  // Badr's own names for the open-source models it hosts (see the privacy page), open to every plan, newest
  // number first. Each plan's monthly AI budget (CHAT_CAP) still applies; past it, replies use Badr 4.8.
  // 4.2, 4.5, 4.9 and 5.0 (added 2026-11-28) are cheap open models, tested for tool use and Arabic. Measured in
  // the app (about 14k prompt tokens a step): 4.5 and 4.9 ≈ $0.0015 a step, 4.2 ≈ $0.002, 5.0 ≈ $0.006 (like 4.8),
  // 5.1 ≈ $0.013. Full GLM 5.3 was left out: its private hosts charged ≈ $0.02 a step. The Usage page shows each one.
  { id: 'deepseek/deepseek-v4-pro', name: 'Badr 5.1', note: 'Smartest, for long and hard tasks', tier: 'free', base: "DeepSeek's open-source V4 Pro model" },
  { id: 'moonshotai/kimi-k2.7-code', name: 'Badr 5.0', note: 'Strong at code, files and data', tier: 'free', base: "Moonshot's open-source Kimi K2.7 model" },
  { id: 'z-ai/glm-5.3-flash', name: 'Badr 4.9', note: 'Strong at long, multi-step work', tier: 'free', base: "Zhipu's open-source GLM 5.3 Flash model" },
  { id: 'deepseek/deepseek-v4.1-flash', name: 'Badr 4.8', note: 'Everyday default: free when it can be, stronger when needed', tier: 'free', base: "DeepSeek's open-source V4.1 Flash model (simple steps may first go to Baidu's free ERNIE preview, and long tasks step up to Badr 5.1)" },
  { id: 'qwen/qwen3.8-flash', name: 'Badr 4.5', note: 'Cheap, and reads images and screenshots', tier: 'free', base: "Alibaba's open-source Qwen 3.8 Flash model" },
  { id: 'xiaomi/mimo-v2.6-flash', name: 'Badr 4.2', note: 'Light and quick, for short replies', tier: 'free', base: "Xiaomi's open-source MiMo v2.6 Flash model" },
];
/** Everyone's default, and what replies fall back to past the monthly budget. */
export const DEFAULT_HOSTED = 'deepseek/deepseek-v4.1-flash';
/** The strongest included model: long messages on the default path step up to it. */
export const STRONG_HOSTED = 'deepseek/deepseek-v4-pro';

/*
 * The default path ("Badr 4.8"), tested 2026-11-28 on ten everyday Bot tasks and a real-size prompt:
 *  1. Free first: Baidu's ERNIE preview on OpenRouter costs nothing, keeps no data (works with data_collection: deny)
 *     and passed 9 of 10 tasks. Not for Arabic conversations (see sequenceModel). OpenRouter allows about 1,000 free requests a day for the whole server.
 *  2. When the free model is rate limited or fails, the same step reruns on DeepSeek V4.1 Flash (10 of 10, and the
 *     cheapest paid model once its prompt cache is warm), and the free model rests a while.
 *  3. A message that is still going after STEP_UP_AFTER steps is a hard task: the rest of it runs on Badr 5.1.
 * A model the user picks on purpose (any other one) is always used as picked. OR_FREE_MODEL='' turns step 1 off.
 */
export const FREE_MODEL = process.env.OR_FREE_MODEL ?? 'baidu/ernie-5.5-flash-preview:free';
export const STEP_UP_AFTER = Number(process.env.OR_STEP_UP_AFTER ?? 10);
let freeRestUntil = 0;
export const freeAvailable = () => !!FREE_MODEL && Date.now() >= freeRestUntil;
/** The free model refused a step: rest it until tomorrow (daily allowance used), a minute (busy) or ten minutes (down). */
export function freeFailed(err: any) {
  const msg = String(err?.message ?? err ?? '');
  const midnight = new Date(); midnight.setUTCHours(24, 0, 0, 0);
  freeRestUntil = err?.status === 429 && /per.?day|daily|free-models/i.test(msg) ? midnight.getTime() : Date.now() + (err?.status === 429 ? 60_000 : 600_000);
  console.warn('[models] free model resting until', new Date(freeRestUntil).toISOString(), msg.slice(0, 160));
}
export const resetFreeRest = () => { freeRestUntil = 0; };

const RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2, max: 3, ultra: 4, enterprise: 5 };
export const modelAllowed = (plan: PlanId, id: string) => {
  const m = HOSTED_MODELS.find((x) => x.id === id);
  return !!m && RANK[plan] >= RANK[m.tier];
};

// USD per million tokens: [input, cached input, output], from OpenRouter on 2026-11-24. Fallback when OpenRouter doesn't report the cost.
const PRICES: Record<string, [number, number, number]> = {
  'qwen/qwen3.7-flash': [0.03, 0.006, 0.13],
  'deepseek/deepseek-v4.1-flash': [0.0507, 0.001, 0.2028],
  'qwen/qwen3.7-plus': [0.32, 0.064, 1.28],
  'qwen/qwen3.8-flash': [0.15, 0.015, 0.47],
  'deepseek/deepseek-v4-pro': [1.28, 0.108, 2.56],
  'minimax/minimax-m3.1-flash': [0.075, 0.0075, 0.3],
  'z-ai/glm-4.6v': [0.3, 0.03, 0.9],
  'openai/gpt-5.4-mini': [0.75, 0.075, 4.5],
  'x-ai/grok-4.3': [1.25, 0.2, 2.5],
  'anthropic/claude-sonnet-5.5': [2, 0.1, 10],
  'openai/gpt-5.4': [2.5, 0.25, 15],
  'z-ai/glm-5.3-flash': [0.15, 0.03, 0.5],
  'openai/gpt-5.4-nano': [0.2, 0.02, 1.25],
  // 2026-11-28, cheapest private host on OpenRouter.
  'moonshotai/kimi-k2.7-code': [0.6, 0.1, 3],
  'xiaomi/mimo-v2.6-flash': [0.14, 0.014, 0.28],
};

/**
 * Public API list price (USD per million tokens: input, cached input, output) for a model, for the Usage page's
 * "at API prices" figures. Badr's own models use the table above; work done on the user's own subscriptions is
 * priced at the matching vendor's API (an estimate: those users pay their subscription, not per token).
 */
export function listPrice(provider: string, model: string | null): [number, number, number] {
  const m = (model ?? '').toLowerCase();
  if (PRICES[m]) return PRICES[m];
  if (provider === 'codex' || /^(gpt|o\d|codex)/.test(m)) return PRICES[/mini/.test(m) ? 'openai/gpt-5.4-mini' : /nano/.test(m) ? 'openai/gpt-5.4-nano' : 'openai/gpt-5.4'];
  if (provider === 'claude' || provider === 'claude-code' || /claude|sonnet|opus|haiku/.test(m)) return PRICES['anthropic/claude-sonnet-5.5'];
  if (provider === 'xai' || /grok/.test(m)) return PRICES['x-ai/grok-4.3'];
  return [1, 0.1, 5];
}

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
/** The month's AI budget (USD at cost) for chat or computer work; the free trial day has its own small one. */
function capFor(userId: string, kind: 'chat' | 'computer'): number | null {
  // Chat replies stop at twice the cap, so the trial's chat cap is half its budget.
  if (trialUntil(userId)) return kind === 'chat' ? TRIAL.chatUsd / 2 : TRIAL.computerUsd;
  const plan = planOf(userId).id;
  return kind === 'chat' ? CHAT_CAP[plan] : COMPUTER_CAP[plan];
}

export function hostedChatModel(userId: string, wanted: string): string {
  const plan = planOf(userId).id;
  const cap = capFor(userId, 'chat');
  const spent = hostedSpend(userId, 'chat');
  if (cap !== null && spent >= cap * 2)
    throw Object.assign(new Error(trialUntil(userId)
      ? "The free trial day's included AI is used up. It refills when your plan starts, or connect your own ChatGPT in Settings → AI models."
      : "This month's included AI is used up. Upgrade your plan, or add your own AI key in Settings → AI models."), { status: 402 });
  if (cap !== null && spent >= cap) return DEFAULT_HOSTED;
  return modelAllowed(plan, wanted) ? wanted : DEFAULT_HOSTED;
}

/**
 * The model for one step on the default path (see FREE_MODEL above). `step` counts this message's model calls from 0.
 * Arabic conversations skip the free model: on 15 everyday Arabic questions it slipped Chinese, Hebrew or English
 * letters into 7 answers (DeepSeek V4.1 Flash: none), so Arabic goes straight to Badr 4.8.
 */
export function sequenceModel(userId: string, step: number, opts: { arabic?: boolean } = {}): string {
  const cap = capFor(userId, 'chat');
  const capped = cap !== null && hostedSpend(userId, 'chat') >= cap;
  if (!capped && step >= STEP_UP_AFTER) return STRONG_HOSTED;
  return freeAvailable() && !opts.arabic ? FREE_MODEL : DEFAULT_HOSTED;
}

/** What the app shows in the model picker: every included model, which ones this plan unlocks, and usage. */
export function hostedSummary(userId: string) {
  const plan = planOf(userId).id;
  const pct = (spent: number, cap: number | null) => (cap === null ? null : cap === 0 ? (spent > 0 ? 100 : 0) : Math.min(100, Math.round((spent / cap) * 100)));
  return {
    available: !!hostedKey(),
    plan,
    models: HOSTED_MODELS.map((m) => ({ id: m.id, name: m.name, note: m.note, tier: m.tier, allowed: modelAllowed(plan, m.id) })),
    // Percent of the month's included AI used, not dollars: the app shows it as a simple meter.
    usage: { chat: pct(hostedSpend(userId, 'chat'), capFor(userId, 'chat')), computer: pct(computerSpend(userId), capFor(userId, 'computer')) },
  };
}

export function overComputerCap(userId: string): boolean {
  const cap = capFor(userId, 'computer');
  return cap !== null && computerSpend(userId) >= cap;
}

/** Per-turn routing state for one bot's computer work. */
export interface RouteState {
  computer: boolean; // the last step used the screen
  cheapSteps: number;
  trouble: number; // failed or no-op screen actions on the cheap model
  escalated: boolean;
  uses: Record<string, number>; // how often each tool ran in this turn (the loop watcher)
  screenRun: number; // screen steps in a row
}
export const newRoute = (): RouteState => ({ computer: false, cheapSteps: 0, trouble: 0, escalated: false, uses: {}, screenRun: 0 });

/**
 * Screen steps run on DeepSeek: it reads images, it was the stronger screen model in our test, and it shares the
 * prompt cache with the rest of the conversation. Measured on a real screen task: warm DeepSeek steps cost
 * $0.00015-0.00018, while each switch to Qwen started cold (Mo: 0 of 32k cached, $0.0033) and even warm Qwen steps
 * were $0.0002-0.0003. Qwen remains the fallback once a plan's monthly computer budget is used up.
 */

/** Stay on the cheap model until it struggles (2 failed/no-op actions or 25 steps), unless the month's budget is used up. */
export function computerModel(userId: string, _r: RouteState): string {
  return overComputerCap(userId) ? COMPUTER_CHEAP : COMPUTER_STRONG;
}
