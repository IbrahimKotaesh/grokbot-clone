// Automatic model fallback. When a bot's model stops answering because of usage limits, the same message
// is retried on the user's next connected model, and the exhausted one is skipped for a while.
import { db, now } from '../db.js';
import { sharedLoginAllowed } from '../credentials.js';

const COOLDOWN = 60 * 60_000;
const exhausted = new Map<string, number>(); // `${userId}:${provider}` → until

export const PROVIDER_NAMES: Record<string, string> = {
  codex: 'ChatGPT', claude: 'Claude', 'claude-code': 'Claude Code', xai: 'Grok', openrouter: 'OpenRouter', groq: 'Groq',
};

/** Errors that mean "this model is out of usage or overloaded", not "this request is wrong". */
export function isQuotaError(e: any) {
  if (e?.status === 429 || e?.status === 402 || e?.status === 529) return true;
  return /\b429\b|rate.?limit|usage.?limit|limit reached|hit your .*limit|quota|insufficient|exceeded|credit balance|out of credits|too many requests|overloaded|capacity/i.test(String(e?.message ?? e));
}

export function markExhausted(userId: string, provider: string) {
  exhausted.set(`${userId}:${provider}`, now() + COOLDOWN);
}
export function isExhausted(userId: string, provider: string) {
  const until = exhausted.get(`${userId}:${provider}`);
  if (!until) return false;
  if (until < now()) {
    exhausted.delete(`${userId}:${provider}`);
    return false;
  }
  return true;
}

/**
 * Models this user can fall back to, in preference order: only their own subscriptions and keys.
 * Fino-paid models (included OpenRouter models, the server's xAI key) are never a silent fallback,
 * so a bot on ChatGPT or Claude never starts spending Fino's money without the user picking it.
 * Claude Code needs its own sign-in, so it is never a fallback.
 */
export function availableProviders(userId: string): string[] {
  const keys = new Set((db.prepare('SELECT provider FROM user_credentials WHERE user_id=?').all(userId) as { provider: string }[]).map((r) => r.provider));
  const shared = sharedLoginAllowed(userId);
  const list: string[] = [];
  if (keys.has('chatgpt') || keys.has('openai') || shared) list.push('codex');
  if (keys.has('anthropic') || keys.has('claude') || shared) list.push('claude');
  if (keys.has('openrouter')) list.push('openrouter');
  if (keys.has('groq')) list.push('groq');
  if (keys.has('xai')) list.push('xai');
  return list;
}

/** The provider to use for a turn: the bot's own, unless it is cooling down and another one is available. */
export function pickProvider(userId: string, preferred: string, tried: string[] = []) {
  if (!isExhausted(userId, preferred) && !tried.includes(preferred)) return preferred;
  return availableProviders(userId).find((p) => p !== preferred && !tried.includes(p) && !isExhausted(userId, p)) ?? null;
}
