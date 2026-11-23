// "Connect Claude": each customer signs in with their own Claude subscription through the official
// `claude auth login` flow. The CLI keeps the login in a per-user CLAUDE_CONFIG_DIR; Fino only passes
// the code the person copies from Claude's page and never reads or stores the tokens itself.
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, now } from './db.js';
import { env } from './env.js';

const exec = promisify(execFile);
const safeId = (userId: string) => userId.replace(/[^\w-]/g, '_');
export const claudeHomeFor = (userId: string) => path.join(os.homedir(), '.local', 'grokbot-runtime', 'claude-home', safeId(userId));
/** The Claude config folder to run this user's Claude bots in, or null when they haven't connected Claude. */
export function claudeHomeIfConnected(userId: string): string | null {
  return db.prepare("SELECT 1 FROM user_credentials WHERE user_id=? AND provider='claude'").get(userId) ? claudeHomeFor(userId) : null;
}

function cliEnv(home: string) {
  const e: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CONFIG_DIR: home, BROWSER: 'true' };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) delete e[k];
  return e;
}

interface ClaudeLogin { id: string; userId: string; proc: ChildProcess; url: string; startedAt: number; exited: Promise<number> }
const logins = new Map<string, ClaudeLogin>();

export function startClaudeLogin(userId: string): Promise<{ id: string; url: string }> {
  for (const l of logins.values()) if (l.userId === userId) { l.proc.kill(); logins.delete(l.id); }
  const home = claudeHomeFor(userId);
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const proc = spawn(env.claudeBin, ['auth', 'login', '--claudeai'], { env: cliEnv(home), stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = new Promise<number>((res) => { proc.on('exit', (c) => res(c ?? 1)); proc.on('error', () => res(1)); });
  let buf = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Claude sign-in did not start. Try again.')); }, 20_000);
    const onData = (d: Buffer) => {
      buf += String(d).replace(/\x1b\[[0-9;]*m/g, '');
      const url = /https:\/\/\S+\/oauth\/authorize\?\S+/.exec(buf)?.[0];
      if (!url) return;
      clearTimeout(timer);
      const login: ClaudeLogin = { id: randomBytes(9).toString('hex'), userId, proc, url, startedAt: now(), exited };
      logins.set(login.id, login);
      // The page's code is short-lived; give up after 15 minutes.
      setTimeout(() => { if (logins.get(login.id) === login) { proc.kill(); logins.delete(login.id); } }, 15 * 60_000);
      resolve({ id: login.id, url });
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    void exited.then(() => { clearTimeout(timer); if (!buf.includes('oauth/authorize')) reject(new Error('Claude sign-in is unavailable right now.')); });
  });
}

/** Signed in with a Claude subscription in this folder? */
async function claudeConnected(home: string) {
  try {
    const { stdout } = await exec(env.claudeBin, ['auth', 'status'], { env: cliEnv(home), timeout: 15_000 });
    const s = JSON.parse(stdout);
    return s.loggedIn === true && s.authMethod === 'claude.ai';
  } catch { return false; }
}

export async function finishClaudeLogin(userId: string, id: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const login = logins.get(id);
  if (!login || login.userId !== userId) return { ok: false, error: 'This sign-in expired. Choose Connect again.' };
  const clean = code.trim();
  if (!/^[\w#.~-]{10,600}$/.test(clean)) return { ok: false, error: 'That code doesn’t look right. Copy the whole code from the Claude page.' };
  login.proc.stdin?.write(clean + '\n');
  login.proc.stdin?.end();
  const code_ = await Promise.race([login.exited, new Promise<number>((r) => setTimeout(() => r(-1), 30_000))]);
  logins.delete(id);
  if (code_ === -1) login.proc.kill();
  if (!(await claudeConnected(claudeHomeFor(userId)))) return { ok: false, error: 'Claude didn’t accept that code. Choose Connect to get a fresh one.' };
  db.prepare('INSERT OR REPLACE INTO user_credentials(user_id,provider,secret,hint,created_at) VALUES (?,?,NULL,?,?)').run(userId, 'claude', 'Claude subscription', now());
  return { ok: true };
}

export function forgetClaudeLogin(userId: string) {
  fs.rmSync(claudeHomeFor(userId), { recursive: true, force: true });
}
