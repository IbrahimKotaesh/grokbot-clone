// The office tools (view/edit/find files, run_python, Excel, Word, PowerPoint, compare) run end to end on the
// bot's real computer (local Lima VM). Throwaway database; no model calls. First run installs the Python libs.
//   PUBLIC_SIGNUP=0 DB_PATH=$(mktemp -d)/t.db node --env-file=.env tests/office-tools.mjs   (after npm run build)
import assert from 'node:assert/strict';
import { db } from '../server/dist/db.js';
import { createBot } from '../server/dist/bots.js';
import { initSubagents } from '../server/dist/agent/subagents.js';
import { toolMap, policyFor } from '../server/dist/agent/tools.js';
initSubagents();
db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run('office', 'office@example.com', 'Office', Date.now());
try { db.prepare("UPDATE users SET plan='pro'").run(); } catch {}
const bot = createBot('office', { name: 'Clerk', isPrimary: true });
const ctx = { userId: 'office', botId: bot.id, signal: new AbortController().signal };
const run = async (name, args) => {
  const t0 = Date.now();
  const r = await toolMap.get(name).impl(args, ctx);
  console.log(`  ${name}: ${r.summary} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return JSON.parse(r.output);
};
const fails = async (name, args, re) => { await assert.rejects(toolMap.get(name).impl(args, ctx), re); console.log(`  ${name}: refused as expected`); };

// Files: create, view, edit, find
await run('edit_file', { path: 'notes/plan.md', old_text: '', new_text: '# Plan\n- call Sami\n- pay rent\n- call Sami again\n' });
let v = await run('view_file', { path: 'notes/plan.md' });
assert.match(v.text, /2\t- call Sami/);
await fails('edit_file', { path: 'notes/plan.md', old_text: 'call Sami', new_text: 'email Sami' }, /appears 2 times/);
await run('edit_file', { path: 'notes/plan.md', old_text: '- pay rent', new_text: '- pay rent (done)' });
v = await run('view_file', { path: 'notes/plan.md' });
assert.match(v.text, /pay rent \(done\)/);
await fails('view_file', { path: '/etc/passwd' }, /inside your Library/);
await fails('edit_file', { path: '../../../tmp/x.txt', old_text: '', new_text: 'x' }, /inside your Library/);
const f = await run('find_in_files', { pattern: '**/*.md', query: 'sami' });
assert.equal(f.matches.length, 2);

// Excel with totals, numbers as numbers, a leading-zero code kept as text, Arabic sheet right-to-left
const s = await run('make_spreadsheet', { filename: 'invoices.xlsx', sheets: [
  { name: 'Invoices', columns: ['Invoice', 'Vendor', 'Amount'], rows: [['0012', 'Acme', '1,250.50'], ['0013', 'Globex', 99]], totals: true },
  { name: 'ملخص', columns: ['المورد', 'المبلغ'], rows: [['Acme', 1250.5]] },
] });
assert.deepEqual(s.sheets, ['Invoices', 'ملخص']);
assert.equal(s.sent_to_chat, true);
const xl = await run('run_python', { purpose: 'check', code: `
from openpyxl import load_workbook
wb = load_workbook("invoices.xlsx"); ws = wb["Invoices"]
print(repr(ws["A2"].value), repr(ws["C2"].value), ws["C4"].value, wb["ملخص"].sheet_view.rightToLeft)
` });
assert.equal(xl.error, undefined, xl.error);
assert.match(xl.stdout, /'0012' 1250\.5 =SUM\(C2:C3\) True/);

// Python with a chart: the chart lands in the chat
const py = await run('run_python', { purpose: 'chart', chart_name: 'totals', code: `
import pandas as pd, matplotlib.pyplot as plt
df = pd.read_excel("invoices.xlsx", sheet_name="Invoices").dropna(subset=["Vendor"])
print(df["Amount"].sum())
df.plot.bar(x="Vendor", y="Amount")
` });
assert.match(py.stdout, /1349\.5/);
assert.equal(py.charts_shown_in_chat, 1);

// Word and PowerPoint
const d = await run('make_document', { filename: 'report.docx', title: 'تقرير الفواتير', blocks: [{ type: 'paragraph', text: 'Two invoices this month.' }, { type: 'table', columns: ['Vendor', 'Amount'], rows: [['Acme', '1250.50']] }] });
assert.match(d.path, /report\.docx$/);
const p = await run('make_document', { filename: 'deck.pptx', title: 'Invoices', slides: [{ title: 'Totals', bullets: ['Acme 1,250.50', 'Globex 99'] }] });
assert.match(p.path, /deck\.pptx$/);

// Compare two CSVs by key
await run('edit_file', { path: 'oct.csv', old_text: '', new_text: 'Invoice,Vendor,Amount\n0011,Initech,10\n0012,Acme,1200\n' });
await run('edit_file', { path: 'nov.csv', old_text: '', new_text: 'Invoice,Vendor,Amount\n0012,Acme,1250.50\n0013,Globex,99\n' });
const c = await run('compare_files', { file_a: 'oct.csv', file_b: 'nov.csv', key_column: 'Invoice' });
assert.deepEqual(c.added, ['0013']);
assert.deepEqual(c.removed, ['0011']);
assert.deepEqual(c.changed[0].changes.Amount, ['1200', '1250.50']);

// Files reached the chat as file cards / images
const files = db.prepare('SELECT name, mime FROM message_files WHERE bot_id=?').all(bot.id);
assert.deepEqual(files.map((x) => x.name).sort(), ['deck.pptx', 'invoices.xlsx', 'report.docx']);
assert.ok(files.every((x) => x.mime.startsWith('application/vnd.openxmlformats')));
assert.equal(db.prepare('SELECT COUNT(*) n FROM message_images WHERE bot_id=?').get(bot.id).n, 1);

// Approvals in balanced mode: reading/making files needs no OK, running code does
try { db.exec('ALTER TABLE users ADD COLUMN auto_approve INTEGER NOT NULL DEFAULT 0'); } catch {}
assert.equal(policyFor('office', 'view_file', { path: 'x' }, bot.id).decision, 'allow');
assert.equal(policyFor('office', 'make_spreadsheet', {}, bot.id).decision, 'allow');
assert.equal(policyFor('office', 'run_python', { code: 'print(1)' }, bot.id).decision, 'ask');

// Clean up this test's Library folder on the shared machine
await toolMap.get('shell').impl({ command: `rm -rf /root/grokbot/files/${bot.id}`, purpose: 'cleanup' }, ctx);
console.log('PASS: view/edit/find files, Python with charts, Excel (totals, formulas, RTL), Word, PowerPoint and compare all work on the bot computer, inside the Library only');
db.close(); process.exit(0);
