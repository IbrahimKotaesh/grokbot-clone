// The models a user's own ChatGPT or Claude subscription offers, read live from Codex and Claude Code with
// that user's own sign-in, so the picker shows exactly what their plan includes (new models appear by themselves).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { env } from './env.js';
import { apiKeyFor, codexHomeIfConnected, sharedLoginAllowed } from './credentials.js';
import { claudeHomeIfConnected } from './claude-login.js';

export interface SubscriptionModel { id: string; name: string; note: string; isDefault?: boolean }
type Kind = 'codex' | 'claude';

// Shown when the live list can't be read (not signed in yet, or the CLI is slow).
const FALLBACK: Record<Kind, SubscriptionModel[]> = {
  codex: [
    { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', note: 'Latest workhorse model for everyday work.', isDefault: true },
    { id: 'gpt-6-astra', name: 'GPT-6 Astra', note: 'Frontier intelligence for the most demanding work.' },
    { id: 'gpt-6-luna', name: 'GPT-6 Luna', note: 'Fast and affordable model for easier tasks.' },
  ],
  claude: [
    { id: 'opus', name: 'Opus 5.5', note: 'For complex work and everyday tasks.', isDefault: true },
    { id: 'claude-fable-5-2', name: 'Fable 5.2', note: 'For your toughest challenges.' },
    { id: 'sonnet', name: 'Sonnet 5.5', note: 'Most efficient for simpler tasks.' },
    { id: 'haiku', name: 'Haiku 5.5', note: 'Fastest for quick answers.' },
  ],
};

const cache = new Map<string, { at: number; models: SubscriptionModel[] }>();
const TTL = 30 * 60_000;
const tidy = (s: string) => s.replace(/-(?=[A-Z])/g, ' ').trim();
const sentence = (s: string) => { const x = s.trim(); return x && !/[.!?]$/.test(x) ? `${x}.` : x; };

function codexModels(userId: string): Promise<SubscriptionModel[] | null> {
  const home = codexHomeIfConnected(userId) ?? (sharedLoginAllowed(userId) ? process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex') : null);
  if (!home) return Promise.resolve(null);
  return new Promise((resolve) => {
    const proc = spawn(env.codexBin, ['app-server'], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, CODEX_HOME: home } });
    const done = (v: SubscriptionModel[] | null) => { clearTimeout(timer); proc.kill(); resolve(v); };
    const timer = setTimeout(() => done(null), 15_000);
    proc.on('error', () => done(null));
    proc.stdin.on('error', () => {});
    createInterface({ input: proc.stdout }).on('line', (line) => {
      let m: any; try { m = JSON.parse(line); } catch { return; }
      if (m.id === 1) proc.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n' + JSON.stringify({ id: 2, method: 'model/list', params: {} }) + '\n');
      if (m.id === 2) done(Array.isArray(m.result?.data) ? m.result.data.filter((x: any) => !x.hidden).map((x: any) => ({ id: String(x.id), name: tidy(String(x.displayName ?? x.id)), note: sentence(String(x.description ?? '')), isDefault: !!x.isDefault })) : null);
    });
    proc.stdin.write(JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'badr', version: '1' } } }) + '\n');
  });
}

async function claudeModels(userId: string): Promise<SubscriptionModel[] | null> {
  const key = apiKeyFor(userId, 'anthropic');
  const home = key ? null : claudeHomeIfConnected(userId);
  if (!key && !home && !sharedLoginAllowed(userId)) return null;
  const childEnv = { ...process.env };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete childEnv[k];
  if (key) childEnv.ANTHROPIC_API_KEY = key;
  if (home) childEnv.CLAUDE_CONFIG_DIR = home;
  const controller = new AbortController();
  // No prompt is ever sent: the session only starts far enough to answer which models it offers.
  async function* idle() { await new Promise((r) => controller.signal.addEventListener('abort', r, { once: true })); }
  const q = query({ prompt: idle() as any, options: { pathToClaudeCodeExecutable: env.claudeBin, settingSources: [], tools: [], env: childEnv, abortController: controller, cwd: os.tmpdir() } });
  try {
    const list = await Promise.race([q.supportedModels(), new Promise<null>((r) => setTimeout(() => r(null), 20_000))]);
    if (!list) return null;
    const seen = new Set<string>();
    return list.filter((m) => m.value !== 'default').filter((m) => { const r = m.resolvedModel ?? m.value; if (seen.has(r)) return false; seen.add(r); return true; })
      .map((m, i) => ({ id: m.value, name: m.displayName, note: sentence(m.description ?? ''), isDefault: i === 0 }));
  } catch { return null; } finally { controller.abort(); q.close(); }
}

/** The models this user's subscription offers (live, cached half an hour), or a short fallback list. */
export async function subscriptionModels(userId: string, kind: Kind): Promise<{ models: SubscriptionModel[]; live: boolean }> {
  const k = `${userId}:${kind}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return { models: hit.models, live: true };
  const models = await (kind === 'codex' ? codexModels(userId) : claudeModels(userId)).catch(() => null);
  if (models?.length) { cache.set(k, { at: Date.now(), models }); return { models, live: true }; }
  return { models: FALLBACK[kind], live: false };
}
