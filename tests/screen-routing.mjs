// Screen steps on Fino's own key: a lone screenshot stays on DeepSeek (its cache already holds the conversation);
// three screen steps in a row move to the cheap vision model; trouble escalates back to the strong one.
//   DB_PATH=:memory: SESSION_SECRET=x node tests/screen-routing.mjs   (after npm run build)
import assert from 'node:assert/strict';
process.env.OWNER_EMAIL = 'owner@example.com'; // this test's account is a customer, not the server's owner
import '../server/dist/usage-meter.js';
import { db } from '../server/dist/db.js';
import { setPlan } from '../server/dist/plans.js';
db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run('pro','pro@example.com','Pro',Date.now()); setPlan('pro','pro');
import { newRoute, computerModel, COMPUTER_CHEAP, COMPUTER_STRONG } from '../server/dist/hosted-models.js';
const r = newRoute();
for (let i = 0; i < 6; i++) { r.screenRun++; assert.equal(computerModel('pro', r), COMPUTER_STRONG, 'every screen step stays on DeepSeek, sharing the warm cache'); }
// Near a usage limit (80% of the session), screen work moves to the cheap model; at the limit it stops and says when it comes back.
const { aiUsage } = await import('../server/dist/hosted-models.js');
const spend = (usd) => db.prepare("INSERT INTO model_usage(user_id,bot_id,provider,model,input_tokens,cached_tokens,output_tokens,model_calls,computer_steps,tool_calls,started_at,ended_at,kind,hosted,cost_usd) VALUES ('pro','b','openrouter','x',0,0,0,1,1,0,?,?,'computer',1,?)").run(Date.now(), Date.now(), usd);
const limit = aiUsage('pro').session.limit;
spend(limit * 0.85);
assert.equal(computerModel('pro', r), COMPUTER_CHEAP, 'near the limit: the cheap model');
spend(limit * 0.2);
assert.throws(() => computerModel('pro', r), (e) => e.code === 'usage_limit', 'at the limit: stops with when it comes back');
console.log('PASS: screen steps stay on DeepSeek with its warm cache; near a usage limit they move to the cheap model, and stop at it');
process.exit(0);
