import { availableProviders, isQuotaError, markExhausted, pickProvider, PROVIDER_NAMES } from './fallback.js';
import { claudeCodeTurn } from './claude-code-turn.js';
import { loopClient, LOOP_PROVIDERS, type LoopProvider } from './model-clients.js';
import {desktopForTrigger,withDesktopTarget,localDesktopTarget,DESKTOP_TOOLS,runDesktopTool,type DesktopTarget} from '../desktop-device.js';
import {inChat} from '../lib/chat-scope.js';
import {finishDesktopWork} from './desktop-proof.js';
import {externalToolOutput,hasSuspiciousContext,flagSuspiciousContent} from './trust.js';
import OpenAI from 'openai';
import { fileContext } from '../documents.js';
import { imageInputs } from '../images.js';
import { codexTurn } from './codex.js';
import { claudeTurn } from './claude.js';
import { db, now } from '../db.js';
import { env } from '../env.js';
import { newId, sha256 } from '../lib/ids.js';
import { hub } from '../lib/hub.js';
import { appendHistory, appendRow, emitBot, getBotRow, getRow, loadHistory, setLive, updateRow } from '../store.js';
import type { MessageBody, ToolCallBody } from '../types.js';
import { composioTools, toolkitInfo } from '../composio.js';
import { systemPrompt } from './prompt.js';
import { repairHistory } from './history.js';
import { maybeCompact, noteUsage } from './memory.js';
import { appToolCall, activityFor, functionSchemas, humanizeSlug, policyKeys, policyFor, runComposioTool, toolMap, type ToolCtx, type ToolResult } from './tools.js';


export type Trigger = (
  | { type: 'user'; desktopTarget?:DesktopTarget|null; text: string; imageIds?: string[]; fileIds?: string[] }
  | { type: 'routine'; routineId: string; name: string; prompt: string }
  | { type: 'bot'; fromBotId: string; fromName: string; fromGeneration?:number; text: string; depth: number }
  | { type: 'system'; text: string; imageIds?: string[]; fileIds?: string[] }
  | { type: 'resume' }) & {generation?:number; providerOverride?: string; tried?: string[]};

/** The model provider the current turn of each bot actually runs on (after any fallback). */
const turnProvider = new Map<string, string>();

interface PendingState {
  /** function_call items still to process, in order. */
  calls: { call_id: string; name: string; arguments: string; rowSeq: number }[];
  /** outputs already produced for this batch. */
  outputs: any[];
  approvalId: string;
  depth: number;
  generation?:number;
}

const MAX_STEPS = 60;
const KEEP_IMAGES = 3;

// ---------- per-bot serial queue ----------

const queues = new Map<string, Promise<void>>();
const aborts = new Map<string, AbortController>();

export function enqueue(botId: string, trigger: Trigger) {
  trigger={...trigger,generation:trigger.generation??(db.prepare('SELECT generation FROM bots WHERE id=?').get(botId) as any)?.generation};
  if(trigger.type==='user'&&trigger.desktopTarget===undefined)trigger={...trigger,desktopTarget:desktopForTrigger(getBotRow(botId)?.user_id,'user')};
  const prev = queues.get(botId) ?? Promise.resolve();
  const next = prev.then(() => runTurn(botId, trigger)).catch((e) => console.error('[agent] turn failed', botId, e));
  queues.set(botId, next);
  next.finally(() => { if (queues.get(botId) === next) queues.delete(botId); });
}

export function interrupt(botId: string) {
  aborts.get(botId)?.abort();
}

/** Run a job in the bot's serial queue, after any running turn (e.g. a manual compaction). */
export function runInBotQueue<T>(botId: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(botId) ?? Promise.resolve();
  const result = prev.then(job);
  const next = result.then(() => {}, () => {});
  queues.set(botId, next);
  next.finally(() => { if (queues.get(botId) === next) queues.delete(botId); });
  return result;
}

export const isBotBusy = (botId: string) => queues.has(botId);

