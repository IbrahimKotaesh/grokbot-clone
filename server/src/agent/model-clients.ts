import { usesServerResources } from '../lib/owner.js';
import { planOf } from '../plans.js';
// Responses-API model providers for the built-in agent loop. Codex (ChatGPT) and Claude have their own
// runtimes; everything here speaks OpenAI's Responses API, so the loop, tools and history stay the same.
import OpenAI from 'openai';
import { env } from '../env.js';
import { apiKeyFor } from '../credentials.js';
import { hostedKey } from '../hosted-models.js';

export type LoopProvider = 'xai' | 'openrouter' | 'groq';
export const LOOP_PROVIDERS: LoopProvider[] = ['xai', 'openrouter', 'groq'];
const BASE: Record<LoopProvider, string> = {
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
};
// Sensible defaults when a bot has no model set. Users can type any model the provider offers.
export const DEFAULT_MODEL: Record<LoopProvider, string> = {
  xai: env.xaiModel,
  openrouter: process.env.OR_DEFAULT_MODEL ?? 'deepseek/deepseek-v4.1-flash',
  groq: 'openai/gpt-oss-120b',
};
const NAMES: Record<LoopProvider, string> = { xai: 'xAI', openrouter: 'OpenRouter', groq: 'Groq' };

const cache = new Map<string, OpenAI>();
export function loopClient(userId: string, provider: LoopProvider, model?: string | null) {
  const own = apiKeyFor(userId, provider);
  // Only xAI has a server-wide fallback key (it also powers voice).
  // xAI and OpenRouter can fall back to the server's own key; Fino then pays (and routes OpenRouter cheaply).
  // On a public server, Fino-paid keys are for the owner and paying plans; free customers bring their own.
  const serverPays = usesServerResources(userId) || planOf(userId).id !== 'free';
  const hosted = !own && serverPays && provider === 'openrouter' && !!hostedKey();
  const key = own ?? (serverPays && provider === 'xai' && env.xaiKey !== 'disabled' ? env.xaiKey : null) ?? (hosted ? hostedKey() : null);
  if (!key) throw new Error(`Add your ${NAMES[provider]} API key in Account → AI models to use this bot.`);
  const id = `${provider}:${key.slice(-12)}`;
  let client = cache.get(id);
  if (!client) {
    client = new OpenAI({ apiKey: key, baseURL: BASE[provider], timeout: 360_000 });
    cache.set(id, client);
  }
  return { client, model: model || DEFAULT_MODEL[provider], provider, xaiExtras: provider === 'xai', hosted };
}
