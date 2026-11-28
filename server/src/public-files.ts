import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { db, now } from './db.js';
import { env } from './env.js';

/**
 * Temporary public links to a Bot's own pictures and videos, on Badr's own domain, so a connected app can fetch
 * them: Facebook and Instagram only post a photo they can download from a public address. A link is a long random
 * token, opens only that one file, and stops working after a day (the copy is then deleted). The Bot's rule against
 * uploading the owner's files to outside sharing sites stays as it is.
 */
db.exec(`CREATE TABLE IF NOT EXISTS public_files (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL, bot_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL,
  data BLOB NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
)`);
const TTL_MS = 24 * 3600_000;
export const PUBLIC_MEDIA: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime' };

/** Which kind of picture or video the bytes really are (by their first bytes, not the name). */
function sniff(data: Buffer): string | null {
  if (data[0] === 0x89 && data.subarray(1, 4).toString() === 'PNG') return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (data.subarray(0, 3).toString() === 'GIF') return 'image/gif';
  if (data.subarray(4, 8).toString() === 'ftyp') return data.subarray(8, 10).toString() === 'qt' ? 'video/quicktime' : 'video/mp4';
  return null;
}

export function makePublicLink(userId: string, botId: string, name: string, data: Buffer): { url: string; expires_at: string } {
  const mime = sniff(data);
  if (!mime) throw new Error('Only pictures (PNG, JPG, WebP, GIF) and videos (MP4, MOV) can get a public link.');
  const safe = name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'file';
  const token = randomBytes(24).toString('base64url');
  const expires = now() + TTL_MS;
  db.prepare('INSERT INTO public_files VALUES (?,?,?,?,?,?,?,?)').run(token, userId, botId, safe, mime, data, now(), expires);
  return { url: `${env.appUrl.replace(/\/$/, '')}/api/public-files/${token}/${encodeURIComponent(safe)}`, expires_at: new Date(expires).toISOString() };
}

export const publicFilesApi = new Hono();
publicFilesApi.get('/:token/:name?', (c) => {
  const row = db.prepare('SELECT mime, data, name FROM public_files WHERE token=? AND expires_at>?').get(c.req.param('token'), now()) as { mime: string; data: Uint8Array; name: string } | undefined;
  if (!row) return c.text('Not found', 404);
  c.header('Content-Type', row.mime);
  c.header('Content-Disposition', `inline; filename="${row.name}"`);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(Buffer.from(row.data));
});

setInterval(() => { try { db.prepare('DELETE FROM public_files WHERE expires_at<=?').run(now()); } catch { /* next time */ } }, 3600_000).unref();