function enqueueBotMessage(fromBotId: string, toBotId: string, text: string, depth: number,targetGeneration?:number) {
  const from = getBotRow(fromBotId);
  const target=getBotRow(toBotId),generation=targetGeneration??target.generation,tainted=hasSuspiciousContext(fromBotId);
  inChat(toBotId,generation,()=>{if(tainted)flagSuspiciousContent(from.user_id,toBotId,'delegated external context',text);
   appendRow(toBotId,'message',{type:'message',role:'user',text,from:{kind:'bot',id:fromBotId,name:from.name}});
  });
  enqueue(toBotId, { type: 'bot', fromBotId, fromName: from.name,fromGeneration:from.generation,generation, text, depth });
}

// ---------- history helpers ----------

/** Keep only the most recent screenshots inline; older ones become a short caption. */
function pruneImages(items: any[]): any[] {
  let seen = 0;
  const out = [...items];
  for (let i = out.length - 1; i >= 0; i--) {
    const it = out[i];
    const content = it?.type === 'function_call_output' ? it.output : it?.role === 'user' ? it.content : null;
    if (!Array.isArray(content)) continue;
    if (!content.some((c: any) => c?.type === 'input_image')) continue;
    seen++;
    if (seen > KEEP_IMAGES) {
      const replaced = content.map((c: any) => (c?.type === 'input_image' ? { type: 'input_text', text: '[older screenshot omitted]' } : c));
      out[i] = it.type === 'function_call_output' ? { ...it, output: replaced } : { ...it, content: replaced };
    }
  }
  return out;
}

function triggerItem(t: Trigger, attachments=''): any | null {
  switch (t.type) {
    case 'user': return { role: 'user', content: t.text + attachments };
    case 'routine': return { role: 'user', content: `[Routine "${t.name}" is running now. Do this:]\n${t.prompt}` };
    case 'bot': return { role: 'user', content: `[Message from ${t.fromName}, another Bot on the team. Reply to them with send_to_bot if they asked you something.]\n${t.text}` };
    case 'system': return { role: 'user', content: `[System notice] ${t.text}${attachments}` };
    case 'resume': return null;
  }
}

// ---------- the turn ----------

