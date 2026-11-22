// Account deletion (required by App Store guideline 5.1.1(v)): removes everything tied to the user.
import { Hono } from 'hono';
import fs from 'node:fs';
import { db } from './db.js';
import type { AuthVars } from './lib/auth.js';
import { unscheduleRoutine } from './routines.js';
import { suspendComputer } from './computer.js';
import { codexHomeFor } from './credentials.js';

export const accountApi = new Hono<AuthVars>();

if (!(db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).some((c) => c.name === 'auto_approve'))
  db.exec('ALTER TABLE users ADD COLUMN auto_approve INTEGER NOT NULL DEFAULT 0');

/** "Don't ask for approval": the user's bots act without asking (suspicious content still asks). */
accountApi.get('/approvals', (c) => {
  const row = db.prepare('SELECT auto_approve FROM users WHERE id=?').get(c.get('user').id) as { auto_approve?: number } | undefined;
  return c.json({ autoApprove: !!row?.auto_approve });
});
accountApi.put('/approvals', async (c) => {
  const body = await c.req.json<{ autoApprove?: boolean }>().catch(() => ({}) as { autoApprove?: boolean });
  if (typeof body.autoApprove !== 'boolean') return c.json({ error: 'autoApprove must be true or false.' }, 400);
  db.prepare('UPDATE users SET auto_approve=? WHERE id=?').run(body.autoApprove ? 1 : 0, c.get('user').id);
  return c.json({ autoApprove: body.autoApprove });
});

accountApi.delete('/', async (c) => {
  const userId = c.get('user').id;
  const { confirm } = await c.req.json<{ confirm?: string }>().catch(() => ({ confirm: '' }));
  if (confirm !== 'DELETE') return c.json({ error: 'Confirm account deletion.' }, 400);

  const botIds = (db.prepare('SELECT id FROM bots WHERE user_id=?').all(userId) as { id: string }[]).map((b) => b.id);
  for (const id of botIds)
    for (const r of db.prepare('SELECT id FROM routines WHERE bot_id=?').all(id) as { id: string }[]) unscheduleRoutine(r.id);
  // Stop the cloud computer before its records disappear.
  await suspendComputer(userId, 'account-deleted').catch(() => {});

  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
  const cols = (t: string) => (db.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[]).map((c) => c.name);
  db.transaction(() => {
    for (const t of tables) {
      if (t === 'users' || t === 'bots') continue;
      const has = cols(t);
      if (has.includes('bot_id') && botIds.length) db.prepare(`DELETE FROM "${t}" WHERE bot_id IN (${botIds.map(() => '?').join(',')})`).run(...botIds);
      if (has.includes('user_id')) db.prepare(`DELETE FROM "${t}" WHERE user_id=?`).run(userId);
    }
    db.prepare('DELETE FROM bots WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  })();
  // The user's own ChatGPT/OpenAI sign-in folder.
  fs.rmSync(codexHomeFor(userId), { recursive: true, force: true });
  return c.json({ ok: true });
});
