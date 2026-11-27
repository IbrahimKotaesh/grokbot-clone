// Usage: a message that takes several model calls counts once, its working time runs first call → last,
// and Claude subscription work shows up next to Badr's own models.
//   DB_PATH=:memory: node --env-file=.env tests/usage-report.mjs
import assert from 'node:assert/strict';
const { db } = await import('../server/dist/db.js');
await import('../server/dist/usage-meter.js');
const { TurnMeter } = await import('../server/dist/usage-meter.js');
const { usageReport } = await import('../server/dist/usage-report.js');

const t = Date.now();
db.prepare("INSERT INTO users(id,email,name,created_at) VALUES ('u_use','use@example.test','U',?)").run(t);
db.prepare("INSERT INTO bots(id,user_id,name,created_at,updated_at) VALUES ('b_k','u_use','Karim',?,?)").run(t, t);
const call = (turnId, startedAgoS, provider = 'openrouter', model = 'deepseek/deepseek-v4.1-flash') => {
  const m = new TurnMeter('u_use', 'b_k', provider, model, { turnId, startedAt: Date.now() - startedAgoS * 1000 });
  m.hosted = provider === 'openrouter';
  if (provider === 'openrouter') m.add({ input_tokens: 1000, output_tokens: 100 }); else m.setTotals(5000, 1000, 400, 3);
  m.save();
};
// Message 1: three model calls over 90 seconds. Message 2: Claude, one result.
call('turn_a', 90); call('turn_a', 50); call('turn_a', 10);
call('turn_b', 30, 'claude', 'claude-sonnet-5-5');

const r = usageReport('u_use', 'today');
assert.equal(r.totals.turns, 2, 'two messages, not four model calls');
assert.equal(r.totals.tokens, 3 * 1100 + 5400);
assert.ok(r.totals.busyMinutes >= 1.4 && r.totals.busyMinutes <= 2.1, `working time ${r.totals.busyMinutes} min: 90 s + 30 s`);
const labels = Object.fromEntries(r.models.map((m) => [m.label, m.turns]));
assert.equal(labels['Claude (your subscription)'], 1, 'Claude work is counted');
assert.equal(r.bots[0].turns, 2);
assert.ok(r.totals.cost > 0, 'Claude priced at list price as an estimate');
console.log('PASS: usage counts messages (not model calls), real working time, Claude subscription work included');