async function runTurn(botId:string,trigger:Trigger){
 const generation=trigger.generation??(db.prepare('SELECT generation FROM bots WHERE id=?').get(botId) as any)?.generation;
 if(!generation)return;const target=trigger.type==='user'?(trigger.desktopTarget??null):null;return withDesktopTarget(target,()=>inChat(botId,generation,()=>runScopedTurn(botId,trigger)));
}
async function runScopedTurn(botId: string, trigger: Trigger) {
  const bot = getBotRow(botId);
  if (!bot) return;
  const userId: string = bot.user_id;
  const preferred: string = bot.agent_provider ?? env.agentProvider;
  // A model that ran out of usage is skipped for a while in favour of the user's next connected model.
  const tried = trigger.tried ?? [];
  const provider: string = trigger.providerOverride ?? (preferred === 'claude-code' ? preferred : (pickProvider(userId, preferred) ?? preferred));
  if (provider !== preferred && !trigger.providerOverride)
    appendRow(botId, 'notice', { type: 'notice', tone: 'info', text: `${PROVIDER_NAMES[preferred] ?? preferred} is out of usage for now, so this reply uses ${PROVIDER_NAMES[provider] ?? provider}.` });
  turnProvider.set(botId, provider);
  const ctrl = new AbortController();
  aborts.set(botId, ctrl);
  let depth = trigger.type === 'bot' ? trigger.depth : 0;

  const ctx: ToolCtx = { userId, botId, desktopProof:{used:false},desktopTarget:localDesktopTarget(), enqueueBotMessage:(from,to,text,level)=>enqueueBotMessage(from,to,text,level,trigger.type==='bot'&&to===trigger.fromBotId?trigger.fromGeneration:undefined), depth, directUserRequest: trigger.type === 'user' ? trigger.text : undefined };
  let completed=false;
  setLive(botId, { isRunning: true, activity: { kind: 'thinking', since: now() }, awaiting: null, startedAt: now() });

  try {
    const attachedContext=fileContext(userId,botId,'fileIds' in trigger?trigger.fileIds:[]);
    // Claude Code bots: the user's words go straight to Claude Code, nothing added.
    if (provider === 'claude-code') {
      if (trigger.type !== 'user') return;
      await claudeCodeTurn(botId, trigger.text, ctrl.signal);
      completed = true;
      return;
    }
    if (provider === 'codex' || provider === 'claude') {
      const old = db.prepare('SELECT state FROM pending_turns WHERE bot_id=?').get(botId) as any;
      if (old) await finishPending(ctx, JSON.parse(old.state), 'restart');
      const item = triggerItem(trigger,attachedContext);
      if (!item) return;
      const images=imageInputs(userId, 'imageIds' in trigger ? trigger.imageIds : []);
      await (provider === 'claude' ? claudeTurn : codexTurn)(botId, item.content, ctrl.signal, async (name, args, callId) => {
        if (!toolMap.has(name)) throw new Error(`Unknown local tool: ${name}`);
        const act = activityFor(name);
        const row = appendRow(botId, 'tool-call', { type: 'tool-call', callId, name, label: act.label, status: 'running', args } as ToolCallBody);
        const st: PendingState = { calls: [{call_id:callId,name,arguments:JSON.stringify(args),rowSeq:row.seq}],outputs:[],approvalId:'',depth,generation:bot.generation };
        while (await processCalls(ctx, st)) {
          while (!ctrl.signal.aborted) {
            const ap = db.prepare('SELECT status FROM approvals WHERE id=?').get(st.approvalId) as any;
            if (ap?.status !== 'pending') break;
            if(policyFor(userId,name,args,botId).decision==='allow'){resolveApproval(userId,st.approvalId,'allow');break;}
            await new Promise(r => setTimeout(r, 250));
          }
          if (ctrl.signal.aborted) throw new Error('Stopped.');
        }
        return {output: st.outputs[0]?.output ?? '', endTurn: !!st.outputs[0]?.__endTurn};
      }, images);
      completed=true;
      return;
    }
    // A new user message supersedes any pending approval: deny it.
    const pendingRow = db.prepare('SELECT state FROM pending_turns WHERE bot_id=?').get(botId) as any;
    if (pendingRow && trigger.type !== 'resume') {
      const st = JSON.parse(pendingRow.state) as PendingState;
      await finishPending(ctx, st, 'denied-by-new-message');
    }
    if (trigger.type === 'resume') {
      if (!pendingRow) return;
      const st = JSON.parse(pendingRow.state) as PendingState;
      depth = st.depth;
      const paused = await processCalls(ctx, st);
      if (paused) return;
    } else {
      const item = triggerItem(trigger,attachedContext);
      if (item) {
        const images=imageInputs(userId,'imageIds' in trigger ? trigger.imageIds : []);
        if(images.length) item.content=[{type:'input_text',text:item.content},...images.map(image_url=>({type:'input_image',image_url}))];
        // A fallback retry after another built-in model already recorded this message must not add it twice.
        const last = tried.length ? loadHistory(botId).at(-1) : null;
        if (!(last && last.role === 'user' && JSON.stringify(last.content) === JSON.stringify(item.content))) appendHistory(botId, [item]);
      }
    }

    const tools = [
      ...functionSchemas(),
      ...(await composioTools(userId)),
      { type: 'web_search' },
      { type: 'x_search' },
    ];

    for (let step = 0; step < MAX_STEPS; step++) {
      if (ctrl.signal.aborted) throw new Error('interrupted');
      const result = await callModel(ctx, tools, ctrl.signal);
      appendHistory(botId, result.output);
      const calls = result.output.filter((o: any) => o.type === 'function_call');
      if (!calls.length) break;

      const st: PendingState = {
        calls: calls.map((c: any) => {
          const act = activityFor(c.name);
          const row = appendRow(botId, 'tool-call', { type: 'tool-call', callId: c.call_id, name: c.name, label: act.label, status: 'running', args: safeParse(c.arguments) } satisfies ToolCallBody);
          return { call_id: c.call_id, name: c.name, arguments: c.arguments, rowSeq: row.seq };
        }),
        outputs: [],
        approvalId: '',
        depth,generation:bot.generation,
      };
      const paused = await processCalls(ctx, st);
      if (paused) return;
      if (st.outputs.some((o: any) => o.__endTurn)) break;
    }
    completed=true;
  } catch (e: any) {
    let handled = false;
    if (!ctrl.signal.aborted && trigger.type === 'user' && provider !== 'claude-code' && isQuotaError(e)) {
      markExhausted(userId, provider);
      const next = pickProvider(userId, provider, [...tried, provider]);
      if (next) {
        appendRow(botId, 'notice', { type: 'notice', tone: 'warn', text: `${PROVIDER_NAMES[provider] ?? provider} stopped responding (usage limit). Switching to ${PROVIDER_NAMES[next] ?? next}.` });
        enqueue(botId, { ...trigger, providerOverride: next, tried: [...tried, provider] });
      } else
        appendRow(botId, 'notice', {
          type: 'notice',
          tone: 'error',
          text: tried.length
            ? 'All your connected models are out of usage right now. Add another model in Account → AI models, or try again later.'
            : `${PROVIDER_NAMES[provider] ?? provider} is out of usage right now. Connect another model in Account → AI models so your bots can switch automatically.`,
        });
      handled = true;
    }
    const msg = ctrl.signal.aborted ? 'Stopped.' : `Something went wrong: ${e?.message ?? e}`;
    if (!handled) appendRow(botId, 'notice', { type: 'notice', text: msg, tone: ctrl.signal.aborted ? 'info' : 'error' });
    if (!ctrl.signal.aborted) console.error('[agent]', e);
  } finally {
    if (provider === 'codex' || provider === 'claude') {
      const pending = db.prepare('SELECT state FROM pending_turns WHERE bot_id=?').get(botId) as any;
      if (pending) await finishPending(ctx, JSON.parse(pending.state), 'turn-ended');
    }
    aborts.delete(botId);
    const stillPending = db.prepare('SELECT 1 FROM pending_turns WHERE bot_id=?').get(botId);
    await finishDesktopWork(ctx,completed&&!ctrl.signal.aborted,!!stillPending);
    if (!stillPending) setLive(botId, { isRunning: false, activity: null, awaiting: null, startedAt: null });
    emitBot(botId);

  }
}

