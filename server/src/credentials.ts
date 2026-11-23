import { usesServerResources } from './lib/owner.js';
// Bring-your-own model access. Each user connects their own AI account so their bots run on it:
//   • ChatGPT: "Sign in with ChatGPT" through the Codex CLI's device-code login, kept in a
//     per-user CODEX_HOME. Fino never sees the password or the OAuth tokens.
//   • API keys (OpenAI, Anthropic, xAI): stored encrypted (AES-256-GCM) and handed only to that
//     user's agent process.
import { Hono } from 'hono';
import { spawn, type ChildProcess } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, now } from './db.js';
import { env } from './env.js';
import type { AuthVars } from './lib/auth.js';

export type Provider = 'chatgpt' | 'openai' | 'anthropic' | 'xai' | 'openrouter' | 'groq';
const PROVIDERS: Provider[] = ['chatgpt', 'openai', 'anthropic', 'xai', 'openrouter', 'groq'];
const KEY_NAMES: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', xai: 'xAI', openrouter: 'OpenRouter', groq: 'Groq' };

db.exec(`CREATE TABLE IF NOT EXISTS user_credentials (
  user_id TEXT NOT NULL, provider TEXT NOT NULL, secret TEXT, hint TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, PRIMARY KEY (user_id, provider))`);

