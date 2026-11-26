// Folders in the sidebar: the owner groups Bots by area ("YouTube team", "Accounting"). A Bot sits in one folder
// or none; deleting a folder keeps its Bots, they just go back to the main list.
import { randomUUID } from 'node:crypto';
import { db, now } from './db.js';
import { hub } from './lib/hub.js';

db.exec('CREATE TABLE IF NOT EXISTS bot_folders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)');
db.exec('CREATE INDEX IF NOT EXISTS bot_folders_user ON bot_folders(user_id, sort)');
if (!(db.prepare('PRAGMA table_info(bots)').all() as { name: string }[]).some((c) => c.name === 'folder_id')) db.exec('ALTER TABLE bots ADD COLUMN folder_id TEXT');

export interface BotFolder { id: string; name: string; sort: number }
const cleanName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
const changed = (userId: string) => hub.emit(userId, { type: 'roster' });

export const listFolders = (userId: string): BotFolder[] =>
  db.prepare('SELECT id, name, sort FROM bot_folders WHERE user_id=? ORDER BY sort, created_at').all(userId) as BotFolder[];

export function createFolder(userId: string, name: unknown): BotFolder {
  const n = cleanName(name);
  if (!n) throw new Error('Give the folder a name.');
  if (listFolders(userId).length >= 50) throw new Error('You can have up to 50 folders.');
  const sort = ((db.prepare('SELECT MAX(sort) AS m FROM bot_folders WHERE user_id=?').get(userId) as { m: number | null }).m ?? -1) + 1;
  const f = { id: `fld_${randomUUID().slice(0, 12)}`, name: n, sort };
  db.prepare('INSERT INTO bot_folders(id, user_id, name, sort, created_at) VALUES (?,?,?,?,?)').run(f.id, userId, n, sort, now());
  changed(userId);
  return f;
}

export function renameFolder(userId: string, id: string, name: unknown) {
  const n = cleanName(name);
  if (!n) throw new Error('Give the folder a name.');
  if (!db.prepare('UPDATE bot_folders SET name=? WHERE id=? AND user_id=?').run(n, id, userId).changes) throw new Error('Folder not found.');
  changed(userId);
}

export function deleteFolder(userId: string, id: string) {
  db.transaction(() => {
    db.prepare('UPDATE bots SET folder_id=NULL WHERE folder_id=? AND user_id=?').run(id, userId);
    db.prepare('DELETE FROM bot_folders WHERE id=? AND user_id=?').run(id, userId);
  })();
  changed(userId);
}

/** Puts a Bot in a folder (or back in the main list with null). */
export function moveBotToFolder(userId: string, botId: string, folderId: string | null) {
  if (folderId && !db.prepare('SELECT 1 FROM bot_folders WHERE id=? AND user_id=?').get(folderId, userId)) throw new Error('Folder not found.');
  if (!db.prepare("UPDATE bots SET folder_id=? WHERE id=? AND user_id=? AND is_primary=0 AND kind<>'room'").run(folderId, botId, userId).changes) throw new Error('That Bot can’t go in a folder.');
  changed(userId);
}