/** Run function calls in order. Returns true if the turn paused for approval. */
async function processCalls(ctx: ToolCtx, st: PendingState): Promise<boolean> {
  const { botId, userId } = ctx;
  if(st.generation&&st.generation!==getBotRow(botId).generation)return inChat(botId,st.generation,()=>processCalls(ctx,st));
  st.generation??=getBotRow(botId).generation;
  while (st.calls.length) {
    const c = st.calls[0];
    const args = safeParse(c.arguments) ?? {};
    const row = getRow(botId, c.rowSeq);
    const body = (row?.body ?? {}) as ToolCallBody;

    // Was this call just approved/denied?
    const ap = st.approvalId ? (db.prepare('SELECT * FROM approvals WHERE id=?').get(st.approvalId) as any) : null;
    let decision = policyFor(userId, c.name, args, botId).decision;
    if (ap && ap.call_id === c.call_id) {
      if (ap.status === 'pending') return true;
      decision = ap.status === 'denied' || decision === 'block' ? 'block' : 'allow';
      st.approvalId = '';
    } else if (decision === 'ask') {
      const pol = policyFor(userId, c.name, args, botId);
      const approvalArgs = c.name === 'connected_apps' ? appToolCall(args).args : args;
      const approvalId = newId('apr');
      const tk = pol.toolkit ? await toolkitInfo(pol.toolkit) : undefined;
      // A saved grant may have arrived while toolkit metadata was loading.
      if(policyFor(userId,c.name,args,botId).decision!=='ask')continue;
      const card = appendRow(botId, 'card', {
        type: 'card', card: 'approval', approvalId, title: pol.requiresFreshApproval?`Review sensitive action for ${getBotRow(botId).name}`:`Allow ${getBotRow(botId).name} to ${pol.title.split(': ')[1] ?? pol.title}?`,
        detail: [pol.safetyReason,describeArgs(approvalArgs)].filter(Boolean).join('\n\n'), requiresFreshApproval:pol.requiresFreshApproval, tool: pol.key, toolkit: pol.toolkit, toolkitName: tk?.name, logo: tk?.logo, args: approvalArgs, policyKeys: policyKeys(c.name,args), status: 'pending',
      });
      db.prepare('INSERT INTO approvals(id,bot_id,row_seq,call_id,tool,status,created_at,generation) VALUES (?,?,?,?,?,?,?,?)').run(approvalId, botId, card.seq, c.call_id, pol.key, 'pending', now(),getBotRow(botId).generation);
      updateRow(botId, c.rowSeq, { ...body, status: 'awaiting-approval' });
      st.approvalId = approvalId;
      db.prepare('INSERT OR REPLACE INTO pending_turns(bot_id,state) VALUES (?,?)').run(botId, JSON.stringify(st));
      setLive(botId, { isRunning: false, activity: { kind: 'waiting_for_you', since: now() }, awaiting: { reason: humanizeSlug(pol.key), since: now() } });
      hub.emit(userId, { type: 'tasks', botId });
      return true;
    }

    let res: ToolResult;
    if (decision === 'block') {
      res = { output: 'The user declined this action. Do not retry it. Find another way, or tell the user what you could not do.', summary: 'Not allowed' };
      updateRow(botId, c.rowSeq, { ...body, status: 'denied', summary: 'Not allowed' });
    } else {
      const act = activityFor(c.name);
      const pol = policyFor(userId, c.name, args, botId);
      const detail = c.name === 'send_to_bot' ? String(args.bot_name ?? '') : !toolMap.has(c.name) && pol.toolkit ? (await toolkitInfo(pol.toolkit))?.name ?? pol.toolkit : undefined;
      setLive(botId, { isRunning: true, activity: { kind: c.name === 'send_to_bot' ? 'messaging_named' : act.kind, detail, since: now() }, awaiting: null });
      try {
        const impl = toolMap.get(c.name);
        if(ctx.desktopTarget&&DESKTOP_TOOLS.has(c.name)){res=await runDesktopTool(userId,ctx.desktopTarget,c.name,args);if(ctx.desktopProof)ctx.desktopProof.used=true;}
        else res = impl ? await impl.impl(args, { ...ctx, depth: st.depth }) : await runComposioTool(ctx, c.name, args);
        if(res.endTurn&&ctx.desktopProof)ctx.desktopProof.deferred=true;
        if(!toolMap.has(c.name)||['connected_apps','read_file','view_photo','computer_screenshot','shell','open_browser','recall','search_conversation'].includes(c.name))res={...res,output:externalToolOutput(userId,botId,c.name,res.output)};
        updateRow(botId, c.rowSeq, { ...body, status: 'done', summary: res.summary });
      } catch (e: any) {
        res = { output: `Tool error: ${e?.message ?? e}` };
        updateRow(botId, c.rowSeq, { ...body, status: 'error', summary: String(e?.message ?? e).slice(0, 200) });
      }
    }
    const out: any = { type: 'function_call_output', call_id: c.call_id, output: res.output };
    st.outputs.push(res.endTurn ? { ...out, __endTurn: true } : out);
    st.calls.shift();
  }
  // Batch complete: persist outputs (strip internal markers).
  appendHistory(botId, st.outputs.map(({ __endTurn, ...o }: any) => o));
  db.prepare('DELETE FROM pending_turns WHERE bot_id=?').run(botId);
  setLive(botId, { isRunning: true, activity: { kind: 'thinking', since: now() }, awaiting: null });
  return false;
}

