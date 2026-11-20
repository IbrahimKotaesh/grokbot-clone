import {accessAllowed} from './access-code.js';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { env } from '../env.js';
import { db, now } from '../db.js';
import { token } from './ids.js';
import type { User } from '../types.js';

const COOKIE = 'grokbot_session';
const TTL_MS = 30 * 24 * 3600 * 1000;

export type AuthVars = { Variables: { user: User } };

export function createSession(c: Context, userId: string) {
  const t = token();
  db.prepare('INSERT INTO auth_sessions(token,user_id,created_at,expires_at) VALUES (?,?,?,?)').run(t, userId, now(), now() + TTL_MS);
  setCookie(c, COOKIE, t, { httpOnly: true, secure: env.appUrl.startsWith('https://'), sameSite: 'Lax', path: '/', maxAge: TTL_MS / 1000 });
}

export function destroySession(c: Context) {
  const t = getCookie(c, COOKIE);
  if (t) db.prepare('DELETE FROM auth_sessions WHERE token=?').run(t);
  deleteCookie(c, COOKIE, { path: '/' });
}

export function userFromToken(t: string | undefined): User | null {
  if (!t) return null;
  const r = db
    .prepare('SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?')
    .get(t, now()) as any;
  if (r && env.allowedEmails.length && !env.allowedEmails.includes(String(r.email).toLowerCase())) return null;
  return r ? { id: r.id, email: r.email, name: r.name, avatarUrl: r.avatar_url } : null;
}

export function userFromCookieHeader(cookieHeader: string | undefined): User | null {
  if(!accessAllowed(cookieHeader))return null;
  const m = cookieHeader?.split(/;\s*/).find((p) => p.startsWith(`${COOKIE}=`));
  return userFromToken(m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : undefined);
}

export const requireUser: MiddlewareHandler<AuthVars> = async (c, next) => {
  const u = accessAllowed(c.req.header('cookie'))?userFromToken(getCookie(c, COOKIE)):null;
  if (!u) return c.json({ error: 'unauthenticated' }, 401);
  c.set('user', u);
  await next();
};
