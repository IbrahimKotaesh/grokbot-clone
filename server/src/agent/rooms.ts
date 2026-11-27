import { db, now } from '../db.js';
import { isPaused } from './rules.js';
import { newId } from '../lib/ids.js';
import { hub } from '../lib/hub.js';
import { appendRow } from '../store.js';
import { createChat } from '../chats.js';

/**
 * Group chats ("rooms"; Grok Bot: GrokBotAgent kind=ROOM, member_agent_ids, server turn-taking).
 * A room is a bot row with kind='room' and a members list. It never runs its own agent loop:
 * a user message is dispatched to the members who should answer (@mentioned ones, else all,
 * capped), each member runs its normal loop with the group context and replies into the room
 * with post_to_group.
 */

const MAX_RESPONDERS = 3;

export function initRooms() {
  for (const col of ["kind TEXT NOT NULL DEFAULT 'agent'", 'members TEXT']) {
    try { db.exec(`ALTER TABLE bots ADD COLUMN ${col}`); } catch { /* exists */ }
  }
  db.exec('CREATE TABLE IF NOT EXISTS room_threads(room_id TEXT NOT NULL, bot_id TEXT NOT NULL, generation INTEGER NOT NULL, PRIMARY KEY(room_id, bot_id))');
}

/**
 * What a member does for a group happens in its own hidden conversation for that group, so none of it shows up in
 * the member's private chat with the user, and the member keeps the thread of the group from one message to the next.
 */
function threadFor(roomId: string, botId: string, roomName: string): number {
  const row = db.prepare('SELECT generation FROM room_threads WHERE room_id=? AND bot_id=?').get(roomId, botId) as { generation: number } | undefined;
  if (row && db.prepare('SELECT 1 FROM bot_chats WHERE bot_id=? AND generation=?').get(botId, row.generation)) return row.generation;
  const chat = createChat(botId, `Group: ${roomName}`.slice(0, 80));
  db.prepare('INSERT OR REPLACE INTO room_threads(room_id, bot_id, generation) VALUES (?,?,?)').run(roomId, botId, chat.generation);
  return chat.generation;
}

/** Members asked to answer a group message, and since when: each answers once. */
const pending = new Map<string, number>();
const key = (roomId: string, botId: string) => `${roomId}:${botId}`;
const postedSince = (roomId: string, botId: string, since: number) =>
  !!db.prepare("SELECT 1 FROM rows WHERE bot_id=? AND kind='message' AND created_at>=? AND json_extract(body,'$.from.id')=? LIMIT 1").get(roomId, since, botId);

export const isRoom = (botId: string) => (db.prepare('SELECT kind FROM bots WHERE id=?').get(botId) as any)?.kind === 'room';

export function roomMembers(roomId: string): { id: string; name: string }[] {
  const r = db.prepare('SELECT members FROM bots WHERE id=?').get(roomId) as any;
  const ids: string[] = r?.members ? JSON.parse(r.members) : [];
  return ids.map((id) => db.prepare('SELECT id, name FROM bots WHERE id=?').get(id) as any).filter(Boolean);
}

export function createRoom(userId: string, name: string, memberIds: string[]) {
  const id = newId('room');
  db.prepare(
    `INSERT INTO bots(id,user_id,name,label,description,avatar_shape,avatar_color,kind,members,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,'room',?,?,?)`,
  ).run(id, userId, name.slice(0, 60), 'Group', `Group chat with ${memberIds.length} Bots`, 'cloud', 'gray', JSON.stringify(memberIds), now(), now());
  hub.emit(userId, { type: 'roster' });
  return id;
}

