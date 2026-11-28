import { userInControl, noteWaitingForHandback } from '../vnc.js';
import { beginTurn, currentTurn, endTurn } from '../lib/turn-id.js';
import { raceAbort } from '../lib/abort.js';
import { availableProviders, isQuotaError, markExhausted, pickProvider, PROVIDER_NAMES } from './fallback.js';
import { claudeCodeTurn } from './claude-code-turn.js';
import { loopClient, LOOP_PROVIDERS, type LoopProvider } from './model-clients.js';
import { BROWSER_TOOL_NAMES } from './browser-tools.js';
import {desktopForTrigger,withDesktopTarget,localDesktopTarget,DESKTOP_TOOLS,runDesktopTool,type DesktopTarget} from '../desktop-device.js';
import {inChat} from '../lib/chat-scope.js';
import {finishDesktopWork} from './desktop-proof.js';
import {externalToolOutput,hasSuspiciousContext,flagSuspiciousContent} from './trust.js';
import { employeeGuard, type Guard } from './employee-rules.js';
import { reviewAction, isPaused, setPaused } from './rules.js';
import OpenAI from 'openai';
import { fileContext } from '../documents.js';
import { imageInputs } from '../images.js';
import { codexTurn } from './codex.js';
import { TurnMeter } from '../usage-meter.js';
import { COMPUTER_CHEAP, COMPUTER_STRONG, DEFAULT_HOSTED, FREE_MODEL, computerModel, freeFailed, hostedChatModel, hostedProviderPrefs, newRoute, overComputerCap, sequenceModel, type RouteState } from '../hosted-models.js';
import { claudeTurn } from './claude.js';
import { sendAck, ackedThisTurn, ACK_NOTE } from './ack.js';
import { repairOutput } from './output-repair.js';
import { db, now } from '../db.js';
import { planRequired } from '../plans.js';
import { env } from '../env.js';
import { newId, sha256 } from '../lib/ids.js';
import { hub } from '../lib/hub.js';
import { appendHistory, appendRow, emitBot, getBotRow, getRow, listRows, loadHistory, setLive, updateRow } from '../store.js';
import type { MessageBody, RowBody, ToolCallBody } from '../types.js';
import { visibleTranscriptRows } from '../lib/message-text.js';
import { toolkitInfo } from '../composio.js';
import { systemPrompt } from './prompt.js';
import { repairHistory } from './history.js';
import { maybeCompact, noteUsage } from './memory.js';
import { appToolCall, appToolCallLoose, activityFor, functionSchemas, humanizeSlug, policyKeys, policyFor, runComposioTool, toolMap, type ToolCtx, type ToolResult } from './tools.js';


export type Trigger = (
  | { type: 'user'; desktopTarget?:DesktopTarget|null; text: string; imageIds?: string[]; fileIds?: string[] }
  | { type: 'routine'; routineId: string; name: string; prompt: string }
  | { type: 'bot'; fromBotId: string; fromName: string; fromGeneration?:number; text: string; depth: number }
  | { type: 'system'; text: string; imageIds?: string[]; fileIds?: string[] }
  | { type: 'resume' }) & {generation?:number; providerOverride?: string; tried?: string[];
  /** Runs once this trigger's turn has finished (group chats use it to deliver a reply that wasn't posted). */
  afterTurn?: () => void;
  /** Already read by the running turn (the owner wrote mid-task): its own queued turn is skipped. */
  consumed?: boolean};

/**
 * The owner writes while a Bot is working ("???", "is it done?", "use Arabic"): instead of waiting for the whole
 * job to finish, the message reaches the running turn at its next step, so the Bot answers at once and carries on.
 * Only plain text on Badr's own step loop; anything with attachments waits its turn as before.
 */
const loopRunning = new Map<string, number>();
const midTurn = new Map<string, Trigger[]>();

/** The model provider the current turn of each bot actually runs on (after any fallback). */
const turnProvider = new Map<string, string>();
/** OpenRouter's built-in web search for any model: the Parallel engine in fast mode (about $0.001 a search). */
const OPENROUTER_WEB_SEARCH = { type: 'openrouter:web_search', parameters: { engine: process.env.OR_SEARCH_ENGINE ?? 'parallel', mode: 'fast', max_results: 5, max_uses: 3 } };

/**
 * Loop watcher: how many times a lookup tool may run in one turn. Past it the bot is told to stop and
 * answer with what it found (cheap models otherwise keep trying more search words or pages).
 */
const REPEAT_LIMITS: Record<string, number> = { search_email: 6, read_email: 6, read_page: 8, team_updates: 4, search_conversation: 4, recall: 4, COMPOSIO_SEARCH_TOOLS: 3, COMPOSIO_MULTI_EXECUTE_TOOL: 8 };

/** Cheap-first routing state for computer work on Fino's own OpenRouter key, per running turn. */
const routes = new Map<string, RouteState>();

interface PendingState {
  /** function_call items still to process, in order. */
  calls: { call_id: string; name: string; arguments: string; rowSeq: number }[];
  /** outputs already produced for this batch. */
  outputs: any[];
  approvalId: string;
  depth: number;
  generation?:number;
  /** The pending approval is an employee-rule final step: only the owner's click may resolve it. */
  decisive?: boolean;
}

const MAX_STEPS = 60;
const KEEP_IMAGES = 3;

// ---------- per-bot serial queue ----------

const queues = new Map<string, Promise<void>>();
const aborts = new Map<string, AbortController>();
/** Bumped by Stop: work queued before it (Bot messages, routines, check-ins) is dropped; the owner's own messages still run. */
const stopEpoch = new Map<string, number>();

