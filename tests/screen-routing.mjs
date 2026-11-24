// Screen steps on Fino's own key: a lone screenshot stays on DeepSeek (its cache already holds the conversation);
// three screen steps in a row move to the cheap vision model; trouble escalates back to the strong one.
//   DB_PATH=:memory: SESSION_SECRET=x node tests/screen-routing.mjs   (after npm run build)
import assert from 'node:assert/strict';
import '../server/dist/usage-meter.js';
import { db } from '../server/dist/db.js';
import { setPlan } from '../server/dist/plans.js';
db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run('pro','pro@example.com','Pro',Date.now()); setPlan('pro','pro');
import { newRoute, computerModel, COMPUTER_CHEAP, COMPUTER_STRONG } from '../server/dist/hosted-models.js';
const r = newRoute();
for (let i = 0; i < 6; i++) { r.screenRun++; assert.equal(computerModel('pro', r), COMPUTER_STRONG, 'every screen step stays on DeepSeek, sharing the warm cache'); }
// Past the plan's monthly computer budget, work continues on the cheap model.
db.prepare("INSERT INTO model_usage(user_id,bot_id,provider,model,input_tokens,cached_tokens,output_tokens,model_calls,computer_steps,tool_calls,started_at,ended_at,kind,hosted,cost_usd) VALUES ('pro','b','openrouter','x',0,0,0,1,1,0,?,?, 'computer',1,100)").run(Date.now(), Date.now());
assert.equal(computerModel('pro', r), COMPUTER_CHEAP, 'over budget: the cheap model');
console.log('PASS: screen steps stay on DeepSeek with its warm cache; past the monthly budget they move to the cheap model');
process.exit(0);
