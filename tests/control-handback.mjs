// Take control: a Bot that stopped because the owner took the computer carries on the moment the owner writes to it
// ("go ahead"), without waiting for "I'm done"; its own message carries the work, so no extra hand-back notice.
//   DB_PATH=:memory: node --env-file=.env tests/control-handback.mjs
import assert from 'node:assert/strict'; import { EventEmitter } from 'node:events';
const vnc = await import('../server/dist/vnc.js');
const { hub } = await import('../server/dist/lib/hub.js');
class Screen extends EventEmitter { closedWith = null; close(code) { this.closedWith = code; this.emit('close', code); } }
const resumed = []; vnc.onHandback((_u, b) => resumed.push(b));
const events = []; const off = hub.subscribe?.('u1', (e) => events.push(e));

const screen = new Screen(); vnc.holdControl('u1', screen);
assert.equal(vnc.userInControl('u1'), true, 'the owner holds the computer');
vnc.noteWaitingForHandback('u1', 'kamel'); vnc.noteWaitingForHandback('u1', 'lina');
// The owner writes "go ahead" to Kamel.
assert.equal(vnc.releaseControl('u1', 'kamel'), true);
assert.equal(vnc.userInControl('u1'), false, 'the computer is free at once, before the page closes its connection');
assert.deepEqual(resumed, ['lina'], 'Kamel goes on from the message itself; another waiting Bot gets the usual hand-back');
await new Promise((r) => setTimeout(r, 500));
assert.equal(screen.closedWith, 1000, 'the control connection closes, so the screen goes back to watching');
assert.deepEqual(resumed, ['lina'], 'and closing it does not hand back a second time');
assert.equal(vnc.releaseControl('u1', 'kamel'), false, 'nothing to release when nobody holds the computer');

// "I'm done" still works as before.
const again = new Screen(); vnc.holdControl('u1', again); vnc.noteWaitingForHandback('u1', 'kamel');
again.close(1000);
assert.equal(vnc.userInControl('u1'), false); assert.deepEqual(resumed, ['lina', 'kamel'], '"I\'m done" hands back as before');
off?.();
console.log('PASS: writing to a waiting Bot hands the computer back at once, once; "I\'m done" still works');
process.exit(0);
