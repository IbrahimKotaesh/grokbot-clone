// Fino's own OpenRouter models: the server pays, so computer work is routed cheap-first and every plan has
// a monthly cost cap. Users who add their own OpenRouter key pay for themselves and are never routed.
import { db } from './db.js';
import { planOf, type PlanId } from './plans.js';

/** The server's OpenRouter key, or null when Fino doesn't host models on this server. */
export const hostedKey = () => process.env.OPENROUTER_API_KEY || null;

/** Cheap vision model for routine screen steps, and the stronger one used when a task gets stuck. */
export const COMPUTER_CHEAP = process.env.OR_COMPUTER_CHEAP ?? 'qwen/qwen3.7-flash';
export const COMPUTER_STRONG = process.env.OR_COMPUTER_STRONG ?? 'google/gemini-3.8-flash';

/**
 * Monthly computer-work AI budget (USD, at cost) per plan. Past it, work continues on the cheap model only,
 * so a heavy user never pushes a plan below its margin. null = no cap.
 */
const COMPUTER_CAP: Record<PlanId, number | null> = { free: 0, starter: 1, pro: 10, max: 40, enterprise: null };

// USD per million tokens: [input, cached input, output]. Fallback when OpenRouter doesn't report the cost.
const PRICES: Record<string, [number, number, number]> = {
  'qwen/qwen3.7-flash': [0.03, 0.003, 0.13],
  'deepseek/deepseek-v4.1-flash': [0.05, 0.005, 0.2],
  'google/gemini-3.1-flash-lite': [0.25, 0.025, 1.5],
  'google/gemini-3.8-flash': [0.825, 0.0825, 4.125],
  'google/gemini-3.6-flash': [0.75, 0.075, 3.75],
  'openai/gpt-5.4-mini': [0.75, 0.075, 4.5],
  'x-ai/grok-4.3': [1.25, 0.125, 2.5],
  'anthropic/claude-sonnet-5.5': [2, 0.2, 10],
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
  const p = PRICES[model] ?? PRICES[COMPUTER_STRONG] ?? [1, 0.1, 5];
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  const fresh = Math.max(0, (u.input_tokens ?? 0) - cached);
  return (fresh * p[0] + cached * p[1] + (u.output_tokens ?? 0) * p[2]) / 1e6;
}

/** Hosted computer-work spend this calendar month. */
export function computerSpend(userId: string): number {
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const row = db
    .prepare("SELECT COALESCE(SUM(cost_usd),0) AS s FROM model_usage WHERE user_id=? AND kind='computer' AND hosted=1 AND started_at>=?")
    .get(userId, monthStart) as { s: number };
  return row.s;
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
}
export const newRoute = (): RouteState => ({ computer: false, cheapSteps: 0, trouble: 0, escalated: false });

/** Stay on the cheap model until it struggles (2 failed/no-op actions or 25 steps), unless the month's budget is used up. */
export function computerModel(userId: string, r: RouteState): string {
  if (!r.escalated && (r.trouble >= 2 || r.cheapSteps >= 25) && !overComputerCap(userId)) r.escalated = true;
  return r.escalated ? COMPUTER_STRONG : COMPUTER_CHEAP;
}