/** When a new message arrives while an approval is pending, close the batch with denials. */
async function finishPending(ctx: ToolCtx, st: PendingState, _reason: string):Promise<void> {
  if(st.generation&&st.generation!==getBotRow(ctx.botId).generation)return inChat(ctx.botId,st.generation,()=>finishPending(ctx,st,_reason));
  const { botId } = ctx;
  if (st.approvalId) {
    const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(st.approvalId) as any;
    if (ap?.status === 'pending') {
      db.prepare("UPDATE approvals SET status='expired', resolved_at=? WHERE id=?").run(now(), ap.id);
      const card = getRow(botId, ap.row_seq);
      if (card && card.body.type === 'card' && card.body.card === 'approval') updateRow(botId, ap.row_seq, { ...card.body, status: 'expired' });
    }
  }
  for (const c of st.calls) {
    st.outputs.push({ type: 'function_call_output', call_id: c.call_id, output: 'Skipped: the user sent a new message before approving this. Do not retry unless they ask.' });
    const row = getRow(botId, c.rowSeq);
    if (row) updateRow(botId, c.rowSeq, { ...(row.body as ToolCallBody), status: 'denied', summary: 'Skipped' });
  }
  appendHistory(botId, st.outputs.map(({ __endTurn, ...o }: any) => o));
  db.prepare('DELETE FROM pending_turns WHERE bot_id=?').run(botId);
}

