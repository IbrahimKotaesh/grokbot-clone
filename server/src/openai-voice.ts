// A second voice for calls, on trial next to Grok: OpenAI's gpt-audio through OpenRouter (the key Badr already has).
//
// gpt-audio isn't a live, always-listening model: it takes a spoken turn and answers with a spoken turn. So this relay
// gives the call screen the same realtime protocol Grok speaks (session.update, input_audio_buffer.append,
// response.create, conversation.item.create …) and does the live part itself: it listens to the microphone stream,
// notices when the caller stops talking, sends that turn as audio to gpt-audio with the call's instructions, history
// and tools, and streams the spoken answer back as realtime events. Captions, interrupting, handing work to the text
// agent (send_task) and [work_landed] notes all work unchanged in the browser.
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { allowedOrigin } from './lib/origin.js';
import { userFromCookieHeader } from './lib/auth.js';
import { hostedKey } from './hosted-models.js';
import { sonioxEnabled, sonioxTranscribe } from './soniox.js';
import { TurnMeter } from './usage-meter.js';

export const OPENAI_VOICE_MODEL = process.env.OR_VOICE_MODEL ?? 'openai/gpt-audio';
export const openaiVoiceReady = () => !!hostedKey();
/** OpenAI's two most natural voices, matched to the Bot's voice gender. */
export const openaiVoiceFor = (gender?: string) => (gender === 'male' ? 'cedar' : 'marin');

const PATH = '/api/voice/openai';
const PROTO = 'xai-client-secret.'; // the call screen offers its ticket this way for every engine
const MAX_CALL_MS = 60 * 60_000;
const OUT_RATE = 24000;

// ---------- tickets ----------
const tickets = new Map<string, { userId: string; botId: string; exp: number }>();
export function mintOpenAIVoiceTicket(userId: string, botId: string) {
  const now = Date.now();
  for (const [k, v] of tickets) if (v.exp < now) tickets.delete(k);
  const value = randomBytes(24).toString('base64url');
  tickets.set(value, { userId, botId, exp: now + 5 * 60_000 });
  return { value, expires_at: Math.floor((now + 5 * 60_000) / 1000) };
}

export function attachOpenAIVoiceRelay(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024, handleProtocols: (p) => [...p].find((x) => x.startsWith(PROTO)) ?? false });
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== PATH) return;
    const deny = (code: string) => { socket.write(`HTTP/1.1 ${code}\r\n\r\n`); socket.destroy(); };
    if (req.headers.origin && !allowedOrigin(req.headers.origin)) return deny('403 Forbidden');
    const user = userFromCookieHeader(req.headers.cookie);
    const offered = String(req.headers['sec-websocket-protocol'] ?? '').split(',').map((s) => s.trim()).find((s) => s.startsWith(PROTO));
    const ticket = offered ? tickets.get(offered.slice(PROTO.length)) : undefined;
    if (!user || !ticket || ticket.userId !== user.id || ticket.exp < Date.now() || !openaiVoiceReady()) return deny('401 Unauthorized');
    tickets.delete(offered!.slice(PROTO.length));
    wss.handleUpgrade(req, socket, head, (client) => new OpenAIVoiceCall(client, ticket.userId, ticket.botId));
  });
}

// ---------- helpers ----------
const id = (p: string) => `${p}_${randomBytes(8).toString('hex')}`;
function wav(pcm: Int16Array, rate: number): string {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]).toString('base64');
}
const rms = (s: Int16Array) => { let x = 0; for (let i = 0; i < s.length; i++) x += s[i] * s[i]; return Math.sqrt(x / Math.max(1, s.length)) / 32768; };
/** Realtime tool definitions → chat-completions tools. */
const chatTools = (tools: any[]) => (Array.isArray(tools) ? tools : []).filter((t) => t?.type === 'function' && t.name).map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));

type Msg = { role: 'user' | 'assistant' | 'tool'; content: any; tool_calls?: any[]; tool_call_id?: string };