export function enqueue(botId: string, trigger: Trigger) {
  // No plan yet (or it ended): nothing runs, including check-ins, routines and messages from other bots.
  if (planRequired(getBotRow(botId)?.user_id)) return;
  // A paused Bot does nothing on its own: no routines, triggers, check-ins, group or Bot messages.
  // A message from the owner wakes it up again.
  if (isPaused(botId)) {
    if (trigger.type !== 'user') return;
    setPaused(botId, false);
    emitBot(botId);
  }
  trigger={...trigger,generation:trigger.generation??(db.prepare('SELECT generation FROM bots WHERE id=?').get(botId) as any)?.generation};
  if(trigger.type==='user'&&trigger.desktopTarget===undefined)trigger={...trigger,desktopTarget:desktopForTrigger(getBotRow(botId)?.user_id,'user')};
  if (trigger.type === 'user' && loopRunning.get(botId) === trigger.generation && !trigger.imageIds?.length && !trigger.fileIds?.length && trigger.text.trim())
    midTurn.set(botId, [...(midTurn.get(botId) ?? []), trigger]);
  const prev = queues.get(botId) ?? Promise.resolve();
  const epoch = stopEpoch.get(botId) ?? 0;
  const next = prev.then(() => (trigger.type !== 'user' && (stopEpoch.get(botId) ?? 0) !== epoch ? undefined : runTurn(botId, trigger))).catch((e) => console.error('[agent] turn failed', botId, e)).finally(() => { try { trigger.afterTurn?.(); } catch { /* best effort */ } });
  queues.set(botId, next);
  next.finally(() => { if (queues.get(botId) === next) queues.delete(botId); });
}

/**
 * After a restart (a deploy, a crash), steps that were running when the server stopped stay "running" forever and the
 * bot never answers. On startup: mark those steps stopped, and let each bot that was cut off in the last 6 hours pick
 * the task up again from where it was, in the same chat.
 */
export function recoverInterruptedTurns() {
  const cutoff = now() - 6 * 3600_000;
  const stale = db.prepare("SELECT bot_id, generation, seq, body, created_at FROM rows WHERE kind='tool-call' AND json_extract(body,'$.status')='running'").all() as { bot_id: string; generation: number; seq: number; body: string; created_at: number }[];
  const resume = new Map<string, { generation: number; step: string }>();
  for (const r of stale) {
    let body: ToolCallBody;
    try { body = JSON.parse(r.body); } catch { continue; }
    inChat(r.bot_id, r.generation, () => updateRow(r.bot_id, r.seq, { ...body, status: 'error', summary: 'Stopped: Badr restarted during this step.' }));
    if (r.created_at >= cutoff) resume.set(r.bot_id, { generation: r.generation, step: body.label || body.name });
  }
  for (const [botId, { generation, step }] of resume) {
    if (!getBotRow(botId)) continue;
    console.log(`[agent] resuming ${botId} after a restart (cut off at: ${step})`);
    enqueue(botId, { type: 'system', generation, text: `Badr restarted while you were working, so your last step ("${step}") was cut off before it finished. Look at what you already did, then finish the owner's last request from there. Don't start over unless you must, and keep any note about the restart to one short line.` });
  }
}

export function interrupt(botId: string) {
  stopEpoch.set(botId, (stopEpoch.get(botId) ?? 0) + 1);
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

/**
 * Keep only recent screenshots inline; older ones become a short caption. Captions are added in batches
 * of IMAGE_BATCH, so the start of the request stays byte-for-byte the same for several steps in a row
 * and the provider's prompt cache keeps hitting (replacing one old screenshot per step broke it every step).
 */
const IMAGE_BATCH = 4;

/**
 * Long tool results (pages, files, search results) from earlier requests are shortened: the bot already used them,
 * and re-sending 12k characters of an old page on every step is what made long chats slow and costly. The current
 * and previous request keep their full results. The cut only moves when a new message arrives, so within a turn
 * the request stays identical step to step and the prompt cache keeps hitting.
 */
const KEEP_FULL_TURNS = 2, OLD_OUTPUT_CHARS = 1200, OLD_ARGS_CHARS = 2000, KEEP_RECENT_ITEMS = 30, CUT_STEP = 20;
/**
 * Every step re-sends the whole conversation, so old bulk is shortened before it goes out (the stored history
 * stays whole): tool results, and the long inputs of old tool calls (scripts written with save_file or shell).
 * "Old" is before the last two owner messages, or, inside one long job, before the latest 30 steps. That boundary
 * moves in blocks of 20, so the start of the conversation stays the same between steps and is read from cache.
 * (Lina's design job re-sent ~250k tokens a step: her scripts and their outputs, all from one long turn.)
 */
export function trimOldToolOutputs(items: any[]): any[] {
  let turns = 0, turnCut = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it?.role === 'user' && it?.type !== 'function_call_output' && ++turns === KEEP_FULL_TURNS) { turnCut = i; break; }
  }
  const recentCut = Math.floor(Math.max(0, items.length - KEEP_RECENT_ITEMS) / CUT_STEP) * CUT_STEP;
  const cut = Math.max(turnCut, recentCut);
  if (cut <= 0) return items;
  return items.map((it, i) => {
    if (i >= cut) return it;
    if (it?.type === 'function_call_output' && typeof it.output === 'string' && it.output.length > OLD_OUTPUT_CHARS * 1.5)
      return { ...it, output: `${it.output.slice(0, OLD_OUTPUT_CHARS)}\n…[older result shortened to save space; call the tool again if you need the rest]` };
    if (it?.type === 'function_call' && typeof it.arguments === 'string' && it.arguments.length > OLD_ARGS_CHARS * 1.5)
      return { ...it, arguments: JSON.stringify({ _note: 'older call: its long input was shortened to save space (its result follows)', start: it.arguments.slice(0, 600) }) };
    return it;
  });
}
/** Models whose hosts turned images away ("No endpoints found that support image input"): they get text in their place. */
const textOnlyModels = new Set<string>();
const IMAGE_REFUSED = /support image input|image input is not supported|does not support image/i;
/** Every image in the request becomes a short note, for a model that can't see. */
function withoutImages(items: any[]): any[] {
  const note = { type: 'input_text', text: '[an image was here; this model cannot see images]' };
  return items.map((it) => {
    if (Array.isArray(it?.content) && it.content.some((c: any) => c?.type === 'input_image')) return { ...it, content: it.content.map((c: any) => (c?.type === 'input_image' ? note : c)) };
    if (it?.type === 'function_call_output' && Array.isArray(it.output) && it.output.some((c: any) => c?.type === 'input_image')) return { ...it, output: it.output.filter((c: any) => c?.type !== 'input_image').map((c: any) => c?.text ?? '').join('\n') || note.text };
    return it;
  });
}
function pruneImages(items: any[]): any[] {
  const hasImage = (it: any) => {
    const content = it?.type === 'function_call_output' ? it.output : it?.role === 'user' ? it.content : null;
    return Array.isArray(content) && content.some((c: any) => c?.type === 'input_image');
  };
  const total = items.filter(hasImage).length;
  const drop = Math.max(0, Math.floor((total - KEEP_IMAGES) / IMAGE_BATCH) * IMAGE_BATCH);
  let seen = 0;
  const out = [...items];
  for (let i = 0; i < out.length && seen < drop; i++) {
    const it = out[i];
    if (!hasImage(it)) continue;
    const content = it.type === 'function_call_output' ? it.output : it.content;
    seen++;
    const replaced = content.map((c: any) => (c?.type === 'input_image' ? { type: 'input_text', text: '[older screenshot omitted]' } : c));
    out[i] = it.type === 'function_call_output' ? { ...it, output: replaced } : { ...it, content: replaced };
  }
  return out;
}