/** Called instead of the agent loop when the user posts in a room. */
export function dispatchRoomMessage(roomId: string, text: string, enqueue: (botId: string, t: any) => void, imageIds: string[] = [], fileIds: string[] = []) {
  const room = db.prepare('SELECT * FROM bots WHERE id=?').get(roomId) as any;
  const members = roomMembers(roomId);
  if (!members.length) {
    appendRow(roomId, 'notice', { type: 'notice', text: 'This group has no Bots yet.', tone: 'warn' });
    return;
  }
  const lower = text.toLowerCase();
  const mentioned = members.filter((m) => lower.includes(`@${m.name.trim().toLowerCase()}`));
  // Paused members sit the conversation out.
  const responders = (mentioned.length ? mentioned : members).filter((m) => !isPaused(m.id)).slice(0, MAX_RESPONDERS);
  const recent = (db.prepare("SELECT body FROM rows WHERE bot_id=? AND generation=? AND kind='message' ORDER BY seq DESC LIMIT 12").all(roomId, room.generation) as any[])
    .reverse()
    .map((r) => {
      const b = JSON.parse(r.body);
      return `${b.from?.name ?? (b.role === 'user' ? 'User' : 'Bot')}: ${String(b.text).slice(0, 600)}`;
    })
    .join('\n');
  const since = now();
  for (const m of responders) {
    pending.set(key(roomId, m.id), since);
    enqueue(m.id, {
      type: 'system',
      generation: threadFor(roomId, m.id, room.name),
      // When the member's turn ends: if it wrote a normal reply instead of posting, that reply goes to the group (once).
      afterTurn: () => finishRoomTurn(roomId, m.id, since),
      imageIds,fileIds,
      text:
        `[Group chat "${room.name}"] Members: ${members.map((x) => x.name).join(', ')}. ` +
        `${mentioned.length ? 'You were @mentioned.' : 'The user addressed the whole group.'}\n` +
        `Recent group messages:\n${recent}\n\n` +
        `Reply to the group by calling post_to_group with group_name "${room.name}" (use your tools first if the request needs real work). ` +
        `Post once. Keep it short and don't repeat what other Bots already said. If you have nothing to add, call stay_silent. ` +
        `Don't take actions that need the user's approval from the group: say in the group what you would do, and that they can ask you in your own chat.`,
    });
  }
}

export function postToRoom(fromBotId: string, roomName: string, text: string) {
  const from = db.prepare('SELECT id, user_id, name FROM bots WHERE id=?').get(fromBotId) as any;
  const room = db.prepare("SELECT * FROM bots WHERE user_id=? AND kind='room' AND lower(name)=lower(?)").get(from.user_id, roomName.trim()) as any;
  if (!room) return `No group named "${roomName}".`;
  const members: string[] = room.members ? JSON.parse(room.members) : [];
  if (!members.includes(fromBotId)) return `You're not a member of "${room.name}".`;
  const since = pending.get(key(room.id, fromBotId));
  if (since !== undefined && postedSince(room.id, fromBotId, since)) return 'You already replied in the group to this message. Do not post again.';
  appendRow(room.id, 'message', { type: 'message', role: 'assistant', text, from: { kind: 'bot', id: from.id, name: from.name } });
  db.prepare('UPDATE bots SET unread = unread + 1 WHERE id=?').run(room.id);
  return 'Posted to the group.';
}

/** After a member's group turn: if it never posted, its last written reply (if any) is posted to the group for it. */
export function finishRoomTurn(roomId: string, botId: string, since: number) {
  try {
    if (pending.get(key(roomId, botId)) !== since) return; // a newer group message took over
    if (postedSince(roomId, botId, since)) return;
    const thread = (db.prepare('SELECT generation FROM room_threads WHERE room_id=? AND bot_id=?').get(roomId, botId) as { generation: number } | undefined)?.generation;
    if (!thread) return;
    const last = db.prepare("SELECT body FROM rows WHERE bot_id=? AND generation=? AND kind='message' AND created_at>=? AND json_extract(body,'$.role')='assistant' ORDER BY seq DESC LIMIT 1").get(botId, thread, since) as { body: string } | undefined;
    const text = last ? String(JSON.parse(last.body).text ?? '').trim() : '';
    const room = db.prepare('SELECT name FROM bots WHERE id=?').get(roomId) as { name: string } | undefined;
    if (text && room) postToRoom(botId, room.name, text);
  } catch (e) { console.warn('[rooms] finishing a group turn failed', (e as Error).message); }
  finally { if (pending.get(key(roomId, botId)) === since) pending.delete(key(roomId, botId)); }
}
