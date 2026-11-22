// Claude Code terminal: the user drives Anthropic's unmodified `claude` in a tmux session on their own
// computer and signs in there with their own Claude subscription (Anthropic's own sign-in flow).
// Claude Code bots use the same sign-in, so signing in once here is enough.
import { Hono } from 'hono';
import type { AuthVars } from './lib/auth.js';
import { PlanLimitError } from './plans.js';
import { asUser, claudeEnv, prepareClaude, q, runningComputer, tag, vmShell, CLAUDE } from './vm-claude.js';

export const claudeCodeApi = new Hono<AuthVars>();

const session = (userId: string) => `fino-cc-${tag(userId)}`;
const KEYS = new Set(['Enter', 'Escape', 'Up', 'Down', 'Left', 'Right', 'Tab', 'BTab', 'C-c', 'BSpace']);

claudeCodeApi.post('/start', async (c) => {
  const userId = c.get('user').id;
  let computerId: string;
  try {
    computerId = await prepareClaude(userId);
  } catch (e) {
    if (e instanceof PlanLimitError) return c.json({ error: e.message, code: 'plan_limit', feature: e.feature }, 402);
    return c.json({ error: (e as Error).message || 'The computer could not start. Please try again.' }, 503);
  }
  const s = q(session(userId));
  const r = await vmShell(
    computerId,
    asUser(`tmux has-session -t ${s} 2>/dev/null || tmux new-session -d -s ${s} -x 110 -y 40 -c $HOME/work ${q(`${claudeEnv(userId)} ${CLAUDE}`)}; echo OK`),
    30,
  ).catch(() => ({ ok: false, out: '' }));
  return /OK/.test(r.out) ? c.json({ ok: true }) : c.json({ error: 'Claude Code could not start.' }, 502);
});

claudeCodeApi.get('/screen', async (c) => {
  const userId = c.get('user').id;
  const computerId = runningComputer(userId);
  if (!computerId) return c.json({ running: false, text: '' });
  const r = await vmShell(computerId, asUser(`tmux capture-pane -p -J -S -200 -t ${q(session(userId))} 2>/dev/null || echo __NO_SESSION__`), 20).catch(() => ({ ok: false, out: '__NO_SESSION__' }));
  if (r.out.includes('__NO_SESSION__')) return c.json({ running: false, text: '' });
  return c.json({ running: true, text: r.out.replace(/\s+$/, '') });
});

/** Type text and/or press a key. Input is never logged. */
claudeCodeApi.post('/input', async (c) => {
  const userId = c.get('user').id;
  const { text, key } = await c.req.json<{ text?: string; key?: string }>().catch(() => ({}) as { text?: string; key?: string });
  if (key && !KEYS.has(key)) return c.json({ error: 'Unsupported key' }, 400);
  if (typeof text === 'string' && text.length > 8000) return c.json({ error: 'Send shorter text.' }, 400);
  const computerId = runningComputer(userId);
  if (!computerId) return c.json({ error: 'Start Claude Code first.' }, 409);
  const s = q(session(userId));
  const parts: string[] = [];
  if (text) parts.push(`tmux send-keys -t ${s} -l -- ${q(text)}`);
  if (key) parts.push(`tmux send-keys -t ${s} ${key}`);
  if (!parts.length) return c.json({ ok: true });
  const r = await vmShell(computerId, asUser(parts.join(' && ')), 20).catch(() => ({ ok: false, out: '' }));
  return r.ok ? c.json({ ok: true }) : c.json({ error: 'Claude Code is not running. Start it again.' }, 409);
});

claudeCodeApi.post('/stop', async (c) => {
  const userId = c.get('user').id;
  const computerId = runningComputer(userId);
  if (computerId) await vmShell(computerId, asUser(`tmux kill-session -t ${q(session(userId))} 2>/dev/null; true`), 20).catch(() => {});
  return c.json({ ok: true });
});
