// Voice-message transcription with Soniox: detects Arabic/English by itself and handles both in one
// sentence. Real-time WebSocket for WAV/WebM/Ogg/MP3 (fastest: the whole clip is streamed at once),
// async REST for M4A/MP4, which the real-time API doesn't accept.
import WebSocket from 'ws';

const KEY = () => process.env.SONIOX_API_KEY ?? '';
export const sonioxEnabled = () => KEY().length > 0;
const HINTS = ['ar', 'en'];
const API = 'https://api.soniox.com/v1';

export interface Transcript {
  text: string;
  language?: string;
}

/** The language most of the words are in. */
function mainLanguage(tokens: { text: string; language?: string }[]) {
  const n = new Map<string, number>();
  for (const t of tokens) if (t.language) n.set(t.language, (n.get(t.language) ?? 0) + t.text.length);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function sonioxTranscribe(audio: ArrayBuffer, contentType: string): Promise<Transcript> {
  return /mp4|m4a|aac/i.test(contentType) ? sonioxAsync(audio, contentType) : sonioxRealtime(audio);
}

function sonioxRealtime(audio: ArrayBuffer): Promise<Transcript> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket', { headers: { Authorization: `Bearer ${KEY()}` } });
    const tokens: { text: string; language?: string }[] = [];
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Soniox timed out'));
    }, 30_000);
    const done = (err?: Error) => {
      clearTimeout(timer);
      if (err) return reject(err);
      resolve({ text: tokens.map((t) => t.text).join('').trim(), language: mainLanguage(tokens) });
    };
    ws.on('open', () => {
      ws.send(JSON.stringify({ model: 'stt-rt-v6', audio_format: 'auto', language_hints: HINTS, enable_language_identification: true }));
      const buf = Buffer.from(audio);
      for (let i = 0; i < buf.length; i += 256 * 1024) ws.send(buf.subarray(i, i + 256 * 1024));
      ws.send(''); // empty text frame = end of audio
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as {
        tokens?: { text: string; is_final?: boolean; language?: string }[];
        finished?: boolean;
        error_code?: number;
        error_type?: string;
        error_message?: string;
      };
      if (msg.error_code) return done(new Error(`Soniox ${msg.error_code} ${msg.error_type}: ${msg.error_message}`));
      for (const t of msg.tokens ?? []) if (t.is_final && t.text !== '<end>') tokens.push(t);
      if (msg.finished) {
        ws.close();
        done();
      }
    });
    ws.on('error', (e) => done(e));
    ws.on('close', () => done()); // resolves with what arrived if the server closes first (no-op if already settled)
  });
}

async function sonioxAsync(audio: ArrayBuffer, contentType: string): Promise<Transcript> {
  const H = { Authorization: `Bearer ${KEY()}` };
  const json = async (r: Response) => {
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error(`Soniox ${r.status}: ${String(body.message ?? body.error_message ?? '')}`);
    return body;
  };
  const form = new FormData();
  form.append('file', new Blob([audio], { type: contentType }), 'voice.m4a');
  const file = await json(await fetch(`${API}/files`, { method: 'POST', headers: H, body: form }));
  const fileId = String(file.id);
  try {
    const job = await json(
      await fetch(`${API}/transcriptions`, {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'stt-async-v6', file_id: fileId, language_hints: HINTS, enable_language_identification: true }),
      }),
    );
    const id = String(job.id);
    const until = Date.now() + 60_000;
    let status = String(job.status);
    while (status === 'queued' || status === 'processing') {
      if (Date.now() > until) throw new Error('Soniox timed out');
      await new Promise((r) => setTimeout(r, 300));
      const s = await json(await fetch(`${API}/transcriptions/${id}`, { headers: H }));
      status = String(s.status);
      if (status === 'error') throw new Error(`Soniox: ${String(s.error_message ?? 'transcription failed')}`);
    }
    const t = (await json(await fetch(`${API}/transcriptions/${id}/transcript`, { headers: H }))) as { text?: string; tokens?: { text: string; language?: string }[] };
    void fetch(`${API}/transcriptions/${id}`, { method: 'DELETE', headers: H }).catch(() => {});
    return { text: String(t.text ?? '').trim(), language: mainLanguage(t.tokens ?? []) };
  } finally {
    void fetch(`${API}/files/${fileId}`, { method: 'DELETE', headers: H }).catch(() => {});
  }
}
