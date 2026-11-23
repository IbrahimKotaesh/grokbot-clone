// Bots asking for a screen at the same moment, from two accounts on Fino's own server, must each get their own.
// Runs against the local Lima VM with a throwaway database; no model or paid API calls.
//   PUBLIC_SIGNUP=0 DB_PATH=$(mktemp -d)/t.db node --env-file=.env tests/screen-leases.mjs   (after npm run build; private server, so every account may use the machine)
import assert from 'node:assert/strict';
import { db } from '../server/dist/db.js';
import { createBot } from '../server/dist/bots.js';
import { initSubagents } from '../server/dist/agent/subagents.js';
import { screenFor } from '../server/dist/computer.js';
import { env } from '../server/dist/env.js';
initSubagents();
assert.equal(env.computerProvider, 'local', 'this test covers the shared local machine');
for (const id of ['alice', 'bob']) db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run(id, `${id}@example.com`, id, Date.now());
// Both accounts may use a computer in this test.
try { db.prepare("UPDATE users SET plan='pro'").run(); } catch { /* no plan column */ }
const bots = [
  createBot('alice', { name: 'A-Chief', isPrimary: true }), createBot('alice', { name: 'A-One' }), createBot('alice', { name: 'A-Two' }),
  createBot('bob', { name: 'B-Chief', isPrimary: true }),
];
const owners = ['alice', 'alice', 'alice', 'bob'];
const got = await Promise.all(bots.map((b, i) => screenFor(owners[i], b.id)));
const screens = got.map((g) => g.screenId);
assert.equal(new Set(screens).size, screens.length, `every bot got its own screen: ${screens.join(', ')}`);
const leases = db.prepare('SELECT screen_id FROM screens').all().map((r) => r.screen_id);
assert.equal(new Set(leases).size, leases.length, 'no screen is leased twice');
// Asking again returns the same screen.
assert.equal((await screenFor('alice', bots[1].id)).screenId, screens[1]);
console.log(`PASS: simultaneous screen requests from two accounts get separate screens (${screens.join(', ')}); repeat requests keep their screen`);
db.close(); process.exit(0);
