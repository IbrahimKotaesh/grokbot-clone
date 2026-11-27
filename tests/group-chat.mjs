// Group chats: a member works in its own hidden thread for the group (nothing lands in its private chat), posts to
// the group once per message, and a normal reply it wrote instead of posting is delivered to the group for it.
//   DB_PATH=:memory: node --env-file=.env tests/group-chat.mjs
import assert from 'node:assert/strict';
const { db } = await import('../server/dist/db.js');
const { initRooms, createRoom, dispatchRoomMessage, postToRoom } = await import('../server/dist/agent/rooms.js');
const { appendRow } = await import('../server/dist/store.js');
const { inChat } = await import('../server/dist/chats.js').catch(() => ({}));
initRooms();

const t = Date.now();
db.prepare("INSERT INTO users(id,email,name,created_at) VALUES ('u_g','group@example.test','G',?)").run(t);
const bot = (id, name) => db.prepare("INSERT INTO bots(id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)").run(id, 'u_g', name, t, t);
bot('b_nora', 'Nora'); bot('b_kai', 'Kai');
const roomId = createRoom('u_g', 'Launch team', ['b_nora', 'b_kai']);
const mainGen = (id) => db.prepare('SELECT generation FROM bots WHERE id=?').get(id).generation;
const roomMsgs = () => db.prepare("SELECT body FROM rows WHERE bot_id=? AND kind='message' ORDER BY seq").all(roomId).map((r) => JSON.parse(r.body));

const queued = [];
dispatchRoomMessage(roomId, 'Plan the launch', (botId, trig) => queued.push({ botId, trig }));
assert.equal(queued.length, 2, 'both members are asked');
for (const q of queued) {
  assert.notEqual(q.trig.generation, mainGen(q.botId), 'group work goes to a hidden thread, not the private chat');
  assert.equal(typeof q.trig.afterTurn, 'function');
}

// Nora posts with the tool, then tries again: only the first one lands.
assert.equal(postToRoom('b_nora', 'Launch team', 'I will draft the budget.'), 'Posted to the group.');
assert.match(postToRoom('b_nora', 'Launch team', 'Also, the budget!'), /already replied/);
queued.find((q) => q.botId === 'b_nora').trig.afterTurn();

// Kai forgets the tool and writes a normal reply in its thread: it's delivered to the group once.
const kai = queued.find((q) => q.botId === 'b_kai');
const write = () => appendRow('b_kai', 'message', { type: 'message', role: 'assistant', text: 'I can book the venue.' });
if (inChat) inChat('b_kai', kai.trig.generation, write); else db.prepare("INSERT INTO rows(bot_id,generation,seq,updated_seq,kind,body,created_at) VALUES ('b_kai',?,9999,9999,'message',?,?)").run(kai.trig.generation, JSON.stringify({ type: 'message', role: 'assistant', text: 'I can book the venue.' }), Date.now());
kai.trig.afterTurn();
kai.trig.afterTurn();

const msgs = roomMsgs();
assert.deepEqual(msgs.map((m) => `${m.from?.name}: ${m.text}`), ['Nora: I will draft the budget.', 'Kai: I can book the venue.'], 'one reply each, in the group');
// Nothing from the group reached the members' private chats.
for (const id of ['b_nora', 'b_kai']) assert.equal(db.prepare("SELECT COUNT(*) n FROM rows WHERE bot_id=? AND generation=?").get(id, mainGen(id)).n, 0, `${id}'s private chat stays empty`);

console.log('PASS: group work in a hidden thread, one post per member per message, unposted replies delivered once');
