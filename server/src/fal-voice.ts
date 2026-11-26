// Grok Voice through fal.ai, for servers without an xAI key. fal relays xAI's realtime events verbatim but
// frames them as MessagePack, and it needs the fal key in a header the browser can't send. So the browser
// talks the plain xAI protocol (JSON text frames) to /api/voice/relay here, and this relay re-frames it.
// The same connection also renders the short voice previews in Settings.
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { allowedOrigin } from './lib/origin.js';
import { userFromCookieHeader } from './lib/auth.js';

const FAL_REALTIME = 'wss://fal.run/xai/grok-voice/realtime';
const PROTO = 'xai-client-secret.';
const MAX_CALL_MS = 60 * 60_000; // a forgotten call can't run up the bill forever

export const falVoiceReady = () => !!process.env.FAL_KEY?.trim();

// ---------- MessagePack (only what the realtime events use) ----------

function enc(v: unknown): Buffer {
  const out: number[] = [];
  const u32 = (n: number) => out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  const go = (x: any): void => {
    if (x === null || x === undefined) { out.push(0xc0); return; }
    if (x === true) { out.push(0xc3); return; }
    if (x === false) { out.push(0xc2); return; }
    if (typeof x === 'number') {
      if (Number.isInteger(x) && x >= 0 && x < 2 ** 32) { if (x < 128) out.push(x); else { out.push(0xce); u32(x); } return; }
      if (Number.isInteger(x) && x < 0 && x >= -(2 ** 31)) { const b = Buffer.alloc(5); b[0] = 0xd2; b.writeInt32BE(x, 1); out.push(...b); return; }
      const b = Buffer.alloc(9); b[0] = 0xcb; b.writeDoubleBE(x, 1); out.push(...b); return;
    }
    if (typeof x === 'string') { const b = Buffer.from(x); if (b.length < 32) out.push(0xa0 | b.length); else { out.push(0xdb); u32(b.length); } for (const c of b) out.push(c); return; }
    if (Buffer.isBuffer(x)) { out.push(0xc6); u32(x.length); for (const c of x) out.push(c); return; }
    if (Array.isArray(x)) { out.push(0xdd); u32(x.length); x.forEach(go); return; }
    const keys = Object.keys(x).filter((k) => x[k] !== undefined);
    out.push(0xdf); u32(keys.length);
    for (const k of keys) { go(k); go(x[k]); }
  };
  go(v);
  return Buffer.from(out);
}

function dec(buf: Buffer): any {
  let i = 0;
  const str = (n: number) => { const s = buf.toString('utf8', i, i + n); i += n; return s; };
  const bin = (n: number) => { const s = buf.subarray(i, i + n); i += n; return s.toString('base64'); }; // JSON-ready
  const map = (n: number) => { const o: Record<string, unknown> = {}; for (let j = 0; j < n; j++) { const k = go(); o[k] = go(); } return o; };
  const arr = (n: number) => { const a: unknown[] = []; for (let j = 0; j < n; j++) a.push(go()); return a; };
  const u8 = () => buf[i++];
  const r = <T>(v: T, n: number) => { i += n; return v; };
  const go = (): any => {
    const t = u8();
    if (t < 0x80) return t;
    if (t >= 0xe0) return t - 256;
    if ((t & 0xf0) === 0x80) return map(t & 15);
    if ((t & 0xf0) === 0x90) return arr(t & 15);
    if ((t & 0xe0) === 0xa0) return str(t & 31);
    switch (t) {
      case 0xc0: return null; case 0xc2: return false; case 0xc3: return true;
      case 0xc4: return bin(u8()); case 0xc5: return bin(r(buf.readUInt16BE(i), 2)); case 0xc6: return bin(r(buf.readUInt32BE(i), 4));
      case 0xca: return r(buf.readFloatBE(i), 4); case 0xcb: return r(buf.readDoubleBE(i), 8);
      case 0xcc: return u8(); case 0xcd: return r(buf.readUInt16BE(i), 2); case 0xce: return r(buf.readUInt32BE(i), 4); case 0xcf: return r(Number(buf.readBigUInt64BE(i)), 8);
      case 0xd0: return r(buf.readInt8(i), 1); case 0xd1: return r(buf.readInt16BE(i), 2); case 0xd2: return r(buf.readInt32BE(i), 4); case 0xd3: return r(Number(buf.readBigInt64BE(i)), 8);
      case 0xd9: return str(u8()); case 0xda: return str(r(buf.readUInt16BE(i), 2)); case 0xdb: return str(r(buf.readUInt32BE(i), 4));
      case 0xdc: return arr(r(buf.readUInt16BE(i), 2)); case 0xdd: return arr(r(buf.readUInt32BE(i), 4));
      case 0xde: return map(r(buf.readUInt16BE(i), 2)); case 0xdf: return map(r(buf.readUInt32BE(i), 4));
    }
    throw new Error(`msgpack type 0x${t.toString(16)}`);
  };
  return go();
}