// ---------- model call with streaming into a message row ----------

async function callModel(ctx: ToolCtx, tools: any[], signal: AbortSignal): Promise<{ output: any[] }> {
  const { botId, userId } = ctx;
  const bot = getBotRow(botId);
  // Runs inside the bot's serial queue, so compaction can't race a turn.
  const history = await maybeCompact(botId, loadHistory(botId)).catch(() => loadHistory(botId));
  // The model is only called when no approval is pending, so every orphaned call can be repaired.
  const input = [{ role: 'system', content: await systemPrompt(userId, botId) }, ...pruneImages(repairHistory(history))];

  const active = turnProvider.get(botId) ?? bot.agent_provider;
  const provider = (LOOP_PROVIDERS as string[]).includes(active) ? (active as LoopProvider) : 'xai';
  const llm = loopClient(userId, provider, provider === bot.agent_provider ? bot.model : null);
  const body: any = {
    model: llm.model,
    input,
    tools: llm.xaiExtras ? tools : tools.filter((t: any) => t.type === 'function'),
    reasoning: { effort: bot.effort ?? 'medium' },
    store: false,
    stream: true,
    ...(llm.xaiExtras
      ? { include: ['reasoning.encrypted_content'], prompt_cache_key: `grokbot:${botId}:${bot.generation}`, safety_identifier: sha256(userId).slice(0, 32) }
      : {}),
  };

  let stream: any;
  try {
    stream = await llm.client.responses.create(body, { signal });
  } catch (e: any) {
    // If a Composio tool schema is rejected, retry with only our own tools.
    if (e?.status === 400 && tools.length > functionSchemas().length + 2) {
      console.warn('[agent] 400 with composio tools, retrying without:', e?.message);
      body.tools = llm.xaiExtras ? [...functionSchemas(), { type: 'web_search' }, { type: 'x_search' }] : functionSchemas();
      stream = await llm.client.responses.create(body, { signal });
    } else throw e;
  }

  let msgSeq: number | null = null;
  let text = '';
  let lastFlush = 0;
  let final: any = null;
  const flush = (streaming: boolean) => {
    const b: MessageBody = { type: 'message', role: 'assistant', text, streaming };
    if (msgSeq === null) msgSeq = appendRow(botId, 'message', b).seq;
    else updateRow(botId, msgSeq, b);
    lastFlush = Date.now();
  };

  for await (const ev of stream as AsyncIterable<any>) {
    switch (ev.type) {
      case 'response.output_text.delta':
        text += ev.delta;
        if (msgSeq === null || Date.now() - lastFlush > 120) flush(true);
        break;
      case 'response.output_item.added':
        if (ev.item?.type === 'web_search_call') setLive(botId, { activity: { kind: 'searching_web', since: now() } });
        if (ev.item?.type === 'x_search_call') setLive(botId, { activity: { kind: 'searching_web', detail: 'X', since: now() } });
        if (ev.item?.type === 'message') setLive(botId, { activity: { kind: 'working', since: now() } });
        break;
      case 'response.output_item.done':
        if (ev.item?.type === 'message' && msgSeq !== null) {
          // finalize this message; a later message in the same response gets its own row
          const citations = (ev.item.content ?? []).flatMap((c: any) => (c.annotations ?? []).filter((a: any) => a.url).map((a: any) => ({ url: a.url, title: a.title })));
          updateRow(botId, msgSeq, { type: 'message', role: 'assistant', text, streaming: false, citations: citations.length ? citations : undefined });
          db.prepare('UPDATE bots SET unread = unread + 1 WHERE id=?').run(botId);
          msgSeq = null;
          text = '';
        }
        break;
      case 'response.completed':
      case 'response.incomplete':
        final = ev.response;
        break;
      case 'response.failed':
      case 'error':
        throw new Error(ev.response?.error?.message ?? ev.message ?? 'model error');
    }
  }
  if (msgSeq !== null) flush(false);
  if (!final) throw new Error('model stream ended without a response');
  if (final.usage?.input_tokens) noteUsage(botId, final.usage.input_tokens, history.length);
  return { output: final.output ?? [] };
}

