// Fino agent exam: the same real tasks for any model, graded automatically, with time and cost.
// Runs against a local Fino server (DEV_LOGIN=1, OpenRouter key set) and costs a few cents per model.
//
//   node --env-file=.env tests/agent-eval.mjs deepseek/deepseek-v4.1-flash,z-ai/glm-5.3-flash [--computer]
//
// Each task runs in a fresh chat of a dedicated test account. Cost comes from the server's
// model_usage table (DB_PATH). Results are printed as a table and saved to agent-eval-results.json.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const BASE = process.env.EVAL_SERVER ?? 'http://127.0.0.1:8788/api';
const models = (process.argv[2] ?? 'deepseek/deepseek-v4.1-flash').split(',');
const withComputer = process.argv.includes('--computer');
const db = new DatabaseSync(process.env.DB_PATH, { readOnly: true });

const arabic = (t) => (t.match(/[؀-ۿ]/g) ?? []).length >= 30;
const has = (t, ...words) => words.every((w) => t.toLowerCase().includes(String(w).toLowerCase()));
const tools = (r) => r.tools;

/** Each task: what we ask, and how we grade it (answer text, tools used). */
const TASKS = [
  { id: 'arabic_chat', ask: 'عندي اجتماع بكرا مع مورد، حضّرلي 3 أسئلة عن الأسعار والتسليم.', pass: (a) => arabic(a) && /سعر|أسعار|الأسعار/.test(a) && /تسليم|التسليم/.test(a) },
  { id: 'email_draft', ask: 'Write a short polite email to a client 20 days late on invoice #1042 for $3,450. Under 120 words.', pass: (a) => has(a, '1042', '3,450') && a.split(/\s+/).length < 190 },
  {
    id: 'accounting',
    ask: 'Bills: $1,200 due Dec 1 (2% off if paid by Nov 25), $800 due Nov 28, $2,500 due Dec 10. Today is Nov 22. Cash now $2,300, $1,500 arrives Dec 5. What should I pay now? Show the math briefly.',
    pass: (a) => /1,?176/.test(a) && /676/.test(a),
  },
  { id: 'table_mixed', ask: 'اعطيني جدول فيه 3 أفكار منشورات انستغرام لمطعم لبناني مع caption بالإنجليزي و hashtags.', pass: (a) => (a.match(/\|/g) ?? []).length >= 8 && a.includes('#') },
  { id: 'memory', ask: 'Remember that my company is Cedar Foods and our fiscal year starts in April. Confirm in one line.', pass: (a, r) => tools(r).includes('remember') && has(a, 'Cedar') },
  { id: 'read_page', ask: 'Read https://en.wikipedia.org/wiki/Byblos and tell me in one sentence when it was first settled.', pass: (a, r) => tools(r).includes('read_page') && /8800|7000/.test(a) && !tools(r).some((t) => t.startsWith('computer_')) },
  { id: 'web_search', ask: 'What is the latest stable Node.js version right now? Look it up.', pass: (a, r) => /2\d\.\d+\.\d+/.test(a) && !tools(r).some((t) => t.startsWith('computer_')) },
  { id: 'plan_card', ask: 'Plan a 3-day trip to Beirut for me: day by day, with a budget in dollars. Use a checklist while you work.', pass: (a, r) => tools(r).includes('update_plan') && /day 1|اليوم الأول|اليوم 1/i.test(a) },
  { id: 'language_reply', ask: 'شو أحسن وقت بالسنة لزور لبنان؟ جاوب بجملتين.', pass: (a) => arabic(a) && a.length < 900 },
  ...(withComputer
    ? [{ id: 'computer', ask: 'Use your computer screen (not the shell): open en.wikipedia.org/wiki/Beirut and tell me the city population in the infobox.', pass: (a) => /433,?249/.test(a) }]
    : []),
];

function session() {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return r.json().catch(() => ({}));
  };
}

async function runTask(req, botId, task) {
  const { chat } = await req('POST', `/bots/${botId}/chats`, { title: task.id });
  const started = Date.now();
  await req('POST', `/bots/${botId}/messages`, { text: task.ask, generation: chat.generation });
  let idle = 0;
  while (Date.now() - started < 240_000) {
    await new Promise((r) => setTimeout(r, 2500));
    const d = await req('GET', '/bots');
    const live = d.live?.[d.bots.findIndex((b) => b.id === botId)] ?? {};
    idle = live.isRunning ? 0 : idle + 1;
    if (idle >= 2 && Date.now() - started > 6000) break;
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const { rows } = await req('GET', `/bots/${botId}/rows?generation=${chat.generation}`);
  const answer = rows.filter((r) => r.body.type === 'message' && r.body.role === 'assistant').map((r) => r.body.text).join('\n');
  const used = rows.filter((r) => r.body.type === 'tool-call').map((r) => r.body.name);
  const cost = db.prepare('SELECT COALESCE(SUM(cost_usd),0) AS c FROM model_usage WHERE bot_id=? AND started_at>=?').get(botId, started).c;
  const result = { task: task.id, seconds, cost: Math.round(cost * 10000) / 10000, tools: used };
  result.pass = !!task.pass(answer, result);
  result.answer = answer.slice(0, 600);
  return result;
}

const all = [];
for (const model of models) {
  const req = session();
  await req('POST', '/auth/dev', { email: `eval-${model.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}@fino.test`, name: 'Eval' });
  await req('POST', '/billing/dev-plan', { plan: 'max' });
  const { bots } = await req('GET', '/bots');
  const bot = bots.find((b) => b.isPrimary);
  await req('PATCH', `/bots/${bot.id}`, { agentProvider: 'openrouter', model });
  for (const task of TASKS) {
    const r = { model, ...(await runTask(req, bot.id, task)) };
    all.push(r);
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${model.padEnd(30)} ${task.id.padEnd(15)} ${String(r.seconds).padStart(6)}s  $${r.cost.toFixed(4)}  ${r.tools.join(',')}`);
  }
}
console.log('\nSummary');
for (const model of models) {
  const rs = all.filter((r) => r.model === model);
  const passed = rs.filter((r) => r.pass).length;
  const avg = rs.reduce((s, r) => s + r.seconds, 0) / rs.length;
  const cost = rs.reduce((s, r) => s + r.cost, 0);
  console.log(`${model.padEnd(30)} ${passed}/${rs.length} passed · avg ${avg.toFixed(1)}s · total $${cost.toFixed(4)}`);
}
fs.writeFileSync('agent-eval-results.json', JSON.stringify(all, null, 1));