/** fal's own frames, and the empty input fields it copies onto every event, are dropped. */
function toXaiEvent(raw: Buffer, isBinary: boolean): any | null {
  const m = isBinary ? dec(raw) : JSON.parse(raw.toString());
  if (!m || typeof m !== 'object' || m.type === 'x-fal-message') return null;
  for (const k of ['prompt', 'voice', 'turn_detection', 'tools']) if (m[k] === null) delete m[k];
  return m;
}

function openFal(): WebSocket {
  return new WebSocket(FAL_REALTIME, { headers: { Authorization: `Key ${process.env.FAL_KEY?.trim()}` } });
}

// ---------- call relay ----------

const tokens = new Map<string, { userId: string; exp: number }>();
/** A one-time ticket the browser shows when it opens the relay (in place of xAI's client secret). */
export function mintRelayTicket(userId: string) {
  const now = Date.now();
  for (const [k, v] of tokens) if (v.exp < now) tokens.delete(k);
  const t = randomBytes(24).toString('base64url');
  tokens.set(t, { userId, exp: now + 5 * 60_000 });
  return { value: t, expires_at: Math.floor((now + 5 * 60_000) / 1000) };
}

export function attachVoiceRelay(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024, handleProtocols: (p) => [...p].find((x) => x.startsWith(PROTO)) ?? false });
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/api/voice/relay') return; // not ours
    const deny = (code: string) => { socket.write(`HTTP/1.1 ${code}\r\n\r\n`); socket.destroy(); };
    if (req.headers.origin && !allowedOrigin(req.headers.origin)) return deny('403 Forbidden');
    const user = userFromCookieHeader(req.headers.cookie);
    const offered = String(req.headers['sec-websocket-protocol'] ?? '').split(',').map((s) => s.trim()).find((s) => s.startsWith(PROTO));
    const ticket = offered ? tokens.get(offered.slice(PROTO.length)) : undefined;
    if (!user || !ticket || ticket.userId !== user.id || ticket.exp < Date.now() || !falVoiceReady()) return deny('401 Unauthorized');
    tokens.delete(offered!.slice(PROTO.length));
    wss.handleUpgrade(req, socket, head, (client) => relay(client));
  });
}

function relay(client: WebSocket) {
  const up = openFal();
  const pending: Buffer[] = [];
  const close = (code = 1000, why = '') => {
    clearTimeout(cap);
    if (client.readyState <= WebSocket.OPEN) client.close(code, why.slice(0, 120));
    if (up.readyState <= WebSocket.OPEN) up.close();
  };
  const cap = setTimeout(() => close(1000, 'Call time limit reached'), MAX_CALL_MS);
  client.on('message', (data, isBinary) => {
    if (isBinary) return;
    let ev: unknown;
    try { ev = JSON.parse(data.toString()); } catch { return; }
    const frame = enc(ev);
    if (up.readyState === WebSocket.OPEN) up.send(frame); else pending.push(frame);
  });
  up.on('open', () => { for (const f of pending.splice(0)) up.send(f); });
  up.on('message', (data, isBinary) => {
    try {
      const ev = toXaiEvent(data as Buffer, isBinary);
      if (ev && client.readyState === WebSocket.OPEN) client.send(JSON.stringify(ev));
    } catch (e: any) { console.warn('[voice] bad fal frame', e?.message); }
  });
  up.on('unexpected-response', (_q, res) => { console.warn('[voice] fal refused the call', res.statusCode); close(1011, 'Voice service unavailable'); });
  up.on('error', (e) => { console.warn('[voice] fal error', e.message); close(1011, 'Voice service error'); });
  up.on('close', () => close(1000));
  client.on('close', () => close());
  client.on('error', () => close());
}

// ---------- voice preview ----------

/** Speaks `text` in `voice` and returns 24 kHz PCM16, for the voice picker. */
export function falSpeak(text: string, voice: string, speed: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ws = openFal();
    const chunks: Buffer[] = [];
    const finish = (err?: Error) => { clearTimeout(timer); try { ws.close(); } catch { /* gone */ } err ? reject(err) : resolve(Buffer.concat(chunks)); };
    const timer = setTimeout(() => finish(chunks.length ? undefined : new Error('preview timed out')), 20_000);
    ws.on('open', () => {
      ws.send(enc({ type: 'session.update', session: {
        voice, turn_detection: null,
        instructions: 'You are a voice preview. Say the user\'s text exactly as written, word for word, in its own language, warmly and naturally. Add nothing.',
        audio: { output: { format: { type: 'audio/pcm', rate: 24000 }, speed } },
      } }));
      ws.send(enc({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }));
      ws.send(enc({ type: 'response.create' }));
    });
    ws.on('message', (data, isBinary) => {
      let ev: any;
      try { ev = toXaiEvent(data as Buffer, isBinary); } catch { return; }
      if (!ev) return;
      if (ev.type === 'response.output_audio.delta' && ev.delta) chunks.push(Buffer.from(ev.delta, 'base64'));
      else if (ev.type === 'response.done') finish();
      else if (ev.type === 'error') finish(new Error(String(ev.error?.message ?? 'voice error')));
    });
    ws.on('unexpected-response', (_q, res) => finish(new Error(`fal ${res.statusCode}`)));
    ws.on('error', (e) => finish(e));
  });
}
