// Stop takes effect at once: a slow step is no longer waited for.
//   node tests/stop-now.mjs
import assert from 'node:assert/strict';
const { raceAbort } = await import('../server/dist/lib/abort.js');

const slow = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
assert.equal(await raceAbort(slow(10, 'done')), 'done', 'no signal: just waits');
const ok = new AbortController();
assert.equal(await raceAbort(slow(10, 'done'), ok.signal), 'done', 'not stopped: the result comes through');

const ctrl = new AbortController();
const t0 = Date.now();
setTimeout(() => ctrl.abort(), 30);
await assert.rejects(raceAbort(slow(5000, 'late'), ctrl.signal), /Stopped/);
assert.ok(Date.now() - t0 < 500, `stopped in ${Date.now() - t0} ms, not after the 5 s step`);
await assert.rejects(raceAbort(slow(10, 'x'), ctrl.signal), /Stopped/, 'already stopped: nothing new starts');
await assert.rejects(raceAbort(Promise.reject(new Error('boom')), ok.signal), /boom/, 'real errors still come through');
console.log('PASS: Stop ends a running step at once');
