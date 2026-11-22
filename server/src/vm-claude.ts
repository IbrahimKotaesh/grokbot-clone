// Runs Anthropic's unmodified Claude Code on the user's own computer, as a regular (non-root) user,
// with a per-user config folder so each person's Claude sign-in stays separate. Fino never reads or
// stores those credentials; the `claude` binary keeps them in that folder like it would on a laptop.
import { db } from './db.js';
import { orgo } from './orgo.js';
import { ensureComputer } from './computer.js';

export const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
export const tag = (userId: string) => userId.replace(/[^\w]/g, '').slice(-10);
const USER = 'fino';
const HOME = `/home/${USER}`;
export const CLAUDE = `${HOME}/.local/bin/claude`;
export const configDir = (userId: string) => `${HOME}/claude/${tag(userId)}`;
export const botWorkspace = (botId: string) => `${HOME}/work/${botId.replace(/[^\w-]/g, '')}`;

/** Wrap a command so it runs as the regular user (Claude Code refuses to skip approvals as root). */
export const asUser = (cmd: string) => `su - ${USER} -s /bin/bash -c ${q(cmd)}`;

export async function vmShell(computerId: string, command: string, timeout = 120) {
  const r = await orgo.bash(computerId, undefined, command, timeout);
  return { ok: r.success !== false && (r.exit_code ?? 0) === 0, out: String(r.output ?? '') };
}

export function runningComputer(userId: string): string | null {
  const row = db.prepare("SELECT orgo_id FROM computers WHERE user_id=? AND status='running'").get(userId) as { orgo_id?: string } | undefined;
  return row?.orgo_id ?? null;
}

const ready = new Set<string>();
/** Wakes the computer (plan-gated) and makes sure the user account, tmux and Claude Code exist. */
export async function prepareClaude(userId: string): Promise<string> {
  const computerId = await ensureComputer(userId);
  if (ready.has(computerId + userId)) return computerId;
  const setup = [
    `id -u ${USER} >/dev/null 2>&1 || useradd -m -s /bin/bash ${USER}`,
    'command -v tmux >/dev/null || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tmux >/dev/null)',
    // Anthropic's official installer, run as the regular user.
    asUser(`test -x ${CLAUDE} || (curl -fsSL https://claude.ai/install.sh | bash >/dev/null 2>&1)`),
    asUser(`mkdir -p ${q(configDir(userId))} ${HOME}/work`),
    `test -x ${CLAUDE} && echo READY || echo NO_CLAUDE`,
  ].join(' && ');
  const r = await vmShell(computerId, setup, 300).catch((e) => ({ ok: false, out: String(e?.message ?? e) }));
  if (!/READY/.test(r.out)) throw new Error('Claude Code could not be installed on your computer. Check its internet connection and try again.');
  ready.add(computerId + userId);
  return computerId;
}

/** Environment for every Claude Code run of this user. */
export const claudeEnv = (userId: string) => `CLAUDE_CONFIG_DIR=${q(configDir(userId))} PATH="$HOME/.local/bin:$PATH"`;