// ---------- misc ----------

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return undefined; }
}

function describeArgs(args: any): string {
  if (!args || typeof args !== 'object') return '';
  const inner = Array.isArray(args.tools) ? args.tools.map((t: any) => t.arguments ?? t.args ?? t) : [args];
  const flat = inner.map((a: any) => Object.entries(a ?? {}).filter(([, v]) => typeof v !== 'object' || v === null).slice(0, 6).map(([k, v]) => `${k}: ${String(v).slice(0, 160)}`).join('\n'));
  return flat.join('\n\n').slice(0, 1200);
}

/** Resolve an approval and any duplicate requests already covered by its saved grant. */
export function resolveApproval(userId:string,approvalId:string,decision:'allow'|'always'|'deny'){
 const record=db.prepare('SELECT a.*,b.user_id,b.generation AS main_generation FROM approvals a JOIN bots b ON b.id=a.bot_id WHERE a.id=?').get(approvalId) as any;
 if(!record||record.user_id!==userId)throw Error('not found');
 return inChat(record.bot_id,record.generation??record.main_generation,()=>resolveScopedApproval(userId,approvalId,decision));
}
function resolveScopedApproval(userId: string, approvalId: string, decision: 'allow' | 'always' | 'deny') {
  const ap = db.prepare('SELECT a.*, b.user_id FROM approvals a JOIN bots b ON b.id=a.bot_id WHERE a.id=?').get(approvalId) as any;
  if (!ap || ap.user_id !== userId) throw new Error('not found');
  if (ap.status !== 'pending') return;
  const keysFor = (record:any) => {
    const card=inChat(record.bot_id,record.generation??getBotRow(record.bot_id).generation,()=>getRow(record.bot_id,record.row_seq));
    return card?.body.type==='card'&&card.body.card==='approval' ? card.body.policyKeys??[record.tool] : [record.tool];
  };
  const finish = (record:any,status:'allowed'|'always'|'denied') => {
    db.prepare('UPDATE approvals SET status=?, resolved_at=? WHERE id=? AND status=\'pending\'').run(status,now(),record.id);
    const card=inChat(record.bot_id,record.generation??getBotRow(record.bot_id).generation,()=>getRow(record.bot_id,record.row_seq));
    if(card?.body.type==='card'&&card.body.card==='approval'){const body=card.body;inChat(record.bot_id,record.generation??getBotRow(record.bot_id).generation,()=>updateRow(record.bot_id,record.row_seq,{...body,status}));}
    if(!['codex','claude','claude-code'].includes(getBotRow(record.bot_id)?.agent_provider??env.agentProvider))enqueue(record.bot_id,{type:'resume',generation:record.generation??getBotRow(record.bot_id).generation});
  };
  const ownCard=getRow(ap.bot_id,ap.row_seq);
  if(decision==='always'&&ownCard?.body.type==='card'&&ownCard.body.card==='approval'&&ownCard.body.requiresFreshApproval)decision='allow';
  if(decision==='always') {
    const keys=keysFor(ap);
    db.transaction(()=>{for(const key of keys)db.prepare("INSERT OR REPLACE INTO policies(user_id,tool,mode) VALUES (?,?,'always_allow')").run(userId,key);})();
    finish(ap,'always');
    const pending=db.prepare("SELECT a.* FROM approvals a JOIN bots b ON b.id=a.bot_id WHERE b.user_id=? AND a.status='pending'").all(userId) as any[];
    for(const other of pending){
      const otherCard=inChat(other.bot_id,other.generation??getBotRow(other.bot_id).generation,()=>getRow(other.bot_id,other.row_seq));
      if(otherCard?.body.type==='card'&&otherCard.body.card==='approval'&&otherCard.body.requiresFreshApproval)continue;
      const covered=keysFor(other);
      if(covered.length&&covered.every((key:string)=>keys.includes(key)&&inChat(other.bot_id,other.generation??getBotRow(other.bot_id).generation,()=>policyFor(userId,key,{},other.bot_id)).decision==='allow'))finish(other,'always');
    }
  }else finish(ap,decision==='deny'?'denied':'allowed');
}