/**
 * Some Responses-API providers (OpenRouter) only accept text in a tool's reply. Move each tool reply's
 * screenshots into a user message placed right after that group of tool replies.
 */
function imagesOutOfToolReplies(items: any[]): any[] {
  const out: any[] = [];
  let pending: any[] = [];
  const flush = () => {
    if (pending.length) out.push({ role: 'user', content: [{ type: 'input_text', text: 'Screenshot returned by the tool call above:' }, ...pending] });
    pending = [];
  };
  for (const it of items) {
    if (it?.type === 'function_call_output' && Array.isArray(it.output)) {
      const text = it.output.filter((c: any) => c?.type !== 'input_image').map((c: any) => c?.text ?? '').filter(Boolean).join('\n');
      pending.push(...it.output.filter((c: any) => c?.type === 'input_image'));
      out.push({ ...it, output: text || 'Done. Screenshot attached below.' });
      continue;
    }
    if (it?.type !== 'function_call_output') flush();
    out.push(it);
  }
  flush();
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
 if(trigger.consumed)return;
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
  routes.set(botId, newRoute());
  const ctrl = new AbortController();
  aborts.set(botId, ctrl);
  const turn = beginTurn(botId);
  let depth = trigger.type === 'bot' ? trigger.depth : 0;

  const ctx: ToolCtx = { userId, botId, signal: ctrl.signal, desktopProof:{used:false},desktopTarget:localDesktopTarget(), enqueueBotMessage:(from,to,text,level)=>enqueueBotMessage(from,to,text,level,trigger.type==='bot'&&to===trigger.fromBotId?trigger.fromGeneration:undefined), depth, directUserRequest: trigger.type === 'user' ? trigger.text : undefined };
  let completed=false;
  const firstSeq = (db.prepare('SELECT next_seq FROM bots WHERE id=?').get(botId) as any)?.next_seq ?? 0;
  setLive(botId, { isRunning: true, activity: { kind: 'thinking', since: now() }, awaiting: null, startedAt: now() });
  // The bot has read the person's message: mark it seen (shown under the message, like a chat app).
  if (trigger.type === 'user') {
    const asked = listRows(botId, { limit: 12 }).reverse().find((r) => r.body.type === 'message' && r.body.role === 'user' && !r.body.from);
    if (asked && asked.body.type === 'message' && !asked.body.seenAt) updateRow(botId, asked.seq, { ...asked.body, seenAt: now() });
  }

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
      // A group post, another Bot or a routine woke it: remind it which language the owner reads (Nour answered
      // the owner in English after writing in the Family group).
      if (trigger.type !== 'user' && typeof item.content === 'string') { const lang = ownerLanguageFromChat(userId, botId); if (lang) item.content += `\n\n[Anything you write to the owner: ${lang === 'ar' ? 'Arabic, in their own dialect' : 'their language (usually English), not Arabic'}.]`; }
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
            if(!st.decisive&&policyFor(userId,name,args,botId).decision==='allow'){resolveApproval(userId,st.approvalId,'allow');break;}
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
        // Real work gets a quick "got it, you want…" before the main model starts planning.
        if (trigger.type === 'user' && !tried.length) await sendAck(userId, botId, provider, trigger.text, ctrl.signal);
      }
    }

    // Connected apps go through the connected_apps tool (list_tools, then execute). Sending Composio's own five
    // meta tools as well cost ~5k tokens on every step, and bots almost never called them directly.
    const tools = [
      ...functionSchemas(),
      { type: 'web_search' },
      { type: 'x_search' },
    ];

    loopRunning.set(botId, bot.generation);
    for (let step = 0; step < MAX_STEPS; step++) {
      if (ctrl.signal.aborted) throw new Error('interrupted');
      // Messages the owner sent while this turn was working join it here.
      const waiting = (midTurn.get(botId) ?? []).filter((t) => !t.consumed && t.generation === bot.generation);
      midTurn.delete(botId);
      if (waiting.length) {
        for (const t of waiting) t.consumed = true;
        appendHistory(botId, [
          ...waiting.map((t) => ({ role: 'user', content: (t as { text: string }).text })),
          { role: 'user', content: '[System notice] The owner sent the message above while you were working. If it is a question or a nudge ("??", "done?"), answer it now in one or two short lines: where you are and what is left. Then carry on with the work. If it changes the task, follow the new instruction.' },
        ]);
        for (const r of listRows(botId, { limit: 20 })) if (r.body.type === 'message' && r.body.role === 'user' && !r.body.from && !r.body.seenAt) updateRow(botId, r.seq, { ...r.body, seenAt: now() });
      }
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
      const route = routes.get(botId);
      if (route) {
        const screen = calls.filter((c: any) => /^(computer_|open_browser)/.test(c.name));
        route.computer = screen.length > 0;
        route.screenRun = screen.length ? route.screenRun + 1 : 0;
        if (!route.escalated)
          for (const c of screen) {
            const out = st.outputs.find((o: any) => o.call_id === c.call_id)?.output;
            const text = typeof out === 'string' ? out : '';
            if (text.startsWith('Tool error') || text.includes('did not change')) route.trouble++;
          }
      }
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
          // Badr's own session/weekly/monthly limit: offer a bigger plan, or say exactly when it comes back.
          ...(e?.code === 'usage_limit' ? { action: 'upgrade' as const, resetsAt: e.resetsAt } : {}),
          text: e?.code === 'usage_limit' ? String(e.message) : tried.length
            ? 'All your connected models are out of usage right now. Add another model in Account → AI models, or try again later.'
            : `${PROVIDER_NAMES[provider] ?? provider} is out of usage right now. Connect another model in Account → AI models so your bots can switch automatically.`,
        });
      handled = true;
    }
    // "Connect your …" is a next step for the person, not a failure, so it is shown as is.
    const msg = ctrl.signal.aborted ? 'Stopped.' : /^Connect your /.test(String(e?.message)) ? e.message : `Something went wrong: ${e?.message ?? e}`;
    if (!handled) appendRow(botId, 'notice', { type: 'notice', text: msg, tone: ctrl.signal.aborted ? 'info' : 'error' });
    // A step this turn left "running" failed with it: say so now, so it isn't later blamed on a restart.
    for (const r of listRows(botId, { limit: 60 }))
      if (r.seq >= firstSeq && r.body.type === 'tool-call' && r.body.status === 'running')
        updateRow(botId, r.seq, { ...r.body, status: 'error', summary: ctrl.signal.aborted ? 'Stopped' : 'Failed' });
    if (!ctrl.signal.aborted) console.error('[agent]', e);
  } finally {
    // Messages that came too late for this turn run as their own turns, as before.
    loopRunning.delete(botId);
    midTurn.delete(botId);
    if (provider === 'codex' || provider === 'claude') {
      const pending = db.prepare('SELECT state FROM pending_turns WHERE bot_id=?').get(botId) as any;
      if (pending) await finishPending(ctx, JSON.parse(pending.state), 'turn-ended');
    }
    aborts.delete(botId);
    endTurn(botId, turn.id);
    routes.delete(botId);
    turnPrompts.delete(botId);
    const stillPending = db.prepare('SELECT 1 FROM pending_turns WHERE bot_id=?').get(botId);
    await finishDesktopWork(ctx,completed&&!ctrl.signal.aborted,!!stillPending);
    if (!stillPending) setLive(botId, { isRunning: false, activity: null, awaiting: null, startedAt: null });
    // A scheduled check that found nothing leaves no trace: its "Running routine" line, steps and empty reply go.
    if (trigger.type === 'routine') { try { hideQuietRoutine(botId, trigger.routineId); } catch (e) { console.warn('[routine] tidy', (e as Error).message); } }
    // A new reply the person hasn't read yet: the bot stands out in the list until they open it.
    const replied = db.prepare("SELECT 1 FROM rows WHERE bot_id=? AND seq>=? AND kind='message' AND json_extract(body,'$.role')='assistant' AND json_extract(body,'$.replaced') IS NULL AND length(coalesce(json_extract(body,'$.text'),''))>0 LIMIT 1").get(botId, firstSeq);
    // Only the private chat counts: work in a group's hidden thread shows in the group, not as unread on the Bot.
    if (replied && (trigger.generation === undefined || trigger.generation === getBotRow(botId)?.generation)) db.prepare('UPDATE bots SET unread = unread + 1 WHERE id=?').run(botId);
    emitBot(botId);

  }
}

