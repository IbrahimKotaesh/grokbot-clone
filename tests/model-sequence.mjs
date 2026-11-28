// The default model's sequence: free first, Badr 4.8 when the free model is out, Badr 5.1 once a message runs long,
// and back to free the next day. A model picked on purpose is untouched. Free steps show as their own line in Usage.
//   DB_PATH=:memory: node --env-file=.env tests/model-sequence.mjs
import assert from 'node:assert/strict';
const { db } = await import('../server/dist/db.js');
const hm = await import('../server/dist/hosted-models.js');
const { TurnMeter } = await import('../server/dist/usage-meter.js');
const { usageReport } = await import('../server/dist/usage-report.js');
const { FREE_MODEL, DEFAULT_HOSTED, STRONG_HOSTED, STEP_UP_AFTER, sequenceModel, freeFailed, freeAvailable, resetFreeRest, hostedChatModel } = hm;

const t = Date.now();
db.prepare("INSERT INTO users(id,email,name,created_at) VALUES ('u_seq','seq@example.test','S',?)").run(t);
db.prepare("INSERT INTO bots(id,user_id,name,created_at,updated_at) VALUES ('b_seq','u_seq','Badr',?,?)").run(t, t);

assert.ok(FREE_MODEL.endsWith(':free'), 'a free model is configured');
assert.equal(hostedChatModel('u_seq', DEFAULT_HOSTED), DEFAULT_HOSTED, 'the default stays the default');
assert.equal(hostedChatModel('u_seq', 'moonshotai/kimi-k2.7-code'), 'moonshotai/kimi-k2.7-code', 'a picked model is used as picked');

assert.equal(sequenceModel('u_seq', 0), FREE_MODEL, 'first step: free');
assert.equal(sequenceModel('u_seq', STEP_UP_AFTER - 1), FREE_MODEL);
assert.equal(sequenceModel('u_seq', STEP_UP_AFTER), STRONG_HOSTED, 'a long message steps up to Badr 5.1');

freeFailed(Object.assign(new Error('Rate limit exceeded: free-models-per-day'), { status: 429 }));
assert.equal(freeAvailable(), false);
assert.equal(sequenceModel('u_seq', 0), DEFAULT_HOSTED, 'free allowance used up: Badr 4.8');
resetFreeRest();
freeFailed(Object.assign(new Error('Provider returned error'), { status: 502 }));
assert.equal(sequenceModel('u_seq', 1), DEFAULT_HOSTED, 'free model down: Badr 4.8');
resetFreeRest();
assert.equal(sequenceModel('u_seq', 0), FREE_MODEL, 'after the rest, free again');

// Usage: free steps cost nothing and get their own line.
const m = new TurnMeter('u_seq', 'b_seq', 'openrouter', FREE_MODEL, { turnId: 'turn_f', startedAt: Date.now() - 5000 });
m.hosted = true; m.add({ input_tokens: 8000, output_tokens: 120, cost: 0 }); m.save();
const r = usageReport('u_seq', 'today');
const free = r.models.find((x) => x.label === 'Badr 4.8 (free)');
assert.ok(free, 'free work is listed');
assert.equal(free.cost, 0);
console.log('PASS: default model runs free first, falls back to Badr 4.8, steps up to Badr 5.1 on long messages; free work is its own line in Usage');
