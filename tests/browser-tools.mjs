// In-page browser tools on the bot's real Chrome (local Lima VM): read a page as numbered elements, fill a whole
// form (text, select, checkbox, file upload) in one step, click, run a script; and the employee rules still
// stop card numbers and wait for the owner on final buttons. Throwaway database; no model calls.
//   PUBLIC_SIGNUP=0 DB_PATH=$(mktemp -d)/t.db node --env-file=.env tests/browser-tools.mjs   (after npm run build)
import assert from 'node:assert/strict';
import { db } from '../server/dist/db.js';
import { createBot } from '../server/dist/bots.js';
import { initSubagents } from '../server/dist/agent/subagents.js';
import { toolMap } from '../server/dist/agent/tools.js';
import { employeeGuard } from '../server/dist/agent/employee-rules.js';
initSubagents();
db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run('web', 'web@example.com', 'Web', Date.now());
try { db.prepare("UPDATE users SET plan='pro'").run(); } catch {}
const bot = createBot('web', { name: 'Surfer', isPrimary: true });
const ctx = { userId: 'web', botId: bot.id, depth: 0, enqueueBotMessage() {} };
const run = async (name, args) => {
  const t0 = Date.now();
  const r = await toolMap.get(name).impl(args, ctx);
  console.log(`  ${name}: ${r.summary} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return r.output;
};
const ref = (page, label) => Number(new RegExp(`\\[(\\d+)\\][^\\n]*"${label}`).exec(page)?.[1]);

const html = `<!doctype html><title>Apply</title><h1>Job application</h1>
<form onsubmit="event.preventDefault();document.title='SENT'">
<label>Full name <input name="name" required></label>
<label>Email <input type="email" name="email"></label>
<label>Country <select name="c"><option value="">Pick</option><option value="nl">Netherlands</option><option value="lb">Lebanon</option></select></label>
<label><input type="checkbox" name="terms"> I agree</label>
<label>CV <input type="file" name="cv"></label>
<button type="button" onclick="document.getElementById('out').textContent='rows: '+(++window.k||(window.k=1))">Add row</button>
<button type="submit">Submit application</button></form><p id="out">rows: 0</p>`;
const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);

// Chrome may not be running yet: browser_navigate starts it.
await run('browser_navigate', { url: 'https://example.com' });
let page = await run('browser_navigate', { url });
assert.match(page, /Title: Apply/);
assert.match(page, /input:text "Full name" \(required\)/);
assert.match(page, /select "Country".*options: Pick \/ Netherlands \/ Lebanon/);

// Find by query
const found = await run('browser_read', { query: 'email' });
assert.match(found, /input:email "Email"/);

// Fill the whole form in one step, with a file from the Library
await run('edit_file', { path: 'cv.txt', old_text: '', new_text: 'My CV' });
page = await run('browser_fill', { fields: [
  { ref: ref(page, 'Full name'), value: 'Ibrahim Test' },
  { ref: ref(page, 'Email'), value: 'ibrahim@example.com' },
  { ref: ref(page, 'Country'), value: 'Lebanon' },
  { ref: ref(page, 'I agree'), value: true },
  { ref: ref(page, 'CV'), files: [`/root/grokbot/files/${bot.id}/cv.txt`] },
] });
assert.match(page, /"Full name" = "Ibrahim Test"/);
assert.match(page, /"Email" = "ibrahim@example.com"/);
assert.match(page, /"Country" = "Lebanon"/);
assert.match(page, /"I agree" \(checked\)/);
assert.match(page, /"CV" = "C:\\\\fakepath\\\\cv\.txt"|"CV" = ".*cv\.txt"/);
await assert.rejects(toolMap.get('browser_fill').impl({ fields: [{ ref: 1, files: ['/etc/passwd'] }] }, ctx), /Library folder/);

// Click a normal button
page = await run('browser_click', { ref: ref(page, 'Add row') });
assert.match(page, /rows: 1/);

// Script
const js = JSON.parse(await run('browser_run_js', { code: 'return document.querySelector("select").value', purpose: 'test' }));
assert.equal(js.value, 'lb');

// Employee rules on the new tools
const submit = ref(page, 'Submit application');
const g1 = await employeeGuard('web', bot.id, 'browser_click', { ref: submit });
assert.match(g1.decide ?? '', /final step: “Submit application”/);
const g2 = await employeeGuard('web', bot.id, 'browser_fill', { fields: [{ ref: ref(page, 'Full name'), value: 'x' }], press_enter: true });
assert.match(g2.decide ?? '', /final step/, 'Enter in a form whose button submits the application also waits for the owner');
const g3 = await employeeGuard('web', bot.id, 'browser_fill', { fields: [{ ref: 1, value: '4242 4242 4242 4242' }] });
assert.match(g3.block ?? '', /never types a payment card number/);
const g4 = await employeeGuard('web', bot.id, 'browser_click', { ref: ref(page, 'Add row') });
assert.deepEqual(g4, {}, 'ordinary buttons need no OK');

await toolMap.get('shell').impl({ command: `rm -rf /root/grokbot/files/${bot.id}`, purpose: 'cleanup' }, ctx);
console.log('PASS: browser tools read, find, fill a whole form (text, select, checkbox, upload), click and run scripts; card numbers are blocked and final buttons wait for the owner');
db.close(); process.exit(0);