/** Marks a finished routine run as replaced (hidden everywhere) when it produced nothing worth showing. */
export function hideQuietRoutine(botId: string, routineId: string) {
  const gen = getBotRow(botId)?.generation;
  const start = db.prepare("SELECT seq FROM rows WHERE bot_id=? AND generation=? AND kind='event' AND json_extract(body,'$.event')='routine-run' AND json_extract(body,'$.ref')=? ORDER BY seq DESC LIMIT 1").get(botId, gen, routineId) as { seq: number } | undefined;
  if (!start) return;
  const run = listRows(botId, { limit: 500 }).filter((r) => r.seq >= start.seq && !r.body.replaced);
  // Stop at the next person's message or routine run: only this run's own rows are judged.
  const end = run.findIndex((r, i) => i > 0 && ((r.body.type === 'message' && r.body.role === 'user') || (r.body.type === 'event' && r.body.event === 'routine-run')));
  const mine = end < 0 ? run : run.slice(0, end);
  if (!mine.length || visibleTranscriptRows(mine).length) return;
  for (const r of mine) updateRow(botId, r.seq, { ...r.body, replaced: true } as RowBody);
}

/** The system prompt of each bot's running turn (see callModel). */
const turnPrompts = new Map<string, string>();

/** Run function calls in order. Returns true if the turn paused for approval. */
async function processCalls(ctx: ToolCtx, st: PendingState): Promise<boolean> {
  const { botId, userId } = ctx;
  if(st.generation&&st.generation!==getBotRow(botId).generation)return inChat(botId,st.generation,()=>processCalls(ctx,st));
  st.generation??=getBotRow(botId).generation;
  while (st.calls.length) {
    if (ctx.signal?.aborted) throw new Error('Stopped.');
    const c = st.calls[0];
    const args = safeParse(c.arguments) ?? {};
    const row = getRow(botId, c.rowSeq);
    const body = (row?.body ?? {}) as ToolCallBody;

    // Was this call just approved/denied?
    const ap = st.approvalId ? (db.prepare('SELECT * FROM approvals WHERE id=?').get(st.approvalId) as any) : null;
    const answered = !!ap && ap.call_id === c.call_id;
    // Employee rules come first and hold in every mode: money is never touched, final steps wait for the owner.
    let guard: Guard = {};
    if (!answered) {
      const inner = c.name === 'connected_apps' && args?.operation === 'execute' ? appToolCallLoose(args) : { name: c.name, args };
      try { guard = await employeeGuard(userId, botId, inner.name, inner.args, { pageCheck: !ctx.desktopTarget }); } catch { guard = {}; }
      // The owner pressed Take control: stay off the shared computer until they hand it back.
      if (!guard.block && !ctx.desktopTarget && userInControl(userId) && (c.name.startsWith('computer_') || ['open_browser', 'read_page'].includes(c.name)))
        (noteWaitingForHandback(userId, botId), guard = { block: 'The owner has taken control of your computer right now. Do not use it. Tell them briefly what you were about to do, and that you will continue when they press "I\'m done" or simply tell you to go ahead in the chat.' });
    }
    let decision = policyFor(userId, c.name, args, botId).decision;
    // The owner's own rules in plain words ("ask me before replying to an email"). They can make a Bot ask or stop,
    // and can skip an ordinary question, but never the employee rules or a check that needs a fresh OK.
    let ruleAsk: string | undefined, ruleNever: string | undefined;
    if (!answered && !guard.block && decision !== 'block') {
      const base = policyFor(userId, c.name, args, botId);
      if (!base.safe) {
        const tk = base.toolkit ? await toolkitInfo(base.toolkit) : undefined;
        const verdict = await reviewAction(userId, botId, `${plainSummary(c.name, args, base.title, tk?.name)} [${base.title}]`);
        if (verdict?.decision === 'never') ruleNever = verdict.rule!.action;
        else if (verdict?.decision === 'ask' && decision === 'allow') ruleAsk = verdict.rule?.action ?? '';
        else if (verdict?.decision === 'allow' && decision === 'ask' && !base.requiresFreshApproval && !guard.decide) decision = 'allow';
      }
    }
    if (ruleNever !== undefined) {
      const res = { output: `The owner's rule says never to do this ("${ruleNever}"). Do not retry it or work around it. Tell the owner briefly what you could not do because of their rule.`, summary: 'Not allowed by your rule' };
      updateRow(botId, c.rowSeq, { ...body, status: 'denied', summary: 'Not allowed by your rule' });
      st.outputs.push({ type: 'function_call_output', call_id: c.call_id, output: res.output });
      st.calls.shift();
      continue;
    }
    if (guard.block) {
      decision = 'block';
    } else if (answered) {
      if (ap.status === 'pending') return true;
      decision = ap.status === 'denied' || decision === 'block' ? 'block' : 'allow';
      st.approvalId = '';
      st.decisive = false;
    } else if (decision === 'ask' || guard.decide || ruleAsk !== undefined) {
      const base = policyFor(userId, c.name, args, botId);
      const pol = guard.decide ? { ...base, safetyReason: guard.decide, requiresFreshApproval: true } : ruleAsk !== undefined ? { ...base, requiresFreshApproval: true } : base;
      const approvalArgs = c.name === 'connected_apps' ? appToolCallLoose(args).args : args;
      const approvalId = newId('apr');
      const tk = pol.toolkit ? await toolkitInfo(pol.toolkit) : undefined;
      // A saved grant may have arrived while toolkit metadata was loading.
      if(!guard.decide&&ruleAsk===undefined&&policyFor(userId,c.name,args,botId).decision!=='ask')continue;
      const botName = getBotRow(botId).name;
      const summary = guard.decide && guard.title ? `Press “${guard.title}”` : plainSummary(c.name, args, pol.title, tk?.name);
      const technical = c.name === 'shell' ? String(args?.command ?? '') : describeArgs(approvalArgs);
      const card = appendRow(botId, 'card', {
        type: 'card', card: 'approval', approvalId, title: `${botName} wants to: ${summary}`,
        summary, reason: pol.safetyReason, technical,
        detail: [summary, pol.safetyReason, technical].filter(Boolean).join('\n\n'), requiresFreshApproval:pol.requiresFreshApproval, decisive: !!guard.decide, ...(ruleAsk ? { rule: ruleAsk } : {}), tool: pol.key, toolkit: pol.toolkit, toolkitName: tk?.name, logo: tk?.logo, args: approvalArgs, policyKeys: policyKeys(c.name,args), status: 'pending',
      });
      db.prepare('INSERT INTO approvals(id,bot_id,row_seq,call_id,tool,status,created_at,generation) VALUES (?,?,?,?,?,?,?,?)').run(approvalId, botId, card.seq, c.call_id, pol.key, 'pending', now(),getBotRow(botId).generation);
      updateRow(botId, c.rowSeq, { ...body, status: 'awaiting-approval' });
      st.approvalId = approvalId;
      // A card a rule asked for waits for the owner too: a saved "Always allow" doesn't answer it.
      st.decisive = !!guard.decide || ruleAsk !== undefined;
      db.prepare('INSERT OR REPLACE INTO pending_turns(bot_id,state) VALUES (?,?)').run(botId, JSON.stringify(st));
      setLive(botId, { isRunning: false, activity: { kind: 'waiting_for_you', since: now() }, awaiting: { reason: humanizeSlug(pol.key), since: now() } });
      hub.emit(userId, { type: 'tasks', botId });
      return true;
    }

    let res: ToolResult;
    if (decision === 'block') {
      res = guard.block
        ? { output: `Blocked by Badr's employee rules: ${guard.block} Do not retry it or work around it in any other way.`, summary: 'Blocked: never pays' }
        : { output: 'The user declined this action. Do not retry it. Find another way, or tell the user what you could not do.', summary: 'Not allowed' };
      updateRow(botId, c.rowSeq, { ...body, status: 'denied', summary: 'Not allowed' });
    } else {
      const act = activityFor(c.name);
      const pol = policyFor(userId, c.name, args, botId);
      const detail = c.name === 'send_to_bot' ? String(args.bot_name ?? '') : !toolMap.has(c.name) && pol.toolkit ? (await toolkitInfo(pol.toolkit))?.name ?? pol.toolkit : undefined;
      setLive(botId, { isRunning: true, activity: { kind: c.name === 'send_to_bot' ? 'messaging_named' : act.kind, detail, since: now() }, awaiting: null });
      try {
        const impl = toolMap.get(c.name);
        const route = routes.get(botId);
        const used = route ? (route.uses[c.name] = (route.uses[c.name] ?? 0) + 1) : 0;
        if (REPEAT_LIMITS[c.name] && used > REPEAT_LIMITS[c.name])
          res = { output: `You already used ${c.name} ${used - 1} times for this request. Stop searching and answer now with what you found; say clearly what you could not find.`, summary: 'Stopped repeating' };
        else if(ctx.desktopTarget&&DESKTOP_TOOLS.has(c.name)){res=await runDesktopTool(userId,ctx.desktopTarget,c.name,args);if(ctx.desktopProof)ctx.desktopProof.used=true;}
        else res = await raceAbort(impl ? impl.impl(args, { ...ctx, depth: st.depth }) : runComposioTool(ctx, c.name, args), ctx.signal);
        if(res.endTurn&&ctx.desktopProof)ctx.desktopProof.deferred=true;
        if(!toolMap.has(c.name)||[...BROWSER_TOOL_NAMES,'connected_apps','read_file','read_page','team_updates','search_email','read_email','view_photo','computer_screenshot','computer_click','computer_type','computer_key','computer_scroll','computer_drag','shell','open_browser','recall','search_conversation'].includes(c.name))res={...res,output:externalToolOutput(userId,botId,c.name,res.output)};
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

/** "Answer in English" when the owner's last typed message has no Arabic letters, "in Arabic" when it does. */
/** Badr's chat voice, repeated next to each reply for the hosted models (they drift into report formatting). */
const CHAT_STYLE = ' Write like a confident colleague texting: plain sentences and, when useful, a few simple bullets. No headings, no --- lines, no emojis, no bold on every line; a table only for many rows of numbers. Lead with the answer or the result, say plainly what you did and found, and ask at most one question at the end.';
/** Whether the owner's latest own message (not a routine or another Bot) is in Arabic. */
/**
 * The language the owner writes in: from their own latest message; when this Bot has none yet (a new teammate whose
 * only messages came from the Chief of Staff, or a routine), from those messages and its job instead. A new Bot whose
 * job arrived in Arabic used to count as "not Arabic" and ran on the free model that slips foreign letters into Arabic.
 */
function ownerLanguage(history: any[]): 'ar' | 'other' | null {
  let fallback: 'ar' | 'other' | null = null;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h?.role !== 'user') continue;
    const text = typeof h.content === 'string' ? h.content : Array.isArray(h.content) ? h.content.map((c: any) => c?.text ?? '').join(' ') : '';
    if (!text.trim() || /^\[System notice/.test(text)) continue;
    if (/^\[(?:From|Routine|Message from)/.test(text)) { fallback ??= /[\u0600-\u06FF]/.test(text) ? 'ar' : /[a-z]{3,}/i.test(text) ? 'other' : null; continue; }
    if (shortLatin(text) && i > 0 && earlierOwnerText(history, i)) continue;
    return /[\u0600-\u06FF]/.test(text) ? 'ar' : /[a-z]{3,}/i.test(text) ? 'other' : fallback;
  }
  return fallback;
}
/** The owner's language from what they last wrote to this Bot, else to their Chief of Staff (for engines whose history lives elsewhere). */
function ownerLanguageFromChat(userId: string, botId: string): 'ar' | 'other' | null {
  const primary = (db.prepare('SELECT id FROM bots WHERE user_id=? AND is_primary=1').get(userId) as { id?: string } | undefined)?.id;
  for (const id of [botId, primary]) {
    if (!id) continue;
    const mine = listRows(id, { limit: 80 }).reverse().find((r) => r.body.type === 'message' && r.body.role === 'user' && !r.body.from && !shortLatin(r.body.text ?? '') && (r.body.text ?? '').trim());
    if (mine?.body.type === 'message') return /[\u0600-\u06FF]/.test(mine.body.text) ? 'ar' : 'other';
  }
  return null;
}
function ownerWritesArabic(history: any[]): boolean {
  return ownerLanguage(history) === 'ar';
}

/** "yes", "ok", "go ahead": a few Latin words say nothing about the language the owner writes in. */
const shortLatin = (text: string) => !/[\u0600-\u06FF]/.test(text) && text.trim().split(/\s+/).length <= 3 && text.trim().length <= 24;
const earlierOwnerText = (history: any[], before: number) => history.slice(0, before).some((h: any) => {
  if (h?.role !== 'user') return false;
  const t = typeof h.content === 'string' ? h.content : Array.isArray(h.content) ? h.content.map((c: any) => c?.text ?? '').join(' ') : '';
  return !!t.trim() && !/^\[(?:From|Routine|Message from|System notice)/.test(t) && !shortLatin(t);
});
function replyLanguageNote(history: any[]): string {
  const lang = ownerLanguage(history);
  if (lang === 'ar') return `\nThe owner writes in Arabic: answer in Arabic, in their dialect.${CHAT_STYLE} In Arabic, start every sentence and every bullet with Arabic words and put English names or terms after them ("الفواتير من Wispr وSupabase…", not "Wispr, Supabase: …"), so each line reads right to left.`;
  if (lang === 'other') return `\nThe owner does not write in Arabic: answer in their language (usually English), never in Arabic.${CHAT_STYLE}`;
  return '';
}

// ---------- model call with streaming into a message row ----------

/** How many model calls this Bot's current message has made so far (0 on the first), for the default model's sequence. */
const turnSteps = new Map<string, { turn: string; n: number }>();
function stepOfTurn(botId: string): number {
  const turn = currentTurn(botId)?.id ?? '';
  const s = turnSteps.get(botId);
  if (!s || s.turn !== turn) { turnSteps.set(botId, { turn, n: 1 }); return 0; }
  return s.n++;
}

async function callModel(ctx: ToolCtx, tools: any[], signal: AbortSignal): Promise<{ output: any[] }> {
  const { botId, userId } = ctx;
  const bot = getBotRow(botId);
  // Runs inside the bot's serial queue, so compaction can't race a turn.
  const history = await maybeCompact(botId, loadHistory(botId)).catch(() => loadHistory(botId));
  // The model is only called when no approval is pending, so every orphaned call can be repaired.
  const history2 = trimOldToolOutputs(pruneImages(repairHistory(history)));
  // Built once per turn: a memory saved mid-turn (remember, update_memory) would otherwise change the prompt on
  // the next step and throw away the whole cached conversation. It shows up from the next turn.
  let prompt = turnPrompts.get(botId);
  if (prompt === undefined) turnPrompts.set(botId, (prompt = await systemPrompt(userId, botId, { withTime: false })));
  const input: any[] = [{ role: 'system', content: prompt }, ...history2];

  const active = turnProvider.get(botId) ?? bot.agent_provider;
  const provider = (LOOP_PROVIDERS as string[]).includes(active) ? (active as LoopProvider) : 'xai';
  const llm = loopClient(userId, provider, provider === bot.agent_provider ? bot.model : null);
  if (provider !== 'xai') input.splice(1, input.length - 1, ...imagesOutOfToolReplies(history2));
  // The clock goes last (to the minute), so everything before it is the same as the previous step and is read from cache.
  // The language goes last too: cheap models drift into Arabic (the product is called Badr) unless told plainly.
  input.push({ role: 'system', content: `Current time: ${new Date().toISOString().slice(0, 16)}Z${replyLanguageNote(history2)}${ackedThisTurn(botId) && history2.at(-1)?.role === 'assistant' ? ACK_NOTE : ''}` });
  // On Fino's own key, screen steps run on a cheap vision model and move up only when it struggles.
  const route = routes.get(botId);
  let model = llm.model;
  if (llm.hosted && route?.computer) {
    model = computerModel(userId, route);
    if (!route.escalated) route.cheapSteps++;
  } else if (llm.hosted) {
    model = hostedChatModel(userId, llm.model);
    // The default model runs as a sequence: free first, then Badr 4.8, and Badr 5.1 once a message runs long.
    if (model === DEFAULT_HOSTED) model = sequenceModel(userId, stepOfTurn(botId), { arabic: ownerWritesArabic(history2) });
  }
  const body: any = {
    model,
    input,
    tools: llm.xaiExtras
      ? tools
      : [...tools.filter((t: any) => t.type === 'function'), ...(provider === 'openrouter' ? [OPENROUTER_WEB_SEARCH] : [])],
    // Fino's included models answer with light thinking (much faster).
    reasoning: { effort: llm.hosted ? (process.env.OR_EFFORT ?? 'low') : (bot.effort ?? 'medium') },
    // On Fino's key, OpenRouter's default routing (cheapest healthy host) plus a session id keeps every step of
    // a conversation on one host, so its prompt cache hits: cached input costs ~1/50th on DeepSeek. Sorting by
    // throughput hopped between hosts (no cache) and often picked pricier ones. A user's own key keeps speed first.
    ...(provider === 'openrouter'
      ? {
          session_id: `fino:${botId}:${bot.generation}`,
          ...(llm.hosted ? { provider: { ...hostedProviderPrefs(), ...(process.env.OR_PROVIDER_SORT ? { sort: process.env.OR_PROVIDER_SORT } : {}) } } : { provider: { sort: 'throughput' } }),
        }
      : {}),
    store: false,
    stream: true,
    ...(llm.xaiExtras
      ? { include: ['reasoning.encrypted_content'], prompt_cache_key: `grokbot:${botId}:${bot.generation}`, safety_identifier: sha256(userId).slice(0, 32) }
      : {}),
  };

  let stream: any;
  const callStart = now();
  if (textOnlyModels.has(body.model)) body.input = withoutImages(body.input);
  try {
    try {
      stream = await llm.client.responses.create(body, { signal });
    } catch (e: any) {
      if (llm.hosted && /exceed your available credits|insufficient credits|more credits/i.test(String(e?.message)) && body.model !== DEFAULT_HOSTED && !signal.aborted) {
        // Badr's OpenRouter balance is low: an expensive model's step is refused up front, a cheap one still fits.
        console.warn(`[route] ${body.model} refused for low credit; this step runs on ${DEFAULT_HOSTED}`);
        model = body.model = DEFAULT_HOSTED;
        if (textOnlyModels.has(body.model)) body.input = withoutImages(body.input);
        stream = await llm.client.responses.create(body, { signal });
      } else if (IMAGE_REFUSED.test(String(e?.message)) && !signal.aborted) {
        // This model's hosts can't take images (one was just attached, or an older screenshot is in the history):
        // the same step goes again with notes in their place, and the model is remembered as text-only.
        textOnlyModels.add(body.model);
        body.input = withoutImages(body.input);
        stream = await llm.client.responses.create(body, { signal });
      } else
      // The free model is out for today, busy or down: the same step runs on Badr 4.8 straight away.
      if (model === FREE_MODEL && !signal.aborted) {
        freeFailed(e);
        model = body.model = DEFAULT_HOSTED;
        stream = await llm.client.responses.create(body, { signal });
      } else {
      // The cheap model refused the request (unsupported input, overloaded…): retry once on the strong one.
      if (!(route && model === COMPUTER_CHEAP && !signal.aborted && !overComputerCap(userId))) throw e;
      console.warn('[route] cheap computer model failed, escalating:', e?.message);
      route.escalated = true;
      model = body.model = COMPUTER_STRONG;
      stream = await llm.client.responses.create(body, { signal });
      }
    }
  } catch (e: any) {
    // If a Composio tool schema is rejected, retry with only our own tools.
    if (e?.status === 400 && tools.length > functionSchemas().length + 2) {
      console.warn('[agent] 400 with composio tools, retrying without:', e?.message);
      body.tools = llm.xaiExtras ? [...functionSchemas(), { type: 'web_search' }, { type: 'x_search' }] : functionSchemas();
      stream = await llm.client.responses.create(body, { signal });
    } else throw e;
  }

  let msgSeq: number | null = null;
  const msgRows: number[] = [];
  let text = '';
  let lastFlush = 0;
  let final: any = null;
  const flush = (streaming: boolean) => {
    const b: MessageBody = { type: 'message', role: 'assistant', text, streaming };
    if (msgSeq === null) msgSeq = appendRow(botId, 'message', b).seq;
    else updateRow(botId, msgSeq, b);
    lastFlush = Date.now();
  };

  try {
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
          // Still "streaming" (not shown) until the whole response is in and mended below.
          updateRow(botId, msgSeq, { type: 'message', role: 'assistant', text, streaming: true, citations: citations.length ? citations : undefined });
          msgRows.push(msgSeq);
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
  if (!final) throw new Error('model stream ended without a response');
  } catch (e: any) {
    // The free model gave up mid-answer before writing anything: rerun the step on Badr 4.8, unseen by the user.
    if (model === FREE_MODEL && msgSeq === null && !text && !signal.aborted) { freeFailed(e); return callModel(ctx, tools, signal); }
    // Whatever was written before the failure is shown as it is.
    for (const seq of msgRows) { const row = getRow(botId, seq); if (row?.body.type === 'message' && row.body.streaming) updateRow(botId, seq, { ...row.body, streaming: false }); }
    throw e;
  }
  if (msgSeq !== null) { flush(false); msgRows.push(msgSeq); }
  // Mend what some hosts break: words cut before a tool call, and tool calls that arrive as DeepSeek markup.
  final.output = repairOutput(final.output ?? [], msgRows, (seq, fixed) => {
    const row = getRow(botId, seq);
    if (row?.body.type === 'message') updateRow(botId, seq, fixed ? { ...row.body, text: fixed, streaming: false } : { ...row.body, text: '', streaming: false, replaced: true });
  });
  for (const seq of msgRows) {
    const row = getRow(botId, seq);
    if (row?.body.type === 'message' && row.body.streaming) updateRow(botId, seq, { ...row.body, streaming: false });
  }
  if (final.usage?.input_tokens) noteUsage(botId, final.usage.input_tokens, history.length);
  const meter = new TurnMeter(userId, botId, provider, model, { turnId: currentTurn(botId)?.id, startedAt: callStart });
  meter.hosted = llm.hosted;
  meter.add(final.usage);
  for (const o of final.output ?? []) if (o.type === 'function_call') meter.tool(o.name);
  meter.save();
  return { output: final.output ?? [] };
}

// ---------- misc ----------

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return undefined; }
}

/** One plain sentence about what an action will do, for the approval card. */
function plainSummary(name: string, args: any, title: string, appName?: string): string {
  if (name === 'shell') {
    const purpose = String(args?.purpose ?? '').trim();
    if (purpose) return purpose.slice(0, 200);
    const cmd = String(args?.command ?? '').trim();
    if (/^(pip3?|npm|apt(-get)?|brew)\s+install\b/.test(cmd)) return `Install software (${cmd.split(/\s+/).slice(2, 5).join(' ')})`;
    if (/^(curl|wget)\b/.test(cmd)) return `Download something from ${(/https?:\/\/([^/\s'"]+)/.exec(cmd)?.[1]) ?? 'the internet'}`;
    if (/^rm\b/.test(cmd)) return 'Delete files on its computer';
    if (/^(python3?|node|bash|sh)\s+\S+/.test(cmd)) return `Run the program ${cmd.split(/\s+/)[1]}`;
    if (/^git\s+clone\b/.test(cmd)) return 'Download a code project';
    return 'Run a command on its computer';
  }
  // Badr's own tools say what they do in plain words ("run_python" read as an app action came out "Python in run").
  const LOCAL: Record<string, string> = { run_python: 'Run Python code on its computer', browser_run_js: 'Run a script in a web page', public_link: 'Make a public link to a picture', send_email: 'Send an email', attach_file: 'Send a file into the chat' };
  if (toolMap.has(name) && name !== 'connected_apps') {
    const purpose = String(args?.purpose ?? '').trim();
    return purpose ? purpose.slice(0, 200) : LOCAL[name] ?? title;
  }
  // Connected apps: "GMAIL_SEND_EMAIL" → "Send email in Gmail", plus who/what when the arguments say.
  let slug = name, a: Record<string, unknown> = args ?? {};
  try {
    if (name === 'connected_apps') ({ name: slug, args: a } = appToolCall(args));
  } catch {}
  // A batch runs several app actions: describe the first one.
  const first = Array.isArray(a.tools) ? (a.tools as any[])[0] : null;
  if (first) {
    slug = String(first.tool_slug ?? first.slug ?? first.name ?? slug);
    a = (first.arguments ?? first.args ?? {}) as Record<string, unknown>;
  }
  const parts = slug.split('_');
  const app = appName ?? (parts[0] ? parts[0].charAt(0) + parts[0].slice(1).toLowerCase() : '');
  const verb = parts.slice(1).join(' ').toLowerCase();
  const target = ['recipient_email', 'to', 'recipient', 'channel', 'email', 'title', 'subject', 'name'].map((k) => a[k]).find((v) => typeof v === 'string' && v) as string | undefined;
  if (verb) return `${verb.charAt(0).toUpperCase() + verb.slice(1)} in ${app}${target ? ` (${String(target).slice(0, 80)})` : ''}`;
  return title;
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
