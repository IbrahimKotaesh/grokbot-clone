// Approval rules in plain words, and pausing a Bot.
//   DB_PATH=:memory: node --env-file=.env tests/approval-rules.mjs
import assert from 'node:assert/strict';
const { db } = await import('../server/dist/db.js');
const rules = await import('../server/dist/agent/rules.js');
const { initRooms, createRoom, dispatchRoomMessage } = await import('../server/dist/agent/rooms.js');
initRooms();

const t = Date.now();
db.prepare("INSERT INTO users(id,email,name,created_at) VALUES ('u_r','rules@example.test','R',?)").run(t);
db.prepare("INSERT INTO users(id,email,name,created_at) VALUES ('u_x','other@example.test','X',?)").run(t);
const bot = (id, name, user = 'u_r') => db.prepare('INSERT INTO bots(id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)').run(id, user, name, t, t);
bot('b_nora', 'Nora'); bot('b_kai', 'Kai'); bot('b_other', 'Other', 'u_x');

// Adding rules: plain words, cleaned up, checked.
const email = rules.addRule('u_r', null, '  When Nora wants to   reply to an email ', 'ask');
assert.equal(email.action, 'reply to an email', 'the "When X wants to" lead-in and extra spaces are dropped');
const posts = rules.addRule('u_r', 'b_nora', 'post on social media', 'never');
const cal = rules.addRule('u_r', 'b_kai', 'add a calendar event', 'allow');
assert.throws(() => rules.addRule('u_r', null, '   ', 'ask'), /Describe the action/);
assert.throws(() => rules.addRule('u_r', null, 'x', 'maybe'), /Pick what/);
assert.throws(() => rules.addRule('u_r', 'b_other', 'x', 'ask'), /Bot not found/, "can't add a rule to someone else's Bot");
assert.deepEqual(rules.listRules('u_r', 'b_nora').map((r) => r.action), ['reply to an email', 'post on social media'], "a Bot sees its own rules and the ones for every Bot");
assert.deepEqual(rules.listRules('u_r', 'b_kai').map((r) => r.action), ['reply to an email', 'add a calendar event']);
assert.equal(rules.listRules('u_x').length, 0, "other people don't see them");

// Deciding: "never" beats "ask first" beats "do it".
let seen;
rules.setRuleMatcher(async (list, action) => { seen = action; return list.map((r, i) => (action.includes(r.action.split(' ')[0]) ? i + 1 : 0)).filter(Boolean); });
assert.equal(await rules.reviewAction('u_r', 'b_kai', 'look at the weather'), null, 'no rule applies');
assert.equal((await rules.reviewAction('u_r', 'b_nora', 'reply to Sam')).decision, 'ask');
assert.equal((await rules.reviewAction('u_r', 'b_kai', 'add Lunch at 1pm')).decision, 'allow');
assert.equal((await rules.reviewAction('u_r', 'b_nora', 'reply and post the news')).decision, 'never', 'never wins when several rules apply');
// The reviewer can't answer: be careful when any rule could say no.
rules.setRuleMatcher(async () => { throw new Error('down'); });
assert.equal((await rules.reviewAction('u_r', 'b_nora', 'anything')).decision, 'ask');
rules.updateRule('u_r', email.id, 'allow');
assert.equal(await rules.reviewAction('u_r', 'b_kai', 'anything'), null, 'only "do it" rules: nothing to be careful about');
assert.ok(rules.deleteRule('u_r', posts.id)); assert.ok(!rules.deleteRule('u_x', cal.id), "can't delete someone else's rule");
rules.setRuleMatcher(null);

// Pause: a paused member sits the group out.
const roomId = createRoom('u_r', 'Team', ['b_nora', 'b_kai']);
rules.setPaused('b_kai', true);
assert.ok(rules.isPaused('b_kai'));
const asked = [];
dispatchRoomMessage(roomId, 'Hi team', (id) => asked.push(id));
assert.deepEqual(asked, ['b_nora'], 'only the Bot that is not paused answers');
rules.setPaused('b_kai', false);
assert.ok(!rules.isPaused('b_kai'));

console.log('PASS: plain-words rules (never > ask > allow, careful when unsure), per-Bot and all-Bot rules, pause keeps a Bot quiet');
