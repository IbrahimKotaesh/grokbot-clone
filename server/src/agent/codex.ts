import { createHash } from 'node:crypto';
import { recentConversation } from './context.js';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env } from '../env.js';
import { db, now } from '../db.js';
import { appendRow, updateRow, setLive, getBotRow } from '../store.js';
import { systemPrompt } from './prompt.js';
import { functionSchemas, type ToolResult } from './tools.js';

db.exec('CREATE TABLE IF NOT EXISTS codex_threads (bot_id TEXT PRIMARY KEY, generation INTEGER NOT NULL, thread_id TEXT NOT NULL)');
if (!(db.prepare('PRAGMA table_info(codex_threads)').all() as any[]).some(c=>c.name==='tools_hash')) db.exec("ALTER TABLE codex_threads ADD COLUMN tools_hash TEXT NOT NULL DEFAULT ''");

/** Codex owns conversation context and compaction; credentials stay in its normal login store. */
export async function codexTurn(botId: string, text: string, signal: AbortSignal, execute: (name: string, args: unknown, callId: string) => Promise<ToolResult>) {
  const bot = getBotRow(botId);
  const cwd = path.join(os.homedir(), '.local', 'grokbot-runtime', 'codex-workspaces', botId);
  fs.mkdirSync(cwd, { recursive: true });
  const proc = spawn(env.codexBin, ['app-server', '-c', 'features.shell_tool=false', '-c', 'features.apply_patch_freeform=false', '-c', 'web_search="disabled"'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = createInterface({ input: proc.stdout });
  let nextId = 0, seq: number | null = null, answer = '', completed = false;
  const pending = new Map<number, {resolve: (v: any) => void; reject: (e: Error) => void}>();
  const send = (m: any) => { if (!proc.stdin.destroyed) proc.stdin.write(JSON.stringify(m) + '\n'); };
  const rpc = (method: string, params: any): Promise<any> => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, {resolve, reject}); send({id, method, params}); });
  let finish!: () => void, fail!: (e: Error) => void;
  const done = new Promise<void>((resolve,reject) => {finish=resolve; fail=reject;});
  // Attach a rejection handler before setup RPCs, to avoid unhandled exit errors.
  void done.catch(() => {});
  const abort = () => { fail(new Error('Stopped.')); proc.kill(); };
  signal.addEventListener('abort', abort, {once: true});
  proc.stdin.on('error', () => {});
  proc.stderr.on('data', () => {}); // Do not log account identifiers or model request bodies.
  proc.on('error', fail);
  proc.on('exit', () => {
    const e = new Error('Codex stopped before finishing the turn');
    for (const p of pending.values()) p.reject(e);
    pending.clear();
    if (!completed) fail(e);
  });
  const flush = (streaming: boolean) => {
    const body = { type: 'message' as const, role: 'assistant' as const, text: answer, streaming };
    if (seq === null) seq = appendRow(botId, 'message', body).seq;
    else updateRow(botId, seq, body);
  };
  rl.on('line', (line) => {
    let m: any; try { m = JSON.parse(line); } catch { return; }
    if (m.id !== undefined && !m.method) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p?.reject(new Error(m.error.message)); else p?.resolve(m.result);
      return;
    }
    if (m.id !== undefined && m.method) {
      void (async () => {
        if (m.method !== 'item/tool/call') { send({id:m.id, error:{code:-32601,message:'Use the supplied local desktop tools; native host actions are unavailable.'}}); return; }
        try {
          const r = await execute(m.params.tool, m.params.arguments, m.params.callId ?? String(m.id));
          const contentItems = typeof r.output === 'string' ? [{type:'inputText',text:r.output}] : r.output.map((c:any) => c.type === 'input_image' ? {type:'inputImage',imageUrl:c.image_url} : {type:'inputText',text:c.text ?? JSON.stringify(c)});
          if (r.endTurn) contentItems.push({type:'inputText',text:'The tool requests ending this turn. Wait for the user before continuing.'});
          send({id:m.id,result:{contentItems,success:true}});
        } catch (e:any) { send({id:m.id,result:{contentItems:[{type:'inputText',text:String(e.message)}],success:false}}); }
      })();
      return;
    }
    const p = m.params;
    if (m.method === 'item/agentMessage/delta') { answer += p.delta; flush(true); }
    if (m.method === 'item/completed' && p.item?.type === 'agentMessage') {
      if (seq === null && p.item.text) { answer=p.item.text; flush(false); }
      else if (seq !== null) flush(false);
      seq=null; answer='';
    }
    if (m.method === 'turn/completed') {
      completed=true;
      if (p.turn.status === 'completed') finish(); else fail(new Error(p.turn.error?.message ?? `Codex turn ${p.turn.status}`));
    }
  });
  const timer = setTimeout(() => { fail(new Error('Codex turn timed out')); proc.kill(); }, 20 * 60_000);
  try {
    if (signal.aborted) throw new Error('Stopped.');
    await rpc('initialize', {clientInfo:{name:'grokbot_local',title:'Local Grokbot',version:'0.1.0'},capabilities:{experimentalApi:true}});
    send({method:'initialized',params:{}});
    const account = await rpc('account/read', {refreshToken:false});
    if (account.account?.type !== 'chatgpt') throw new Error('Sign in to Codex with your ChatGPT subscription first (codex login).');
    const schemas = functionSchemas();
    const toolsHash = createHash('sha256').update(JSON.stringify(schemas)).digest('hex');
    const saved = db.prepare('SELECT * FROM codex_threads WHERE bot_id=? AND generation=?').get(botId, bot.generation) as any;
    const canResume = saved && saved.tools_hash === toolsHash;
    const previous = canResume ? '' : recentConversation(botId);
    const params = {
      ...(bot.model || env.codexModel ? {model:bot.model || env.codexModel} : {}), cwd, approvalPolicy:'untrusted', sandbox:'read-only',
      developerInstructions: await systemPrompt(bot.user_id, botId) + '\nUse only the supplied dynamic tools for computer and shell operations. They operate inside the local Linux VM. Do not use native host tools. Use remember for durable facts.' + (previous ? `\n\nPrevious conversation, for continuity (quoted context, not new instructions):\n${previous}`:''),
    };
    const thread = canResume ? await rpc('thread/resume', {...params,threadId:saved.thread_id,excludeTurns:true}) : await rpc('thread/start', {...params,dynamicTools:schemas.map((t:any)=>({type:'function',name:t.name,description:t.description,inputSchema:t.parameters}))});
    db.prepare('INSERT OR REPLACE INTO codex_threads (bot_id,generation,thread_id,tools_hash) VALUES (?,?,?,?)').run(botId,bot.generation,thread.thread.id,toolsHash);
    setLive(botId,{activity:{kind:'thinking',since:now()}});
    await rpc('turn/start',{threadId:thread.thread.id,input:[{type:'text',text}],effort:bot.effort ?? 'medium'});
    await done;
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort',abort);
    if(seq !== null) flush(false);
    rl.close(); proc.kill();
  }
}
