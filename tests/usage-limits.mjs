// Badr's own AI is limited per day, week and month (Starter $12 a month, a week ~30% of it, a day a third of a
// week); past a limit a step stops with when it comes back. The server owner has no limit.
//   DB_PATH=:memory: node --env-file=.env tests/usage-limits.mjs
import assert from 'node:assert/strict';
process.env.OWNER_EMAIL = 'owner@example.com';
const { db } = await import('../server/dist/db.js');
await import('../server/dist/routes.js');
const plans = await import('../server/dist/plans.js');
const hm = await import('../server/dist/hosted-models.js');
const user = (id, email) => db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run(id, email, id, Date.now());
user('owner', 'owner@example.com'); user('s', 's@example.com'); plans.setPlan('s', 'starter');
assert.equal(plans.PLANS.starter.priceUsd, 29.99); assert.equal(plans.PLANS.pro.priceUsd, 49.99);
assert.equal(plans.PLANS.max.priceUsd, 99.99); assert.equal(plans.PLANS.ultra.priceUsd, 199.99);
const spend = (id, usd, model = 'deepseek/deepseek-v4.1-flash') => db.prepare("INSERT INTO model_usage (user_id,bot_id,provider,model,input_tokens,cached_tokens,output_tokens,model_calls,computer_steps,tool_calls,started_at,ended_at,kind,hosted,cost_usd,turn_id) VALUES (?,?,?,?,0,0,0,1,0,0,?,?,'chat',1,?,NULL)").run(id, 'b', 'openrouter', model, Date.now(), Date.now(), usd);
const u0 = hm.aiUsage('s');
assert.equal(u0.month.limit, 12); assert.ok(Math.abs(u0.week.limit - 12 * 1.3 / 4.3) < 1e-9); assert.ok(Math.abs(u0.day.limit - u0.week.limit / 3) < 1e-9);
hm.assertAiAllowed('s');
spend('s', u0.day.limit * 0.85);
assert.equal(hm.hostedChatModel('s', 'deepseek/deepseek-v4-pro'), hm.DEFAULT_HOSTED, 'near the limit the strongest model gives way');
spend('s', u0.day.limit * 0.2);
assert.throws(() => hm.assertAiAllowed('s'), (e) => e.status === 402 && e.code === 'usage_limit' && e.window === 'day' && /today's included AI. It comes back in \d+ h/.test(e.message));
spend('s', 50, 'openai/gpt-audio');
assert.ok(hm.aiUsage('s').month.used < 12, 'calls have their own minutes and do not count here');
spend('owner', 500); assert.equal(hm.aiUsage('owner'), null); hm.assertAiAllowed('owner');
const lim = hm.hostedSummary('s').limits; assert.ok(lim.day.pct >= 100 && lim.month.pct < 100 && lim.week.resetsAt > Date.now());
console.log('PASS: plans $29.99/$49.99/$99.99/$199.99; Badr AI limited per day, week and month with when it comes back; calls separate; owner unlimited');
process.exit(0);
