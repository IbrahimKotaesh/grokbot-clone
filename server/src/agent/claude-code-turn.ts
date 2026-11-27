// "Claude Code" bots: a pure passthrough to Anthropic's unmodified Claude Code, like a desktop GUI would do.
// The user's message goes to `claude -p` as is. Fino adds no system prompt, no tools, no memory and no
// approvals; whatever Claude Code says or does is shown in the chat. It runs on the user's own computer
// with the user's own Claude sign-in (made once in the Claude Code terminal).
import { db, now } from '../db.js';
import { currentTurn } from '../lib/turn-id.js';
import { TurnMeter } from '../usage-meter.js';
import { appendRow, getBotRow, getRow, setLive, updateRow } from '../store.js';
import type { ToolCallBody } from '../types.js';
import { asUser, botWorkspace, claudeEnv, prepareClaude, q, vmShell, CLAUDE } from '../vm-claude.js';

db.exec('CREATE TABLE IF NOT EXISTS claude_code_sessions (bot_id TEXT NOT NULL, generation INTEGER NOT NULL, session_id TEXT NOT NULL, PRIMARY KEY (bot_id, generation))');

const short = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? '');
  return s.length > 300 ? s.slice(0, 300) + '…' : s;
};
const label = (name: string, input: any) => {
  const what = input?.command ?? input?.file_path ?? input?.path ?? input?.pattern ?? input?.url ?? input?.description ?? '';
  return what ? `${name} · ${String(what).slice(0, 80)}` : name;
};

export async function claudeCodeTurn(botId: string, text: string, signal: AbortSignal) {
  const bot = getBotRow(botId);
  const userId: string = bot.user_id;
  setLive(botId, { activity: { kind: 'on_its_computer', since: now() } });
  const computerId = await prepareClaude(userId);
  const ws = botWorkspace(botId);
  const run = `${ws}/.fino/run-${Date.now()}`;
  const saved = db.prepare('SELECT session_id FROM claude_code_sessions WHERE bot_id=? AND generation=?').get(botId, bot.generation) as { session_id: string } | undefined;
  const flags = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', ...(saved ? ['--resume', saved.session_id] : [])].join(' ');
  const inner = `cat ${q(run + '.prompt')} | ${claudeEnv(userId)} ${CLAUDE} ${flags} > ${q(run + '.jsonl')} 2>&1; echo "__FINO_EXIT__ $?" >> ${q(run + '.jsonl')}`;
  const start = asUser(
    `mkdir -p ${q(ws + '/.fino')} && printf %s ${q(Buffer.from(text, 'utf8').toString('base64'))} | base64 -d > ${q(run + '.prompt')} && cd ${q(ws)} && (nohup sh -c ${q(inner)} >/dev/null 2>&1 & echo PID:$!)`,
  );
  const started = await vmShell(computerId, start, 30);
  const pid = /PID:(\d+)/.exec(started.out)?.[1];
  if (!pid) throw new Error('Claude Code could not start on your computer.');

  const tools = new Map<string, number>(); // tool_use id → row seq
  let line = 0, finished = false, sawResult = false;
  const deadline = Date.now() + 30 * 60_000;
  try {
    while (!finished) {
      if (signal.aborted) throw new Error('Stopped.');
      if (Date.now() > deadline) throw new Error('Claude Code took too long and was stopped.');
      await new Promise((r) => setTimeout(r, 900));
      const r = await vmShell(computerId, asUser(`tail -n +${line + 1} ${q(run + '.jsonl')} 2>/dev/null | head -n 300`), 20).catch(() => ({ ok: false, out: '' }));
      const lines = r.out.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (!raw.trim()) {
          if (i < lines.length - 1) line++;
          continue;
        }
        const exit = /^__FINO_EXIT__ (\d+)/.exec(raw);
        if (exit) {
          line++;
          finished = true;
          if (!sawResult) throw new Error(exit[1] === '0' ? 'Claude Code ended without a reply.' : 'Claude Code stopped unexpectedly.');
          break;
        }
        let ev: any;
        try {
          ev = JSON.parse(raw);
        } catch {
          // An incomplete last line: read it again next time. Anything else is plain CLI output.
          if (i === lines.length - 1) break;
          line++;
          if (/login|authenticat|api key/i.test(raw)) throw new Error('Sign in to Claude Code first: Account → Claude Code, then type /login.');
          continue;
        }
        line++;
        if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id)
          db.prepare('INSERT OR REPLACE INTO claude_code_sessions(bot_id,generation,session_id) VALUES (?,?,?)').run(botId, bot.generation, ev.session_id);
        if (ev.type === 'assistant') {
          for (const c of ev.message?.content ?? []) {
            if (c.type === 'text' && c.text?.trim()) appendRow(botId, 'message', { type: 'message', role: 'assistant', text: c.text });
            if (c.type === 'tool_use') {
              const row = appendRow(botId, 'tool-call', { type: 'tool-call', callId: c.id, name: c.name, label: label(c.name, c.input), status: 'running', args: c.input } satisfies ToolCallBody);
              tools.set(c.id, row.seq);
            }
          }
        }
        if (ev.type === 'user') {
          for (const c of ev.message?.content ?? []) {
            if (c.type !== 'tool_result') continue;
            const seq = tools.get(c.tool_use_id);
            if (seq === undefined) continue;
            const content = Array.isArray(c.content) ? c.content.map((x: any) => x.text ?? '').join('\n') : c.content;
            const prev = getRow(botId, seq)?.body as ToolCallBody | undefined;
            if (prev) updateRow(botId, seq, { ...prev, status: c.is_error ? 'error' : 'done', summary: short(content) });
          }
        }
        if (ev.type === 'result') {
          sawResult = true;
          try {
            const turn = currentTurn(botId), u = ev.usage ?? {}, bot = getBotRow(botId);
            const cached = (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
            const meter = new TurnMeter(bot.user_id, botId, 'claude-code', bot.model || null, { turnId: turn?.id, startedAt: turn?.startedAt });
            meter.setTotals((u.input_tokens ?? 0) + cached, u.cache_read_input_tokens ?? 0, u.output_tokens ?? 0, ev.num_turns ?? 1);
            meter.save();
          } catch { /* usage is best effort */ }
          if (ev.is_error || ev.subtype !== 'success') {
            const msg = String(ev.result ?? ev.errors?.join('; ') ?? 'Claude Code reported an error.');
            throw new Error(/login|authenticat|api key|credit/i.test(msg) ? 'Sign in to Claude Code first: Account → Claude Code, then type /login.' : msg);
          }
        }
      }
    }
  } finally {
    if (!finished) await vmShell(computerId, asUser(`kill ${pid} 2>/dev/null; pkill -P ${pid} 2>/dev/null; true`), 20).catch(() => {});
  }
}
