import { useEffect, useState } from 'react';
import { t } from './i18n';

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
    // Model names in the reader's language (Badr 4.8 → بدر 4.8).
    .then((d) => (cache = d && { ...d, models: d.models.map((m) => ({ ...m, name: t(m.name) })) }))
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
  'deepseek/deepseek-v4-pro': 'Badr 5.1',
  'deepseek/deepseek-v4.1-flash': 'Badr 4.8',
  'openai/gpt-5.4-mini': 'GPT-5.4 mini',
  'x-ai/grok-4.3': 'Grok 4.3',
  'anthropic/claude-sonnet-5.5': 'Claude Sonnet 5.5',
  'openai/gpt-5.4': 'GPT-5.4',
};
/** "deepseek/deepseek-v4.1-flash" → "Badr 4.8"; the default model when none is set. */
export const modelName = (id?: string) => t(id ? NAMES[id] ?? id.split('/').pop() ?? id : NAMES[DEFAULT_MODEL]);

/** A model from the user's own ChatGPT or Claude subscription, as their account lists it. */
export interface SubscriptionModel { id: string; name: string; note: string; isDefault?: boolean }
export type SubscriptionKind = 'codex' | 'claude';
const subCache: Partial<Record<SubscriptionKind, SubscriptionModel[]>> = {};
const subPending: Partial<Record<SubscriptionKind, Promise<SubscriptionModel[]>>> = {};
export function loadSubscriptionModels(kind: SubscriptionKind): Promise<SubscriptionModel[]> {
  if (subCache[kind]) return Promise.resolve(subCache[kind]!);
  return (subPending[kind] ??= fetch(`/api/subscription-models/${kind}`, { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : { models: [] }))
    .then((d: { models: SubscriptionModel[]; live: boolean }) => { if (d.live) subCache[kind] = d.models; return d.models ?? []; })
    .catch(() => [] as SubscriptionModel[])
    .finally(() => { delete subPending[kind]; }));
}
/** The live model list of one subscription; null while it loads. */
export function useSubscriptionModels(kind: SubscriptionKind | null) {
  const [list, setList] = useState<SubscriptionModel[] | null>(kind ? subCache[kind] ?? null : null);
  useEffect(() => { if (!kind) return; let on = true; setList(subCache[kind] ?? null); void loadSubscriptionModels(kind).then((m) => on && setList(m)); return () => { on = false; }; }, [kind]);
  return list;
}
/** "gpt-6-astra" → "GPT-6 Astra", "claude-fable-5-2" → "Fable 5.2", "opus" → "Opus". */
export function subscriptionModelName(kind: SubscriptionKind, id: string) {
  const known = subCache[kind]?.find((m) => m.id === id)?.name;
  if (known) return known;
  if (/^gpt-/i.test(id)) return id.replace(/^gpt-([\d.]+)-?/i, 'GPT-$1 ').replace(/\b([a-z])/g, (c) => c.toUpperCase()).trim();
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d))?/i.exec(id);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** What the bot runs on, as one label: an included model's name, or the user's own subscription (and its model). */
export function brainLabel(bot: { agentProvider?: string; model?: string }) {
  if (bot.agentProvider === 'openrouter') return modelName(bot.model);
  if (bot.agentProvider === 'claude' || bot.agentProvider === 'claude-code') return bot.model ? subscriptionModelName('claude', bot.model) : 'Claude Code';
  if (bot.agentProvider === 'xai') return 'Grok';
  if (bot.agentProvider === 'groq') return 'Groq';
  return bot.model ? subscriptionModelName('codex', bot.model) : 'ChatGPT';
}

const LOGOS: [string, string][] = [
  // Fino's own models get a simple spark mark (Badr's face already appears enough around the app).
  ['deepseek/', 'badr-spark'],
  ['z-ai/', 'badr-spark'],
  ['qwen/', 'badr-spark'],
  ['x-ai/', 'grok'],
  ['openai/', 'chatgpt'],
  ['anthropic/', 'claude'],
];
/** The logo of the company behind a model id, on the same white tile as the provider marks. */
export function ModelLogo({ model, dim = false }: { model: string; dim?: boolean }) {
  const file = LOGOS.find(([p]) => model.startsWith(p))?.[1] ?? 'chatgpt';
  return (
    <span className={`provider-logo provider-logo--${file}`} aria-hidden="true" style={dim ? { opacity: 0.45 } : undefined}>
      <img src={`/brands/${file}.svg`} width={20} height={20} alt="" />
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