/** One call: listens for turns, asks gpt-audio, and speaks the answer back in realtime events. */
class OpenAIVoiceCall {
  private instructions = '';
  private voice = 'marin';
  private tools: any[] = [];
  private inRate = 24000;
  private history: Msg[] = [];
  // listening
  private speaking = false;
  private loud = 0;
  private quietMs = 0;
  private turnMs = 0;
  private history10: number[] = []; // the last ~3 s of loudness, to find the room's own noise level
  private botTalkingUntil = 0;      // when the Bot's current answer finishes playing in the browser (estimate)
  private turns = 0;
  private preroll: Int16Array[] = [];
  private turn: Int16Array[] = [];
  // answering
  private abort: AbortController | null = null;
  private responseId: string | null = null;
  private cap: ReturnType<typeof setTimeout>;

  constructor(private ws: WebSocket, private userId: string, private botId: string) {
    this.cap = setTimeout(() => this.close('Call time limit reached'), MAX_CALL_MS);
    console.log('[voice:openai] call connected');
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let ev: any;
      try { ev = JSON.parse(data.toString()); } catch { return; }
      try { this.onEvent(ev); } catch (e: any) { console.warn('[voice:openai] event failed', e?.message); }
    });
    ws.on('close', () => { console.log(`[voice:openai] call closed after ${this.turns} turn(s)`); this.stop(); });
    ws.on('error', () => this.stop());
  }

  private emit(ev: Record<string, unknown>) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(ev)); }
  private close(why = '') { this.stop(); if (this.ws.readyState <= WebSocket.OPEN) this.ws.close(1000, why.slice(0, 120)); }
  private stop() { clearTimeout(this.cap); this.abort?.abort(); this.abort = null; }

  private onEvent(ev: any) {
    switch (ev.type) {
      case 'session.update': {
        const s = ev.session ?? {};
        if (typeof s.instructions === 'string') this.instructions = s.instructions;
        if (typeof s.voice === 'string' && /^[a-z]{2,20}$/.test(s.voice)) this.voice = s.voice;
        if (Array.isArray(s.tools)) this.tools = chatTools(s.tools);
        const rate = Number(s.audio?.input?.format?.rate);
        if (rate >= 8000 && rate <= 48000) this.inRate = rate;
        this.emit({ type: 'session.updated', session: { voice: this.voice } });
        return;
      }
      case 'input_audio_buffer.append': {
        if (typeof ev.audio !== 'string') return;
        const b = Buffer.from(ev.audio, 'base64');
        this.hear(new Int16Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 2)).slice());
        return;
      }
      case 'input_audio_buffer.clear':
        this.speaking = false; this.turn = []; this.preroll = []; this.loud = 0;
        return;
      case 'conversation.item.create': {
        const it = ev.item ?? {};
        if (it.type === 'function_call_output' && it.call_id) this.history.push({ role: 'tool', tool_call_id: String(it.call_id), content: String(it.output ?? '') });
        else if (it.type === 'message' && it.role === 'user') {
          const text = (it.content ?? []).map((c: any) => c?.text ?? '').join('\n').trim();
          if (text) this.history.push({ role: 'user', content: text });
        }
        return;
      }
      case 'response.create': void this.respond(); return;
      case 'response.cancel': this.cancel(); return;
    }
  }

  // ---------- listening: notices when the caller starts and stops talking ----------
  // A real microphone has automatic gain, so a quiet room still reads as a steady hiss. The room's level is the
  // quiet end of the last three seconds (15th percentile); speech has to rise well above it to start a turn, and
  // the turn ends after 0.7 s back near it. While the Bot is talking the bar is higher and must hold longer, so
  // its own voice leaking into the microphone doesn't interrupt it; a real interruption still gets through.
  private hear(chunk: Int16Array) {
    const ms = (chunk.length / this.inRate) * 1000;
    const level = rms(chunk);
    this.history10.push(level);
    if (this.history10.length > Math.round(3000 / Math.max(10, ms))) this.history10.shift();
    const sorted = [...this.history10].sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.15)] ?? 0.003;
    const botTalking = Date.now() < this.botTalkingUntil + 300;
    const startAt = Math.max(0.015, floor * 3) * (botTalking ? 2.2 : 1);
    const endAt = Math.max(0.01, floor * 1.8);
    if (!this.speaking) {
      this.preroll.push(chunk);
      let keep = 0; for (let i = this.preroll.length - 1; i >= 0; i--) { keep += this.preroll[i].length; if (keep > this.inRate * 0.35) { this.preroll.splice(0, i); break; } }
      this.loud = level > startAt ? this.loud + ms : 0;
      if (this.loud >= (botTalking ? 320 : 160)) {
        this.speaking = true; this.quietMs = 0; this.turnMs = 0; this.turn = [...this.preroll]; this.preroll = [];
        this.emit({ type: 'input_audio_buffer.speech_started' });
        this.botTalkingUntil = 0; // the browser stops playing on speech_started
      }
      return;
    }
    this.turn.push(chunk);
    this.turnMs += ms;
    this.quietMs = level < endAt ? this.quietMs + ms : 0;
    if (this.quietMs >= 700 || this.turnMs > 25_000) this.endTurn(floor);
  }

  private endTurn(floor = 0) {
    this.speaking = false; this.loud = 0;
    const parts = this.turn; this.turn = [];
    this.emit({ type: 'input_audio_buffer.speech_stopped' });
    const n = parts.reduce((a, c) => a + c.length, 0);
    if (n < this.inRate * 0.4) return; // a cough or a click, not a turn
    this.turns++;
    console.log(`[voice:openai] turn ${this.turns}: ${(n / this.inRate).toFixed(1)}s (room ${floor.toFixed(4)})`);
    const pcm = new Int16Array(n); let o = 0; for (const c of parts) { pcm.set(c, o); o += c.length; }
    const audio = wav(pcm, this.inRate);
    const itemId = id('item');
    this.emit({ type: 'input_audio_buffer.committed', item_id: itemId });
    this.emit({ type: 'conversation.item.created', item: { id: itemId, type: 'message', role: 'user', content: [{ type: 'input_audio' }] } });
    // The words become the history (sending every past turn as audio again would cost far more) and the caption.
    const entry: Msg = { role: 'user', content: '(spoken, transcript pending)' };
    this.history.push(entry);
    if (sonioxEnabled()) {
      const buf = Buffer.from(audio, 'base64');
      sonioxTranscribe(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, 'audio/wav')
        .then((t: any) => { const text = String(t?.text ?? '').trim(); entry.content = text || '(spoken, unclear)'; this.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: itemId, transcript: text }); })
        .catch(() => { entry.content = '(spoken)'; });
    }
    void this.respond({ audio, entry });
  }

  // ---------- answering ----------
  private cancel() {
    if (!this.abort) return;
    this.abort.abort();
    this.abort = null;
  }

  private async respond(turn?: { audio: string; entry: Msg }) {
    this.cancel();
    const ctrl = new AbortController();
    this.abort = ctrl;
    const responseId = (this.responseId = id('resp'));
    const itemId = id('item');
    this.emit({ type: 'response.created', response: { id: responseId } });

    const past = this.history.filter((m) => m !== turn?.entry);
    // gpt-audio leans toward answering from guesswork; one firm rule at the end of its instructions fixes that (tested).
    const rule = this.tools.some((t) => t.function?.name === 'send_task')
      ? '\n\nFirm rule: anything about the caller\'s own calendar, email, files, tasks, accounts, or about news, prices, weather or anything you can\'t know for sure, goes to send_task first. Never answer those from memory or guess, not even "nothing is scheduled". Say briefly that you are checking, call send_task, and wait for the result.'
      : '';
    const messages: any[] = [{ role: 'system', content: (this.instructions || 'You are a helpful assistant on a phone call. Speak briefly.') + rule }, ...past];
    if (turn) messages.push({ role: 'user', content: [{ type: 'input_audio', input_audio: { data: turn.audio, format: 'wav' } }] });
    else if (!this.history.length) messages.push({ role: 'user', content: '[The call just connected. Say a short, warm hello in the caller\'s language, then wait.]' });

    let transcript = '';
    let added = false;
    const calls: { id: string; name: string; args: string }[] = [];
    let usage: any = null;
    const started = Date.now();
    let slow: ReturnType<typeof setTimeout> | undefined;
    try {
      slow = setTimeout(() => ctrl.abort(new Error('timeout')), 30_000); // never leave a caller waiting in silence
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { authorization: `Bearer ${hostedKey()}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: OPENAI_VOICE_MODEL, stream: true, usage: { include: true },
          modalities: ['text', 'audio'], audio: { voice: this.voice, format: 'pcm16' },
          messages, ...(this.tools.length ? { tools: this.tools } : {}),
        }),
      });
      if (!r.ok || !r.body) throw new Error(`voice model ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
      let buf = '';
      for await (const chunk of r.body as any) {
        buf += Buffer.from(chunk).toString();
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
          let j: any; try { j = JSON.parse(line.slice(5)); } catch { continue; }
          if (j.usage) usage = j.usage;
          const d = j.choices?.[0]?.delta ?? {};
          if (d.audio?.data || d.audio?.transcript || d.content) {
            if (!added) { added = true; this.emit({ type: 'response.output_item.added', response_id: responseId, item: { id: itemId, type: 'message', role: 'assistant' } }); }
            if (d.audio?.data) {
              this.emit({ type: 'response.output_audio.delta', response_id: responseId, item_id: itemId, delta: d.audio.data });
              const secs = (d.audio.data.length * 0.75) / (OUT_RATE * 2);
              this.botTalkingUntil = Math.max(this.botTalkingUntil, Date.now()) + secs * 1000;
            }
            const words = d.audio?.transcript ?? (typeof d.content === 'string' ? d.content : '');
            if (words) { transcript += words; this.emit({ type: 'response.output_audio_transcript.delta', response_id: responseId, item_id: itemId, delta: words }); }
          }
          for (const tc of d.tool_calls ?? []) {
            const k = tc.index ?? 0;
            calls[k] ??= { id: '', name: '', args: '' };
            if (tc.id) calls[k].id = tc.id;
            if (tc.function?.name) calls[k].name += tc.function.name;
            if (tc.function?.arguments) calls[k].args += tc.function.arguments;
          }
        }
      }
    } catch (e: any) {
      clearTimeout(slow);
      const timedOut = (ctrl.signal.reason as any)?.message === 'timeout';
      if (ctrl.signal.aborted && !timedOut) {
        // Interrupted: keep what was said so far, so the model knows where it stopped.
        if (transcript) this.history.push({ role: 'assistant', content: `${transcript} …(interrupted)` });
        this.emit({ type: 'response.done', response: { id: responseId, status: 'cancelled', output: [] } });
        return;
      }
      console.warn('[voice:openai]', e?.message);
      this.emit({ type: 'error', error: { message: 'The voice service didn’t answer. Try again.' } });
      this.emit({ type: 'response.done', response: { id: responseId, status: 'failed', output: [] } });
      if (this.abort === ctrl) this.abort = null;
      return;
    }
    clearTimeout(slow);
    if (this.abort === ctrl) this.abort = null;

    const done = calls.filter((c) => c?.name).map((c) => ({ ...c, id: c.id || id('call') }));
    if (transcript) this.emit({ type: 'response.output_audio_transcript.done', response_id: responseId, item_id: itemId, transcript });
    this.history.push({ role: 'assistant', content: transcript || null, ...(done.length ? { tool_calls: done.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })) } : {}) });
    this.emit({ type: 'response.done', response: { id: responseId, status: 'completed', output: done.map((c) => ({ type: 'function_call', call_id: c.id, name: c.name, arguments: c.args || '{}' })) } });

    // What the trial costs shows on the Usage page, next to everything else.
    if (usage) {
      const m = new TurnMeter(this.userId, this.botId, 'openrouter', OPENAI_VOICE_MODEL, { startedAt: started });
      m.hosted = true;
      m.add({ input_tokens: usage.prompt_tokens ?? 0, output_tokens: usage.completion_tokens ?? 0, cost: typeof usage.cost === 'number' ? usage.cost : undefined });
      m.save();
    }
  }
}

export const OPENAI_OUT_RATE = OUT_RATE;
