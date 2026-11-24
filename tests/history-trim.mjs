// Old tool results are shortened in the model's history; the current and previous requests keep theirs in full.
//   DB_PATH=:memory: SESSION_SECRET=x node tests/history-trim.mjs   (after npm run build)
import assert from 'node:assert/strict';
import { trimOldToolOutputs } from '../server/dist/agent/loop.js';
const page = 'x'.repeat(12000);
const turn = (n) => [{ role: 'user', content: `ask ${n}` }, { type: 'function_call', call_id: `c${n}`, name: 'read_page', arguments: '{}' }, { type: 'function_call_output', call_id: `c${n}`, output: page }, { role: 'assistant', content: 'done' }];
const items = [...turn(1), ...turn(2), ...turn(3)];
const out = trimOldToolOutputs(items);
assert.ok(out[2].output.length < 1400 && out[2].output.includes('older result shortened'), 'the oldest request is shortened');
assert.equal(out[6].output, page, 'the previous request keeps its full result');
assert.equal(out[10].output, page, 'the current request keeps its full result');
assert.equal(items[2].output, page, 'the stored history itself is untouched');
assert.deepEqual(trimOldToolOutputs(items), out, 'same input, same output: the prompt cache keeps hitting within a turn');
assert.deepEqual(trimOldToolOutputs(turn(1)), turn(1), 'a short chat is left alone');
console.log('PASS: old tool results shortened, recent ones kept whole, deterministic for the cache');
process.exit(0);
