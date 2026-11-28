// Each plan's monthly call minutes are enforced: a call may only run as long as what's left, it is refused once
// they are used up, the trial day has its own few, and the server's owner has no limit. Badr's relay ends the call
// at the limit with close code 4001.   DB_PATH=:memory: node --env-file=.env tests/voice-minutes.mjs
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
process.env.OWNER_EMAIL = 'owner@example.com';
process.env.OPENROUTER_API_KEY ||= 'test';
const { db } = await import('../server/dist/db.js');
const { api } = await import('../server/dist/routes.js');
const plans = await import('../server/dist/plans.js');
const { OpenAIVoiceCall } = await import('../server/dist/openai-voice.js');
const { Hono } = await import('hono');
const app = new Hono().route('/api', api);
const user = (id, email) => {
  db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run(id, email, id, Date.now());
  db.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(`s_${id}`, id, Date.now(), Date.now() + 3600e3);
  db.prepare("INSERT INTO bots(id,user_id,name,created_at,updated_at) VALUES (?,?,'Badr',?,?)").run(`b_${id}`, id, Date.now(), Date.now());
};
const call = (id) => app.request('/api/voice/session', { method: 'POST', headers: { Cookie: `grokbot_session=s_${id}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: `b_${id}` }) });
const used = (id, minutes) => db.prepare('INSERT INTO voice_usage(call_id,user_id,started_at,ended_at) VALUES (?,?,?,?)').run(`c_${id}_${Math.random()}`, id, Date.now() - minutes * 60_000 - 1000, Date.now() - 1000);

user('owner', 'owner@example.com');
user('free', 'free@example.com');
user('pro', 'pro@example.com'); plans.setPlan('pro', 'pro');
user('trial', 'trial@example.com'); plans.setPlan('trial', 'pro'); db.prepare('UPDATE users SET plan_trial_until=? WHERE id=?').run(Date.now() + 86400e3, 'trial');

// Free: 10 minutes. A call may run for what's left; at the limit it is refused.
let r = await call('free'); assert.equal(r.status, 200); let j = await r.json();
assert.ok(j.maxSeconds <= 600 && j.maxSeconds > 590, `a fresh Free account gets its 10 minutes (${j.maxSeconds}s)`);
await app.request('/api/voice/end', { method: 'POST', headers: { Cookie: 'grokbot_session=s_free', 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: 'b_free', callId: j.callId }) });
used('free', 9);
j = await (await call('free')).json(); assert.ok(j.maxSeconds <= 60 && j.maxSeconds > 40, `after 9 minutes about one is left (${j.maxSeconds}s)`);
plans.recordCallEnd(j.callId);
used('free', 1);
r = await call('free'); assert.equal(r.status, 402, 'used up: no new call');
j = await r.json(); assert.equal(j.code, 'plan_limit'); assert.equal(j.feature, 'voice'); assert.match(j.error, /call minutes/);

// Pro: 120 minutes; the trial day: 5; the owner: no limit.
j = await (await call('pro')).json(); assert.ok(j.maxSeconds > 119 * 60, 'Pro gets 120 minutes');
j = await (await call('trial')).json(); assert.ok(j.maxSeconds <= 300 && j.maxSeconds > 290, 'the trial day gets 5 minutes');
used('owner', 900);
j = await (await call('owner')).json(); assert.equal(j.maxSeconds, null, 'the server owner has no limit');

// A call that is still open counts while it runs; Usage reports the minutes.
assert.ok(plans.voiceMinutesLeft('pro').used <= 1);
assert.equal(plans.voiceMinutesLeft('free').secondsLeft, 0);

// The relay ends the call at the limit with 4001, and the call stops counting when the line closes.
class FakeWs extends EventEmitter { readyState = 1; sent = []; closed = null; send(s) { this.sent.push(JSON.parse(s)); } close(code, reason) { this.closed = { code, reason }; this.readyState = 3; this.emit('close'); } }
plans.recordCallStart('pro', 'c_live');
const ws = new FakeWs();
new OpenAIVoiceCall(ws, 'pro', 'b_pro', undefined, { callId: 'c_live', maxMs: 150 });
await new Promise((res) => setTimeout(res, 300));
assert.equal(ws.closed?.code, 4001, 'the relay closes with the limit code');
assert.match(ws.closed.reason, /call minutes/);
assert.ok(db.prepare("SELECT ended_at FROM voice_usage WHERE call_id='c_live'").get().ended_at, 'and the call is closed in the count');
console.log('PASS: calls run only on the minutes left, are refused when used up, trial 5 min, owner unlimited, relay ends at the limit');
process.exit(0);
