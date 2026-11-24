import { useEffect, useState } from 'react';

/** Fino's included models (paid by Fino through OpenRouter); the server decides which a plan may use. */
export interface HostedModels {
  available: boolean;
  plan: string;
  models: { id: string; name: string; note: string; tier: string; allowed: boolean }[];
  usage: { chat: number | null; computer: number | null };
}

let cache: HostedModels | null = null;
let pending: Promise<HostedModels | null> | null = null;

export function loadHostedModels(fresh = false): Promise<HostedModels | null> {
  if (cache && !fresh) return Promise.resolve(cache);
  pending ??= fetch('/api/hosted-models', { credentials: 'include' })
    .then((r) => (r.ok ? (r.json() as Promise<HostedModels>) : null))
    .then((d) => (cache = d))
    .catch(() => null)
    .finally(() => { pending = null; });
  return pending;
}

export function useHostedModels() {
  const [data, setData] = useState<HostedModels | null>(cache);
  useEffect(() => { void loadHostedModels(true).then(setData); }, []);
  return data;
}

export const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash';
const NAMES: Record<string, string> = {
  // Fino's own names for the open-source models it hosts.
  'deepseek/deepseek-v4.1-flash': 'Fino Flash',
  'z-ai/glm-5.3-flash': 'Fino Logic',
  'deepseek/deepseek-v4-pro': 'Fino Deep',
  'openai/gpt-5.4-mini': 'GPT-5.4 mini',
  'x-ai/grok-4.3': 'Grok 4.3',
  'anthropic/claude-sonnet-5.5': 'Claude Sonnet 5.5',
  'openai/gpt-5.4': 'GPT-5.4',
};
/** "deepseek/deepseek-v4.1-flash" → "Fino Flash"; the default model when none is set. */
export const modelName = (id?: string) => (id ? NAMES[id] ?? id.split('/').pop() ?? id : NAMES[DEFAULT_MODEL]);

/** What the bot runs on, as one label: an included model's name, or the user's own subscription. */
export function brainLabel(bot: { agentProvider?: string; model?: string }) {
  if (bot.agentProvider === 'openrouter') return modelName(bot.model);
  if (bot.agentProvider === 'claude' || bot.agentProvider === 'claude-code') return 'Claude Code';
  if (bot.agentProvider === 'xai') return 'Grok';
  if (bot.agentProvider === 'groq') return 'Groq';
  return 'ChatGPT';
}

const LOGOS: [string, string][] = [
  ['deepseek/', 'fino'],
  ['z-ai/', 'fino'],
  ['qwen/', 'fino'],
  ['x-ai/', 'grok'],
  ['openai/', 'chatgpt'],
  ['anthropic/', 'claude'],
];
/** The logo of the company behind a model id, on the same white tile as the provider marks. */
export function ModelLogo({ model, dim = false }: { model: string; dim?: boolean }) {
  const file = LOGOS.find(([p]) => model.startsWith(p))?.[1] ?? 'chatgpt';
  return (
    <span className={`provider-logo provider-logo--${file}`} aria-hidden="true" style={dim ? { opacity: 0.45 } : undefined}>
      <img src={`/brands/${file}.${file === 'fino' ? 'png' : 'svg'}`} width={20} height={20} alt="" />
    </span>
  );
}

/** The logo for a bot's current brain. */
export function BrainLogo({ bot }: { bot: { agentProvider?: string; model?: string } }) {
  if (bot.agentProvider === 'openrouter') return <ModelLogo model={bot.model || DEFAULT_MODEL} />;
  if (bot.agentProvider === 'claude' || bot.agentProvider === 'claude-code') return <ModelLogo model="anthropic/" />;
  if (bot.agentProvider === 'xai') return <ModelLogo model="x-ai/" />;
  return <ModelLogo model="openai/" />;
}

export const tierName = (tier: string) => (tier === 'ultra' ? 'Ultra' : tier === 'max' ? 'Max' : tier === 'pro' ? 'Pro' : 'Starter');