// ---------- encryption ----------
let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.CREDENTIALS_KEY;
  if (fromEnv && /^[a-f0-9]{64}$/i.test(fromEnv)) return (cachedKey = Buffer.from(fromEnv, 'hex'));
  const file = path.join(path.dirname(env.dbPath), 'credentials-key');
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  return (cachedKey = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex'));
}
function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
function open(sealed: string) {
  const [iv, tag, data] = sealed.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

// ---------- lookups used by the agent runtimes ----------
const safeId = (userId: string) => userId.replace(/[^\w-]/g, '_');
export const codexHomeFor = (userId: string) => path.join(os.homedir(), '.local', 'grokbot-runtime', 'codex-home', safeId(userId));

export function apiKeyFor(userId: string, provider: Exclude<Provider, 'chatgpt'>): string | null {
  const row = db.prepare('SELECT secret FROM user_credentials WHERE user_id=? AND provider=?').get(userId, provider) as { secret: string | null } | undefined;
  if (!row?.secret) return null;
  try {
    return open(row.secret);
  } catch {
    return null;
  }
}
/** The Codex home to run this user's ChatGPT/OpenAI bots in, or null to use the server's default login. */
export function codexHomeIfConnected(userId: string): string | null {
  const row = db.prepare("SELECT 1 FROM user_credentials WHERE user_id=? AND provider IN ('chatgpt','openai')").get(userId);
  return row ? codexHomeFor(userId) : null;
}
/** Whether this user may run on the server's own ChatGPT/Claude login. SHARED_MODEL_LOGIN=0 turns it off for everyone;
 *  on a public server only the owner gets it, so customers always use their own account. */
export const sharedLoginAllowed = (userId: string) => process.env.SHARED_MODEL_LOGIN !== '0' && usesServerResources(userId);

function runCodex(userId: string, args: string[], stdin?: string): Promise<{ code: number; out: string }> {
  const home = codexHomeFor(userId);
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  return new Promise((resolve) => {
    const p = spawn(env.codexBin, args, { env: { ...process.env, CODEX_HOME: home }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', () => resolve({ code: 1, out }));
    p.on('exit', (code) => resolve({ code: code ?? 1, out }));
    if (stdin !== undefined) p.stdin.end(stdin);
    else p.stdin.end();
  });
}

// ---------- ChatGPT device sign-in ----------
interface DeviceLogin {
  id: string;
  userId: string;
  proc: ChildProcess;
  url: string | null;
  code: string | null;
  state: 'pending' | 'connected' | 'failed' | 'expired';
  error?: string;
  startedAt: number;
}
const logins = new Map<string, DeviceLogin>();
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

function startDeviceLogin(userId: string): Promise<DeviceLogin> {
  for (const l of logins.values()) if (l.userId === userId && l.state === 'pending') l.proc.kill();
  const home = codexHomeFor(userId);
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const proc = spawn(env.codexBin, ['login', '--device-auth'], { env: { ...process.env, CODEX_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] });
  const login: DeviceLogin = { id: randomBytes(9).toString('hex'), userId, proc, url: null, code: null, state: 'pending', startedAt: now() };
  logins.set(login.id, login);
  let buf = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => (login.url && login.code ? resolve(login) : (proc.kill(), reject(new Error('ChatGPT sign-in did not start. Try again.')))), 20_000);
    const onData = (d: Buffer) => {
      buf += strip(String(d));
      login.url ??= /https:\/\/auth\.openai\.com\/\S+/.exec(buf)?.[0] ?? null;
      login.code ??= /\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/.exec(buf)?.[0] ?? null;
      if (login.url && login.code) {
        clearTimeout(timer);
        resolve(login);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (e) => {
      clearTimeout(timer);
      login.state = 'failed';
      reject(e);
    });
    proc.on('exit', (code) => {
      if (login.state !== 'pending') return;
      if (code === 0) {
        login.state = 'connected';
        db.prepare("DELETE FROM user_credentials WHERE user_id=? AND provider='openai'").run(userId); // same Codex home: ChatGPT sign-in replaces an OpenAI key
        db.prepare('INSERT OR REPLACE INTO user_credentials(user_id,provider,secret,hint,created_at) VALUES (?,?,NULL,?,?)').run(userId, 'chatgpt', 'ChatGPT account', now());
      } else {
        login.state = now() - login.startedAt > 14 * 60_000 ? 'expired' : 'failed';
        login.error = 'ChatGPT sign-in was not completed.';
      }
    });
    // Device codes expire after 15 minutes.
    setTimeout(() => login.state === 'pending' && proc.kill(), 15 * 60_000);
  });
}

// ---------- routes ----------
export const credentialsApi = new Hono<AuthVars>();

credentialsApi.get('/', (c) => {
  const userId = c.get('user').id;
  const rows = db.prepare('SELECT provider, hint, created_at FROM user_credentials WHERE user_id=?').all(userId) as { provider: Provider; hint: string; created_at: number }[];
  return c.json({
    credentials: PROVIDERS.map((p) => {
      const r = rows.find((x) => x.provider === p);
      return { provider: p, connected: !!r, hint: r?.hint ?? '', connectedAt: r?.created_at ?? null };
    }),
    sharedLogin: sharedLoginAllowed(userId),
  });
});

credentialsApi.post('/chatgpt/start', async (c) => {
  try {
    const l = await startDeviceLogin(c.get('user').id);
    return c.json({ loginId: l.id, url: l.url, code: l.code, expiresInSeconds: 15 * 60 });
  } catch (e) {
    return c.json({ error: (e as Error).message || 'ChatGPT sign-in is unavailable.' }, 502);
  }
});

credentialsApi.get('/chatgpt/status/:id', (c) => {
  const l = logins.get(c.req.param('id'));
  if (!l || l.userId !== c.get('user').id) return c.json({ error: 'not found' }, 404);
  return c.json({ state: l.state, error: l.error ?? null });
});

credentialsApi.put('/:provider', async (c) => {
  const userId = c.get('user').id;
  const provider = c.req.param('provider') as Provider;
  if (!['openai', 'anthropic', 'xai', 'openrouter', 'groq'].includes(provider)) return c.json({ error: 'Unknown provider' }, 400);
  const { apiKey } = await c.req.json<{ apiKey?: string }>().catch(() => ({ apiKey: '' }));
  const k = String(apiKey ?? '').trim();
  const shape = { openai: /^sk-[\w-]{20,}$/, anthropic: /^sk-ant-[\w-]{20,}$/, xai: /^xai-[\w-]{20,}$/, openrouter: /^sk-or-[\w-]{20,}$/, groq: /^gsk_[\w]{20,}$/ }[provider as 'openai'];
  if (!shape.test(k)) return c.json({ error: `That doesn't look like a valid ${KEY_NAMES[provider]} API key.` }, 400);
  if (provider === 'openai') {
    const r = await runCodex(userId, ['login', '--with-api-key'], k);
    if (r.code !== 0) return c.json({ error: 'Codex could not use this OpenAI key.' }, 400);
    db.prepare("DELETE FROM user_credentials WHERE user_id=? AND provider='chatgpt'").run(userId); // an API key replaces the ChatGPT sign-in
  }
  db.prepare('INSERT OR REPLACE INTO user_credentials(user_id,provider,secret,hint,created_at) VALUES (?,?,?,?,?)').run(userId, provider, seal(k), `•••• ${k.slice(-4)}`, now());
  return c.json({ ok: true });
});

credentialsApi.delete('/:provider', async (c) => {
  const userId = c.get('user').id;
  const provider = c.req.param('provider') as Provider;
  if (!PROVIDERS.includes(provider)) return c.json({ error: 'Unknown provider' }, 400);
  db.prepare('DELETE FROM user_credentials WHERE user_id=? AND provider=?').run(userId, provider);
  // ChatGPT and OpenAI share the user's Codex home; sign it out only when neither remains.
  if ((provider === 'chatgpt' || provider === 'openai') && !codexHomeIfConnected(userId)) await runCodex(userId, ['logout']);
  return c.json({ ok: true });
});
