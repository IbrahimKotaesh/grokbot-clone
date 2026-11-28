// Live voice typing on the web: the microphone streams straight to Soniox while you speak, so words appear in the
// message box as you talk (Arabic, English or both). The server only hands out a short-lived, single-use key.
// A normal recording runs alongside; if the live stream can't start or breaks, that recording is transcribed on
// the server instead, so nothing said is lost.
import { MicCapture, createAudioContext, micErrorMessage, openMic } from '../voice/audio';

const RATE = 16000;
const SONIOX = 'wss://stt-rt.soniox.com/transcribe-websocket';

export interface LiveDictation {
  /** Stop the microphone and return the final words (waits briefly for the last ones). */
  finish(): Promise<string>;
  cancel(): void;
  /** Microphone loudness 0…1 for the waveform. */
  level(): number;
}

/** Start from a click: the audio context is created right away so the browser lets it run. */
export async function startLiveDictation(onText: (text: string) => void): Promise<LiveDictation> {
  const ctx = createAudioContext();
  let stream: MediaStream;
  try { stream = await openMic(); } catch (e) { void ctx.close().catch(() => {}); throw new Error(micErrorMessage(e)); }

  let final = '', partial = '', open = false, failed = false, finished = false, stopped = false;
  let markDone = () => {};
  const done = new Promise<void>((r) => (markDone = r));
  const queue: ArrayBuffer[] = [];
  let ws: WebSocket | null = null;

  // The fallback recording.
  const mime = typeof MediaRecorder !== 'undefined' ? ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m)) : undefined;
  const chunks: Blob[] = [];
  let recorder: MediaRecorder | null = null;
  try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); }; recorder.start(1000); } catch { recorder = null; }
  const recorded = () => new Promise<Blob | null>((resolve) => {
    if (!recorder || recorder.state !== 'recording') return resolve(chunks.length ? new Blob(chunks, { type: recorder?.mimeType || mime || 'audio/webm' }) : null);
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder?.mimeType || mime || 'audio/webm' }));
    recorder.stop();
  });

  const mic = new MicCapture(ctx, stream, (pcm) => {
    const buf = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer;
    if (open && ws) ws.send(buf);
    else if (!failed) queue.push(buf);
  }, RATE);
  await mic.start();

  const fail = (why: string) => { if (!failed) console.warn('[dictation] live stream:', why); failed = true; markDone(); };
  void (async () => {
    const r = await fetch('/api/voice/live-key', { method: 'POST', credentials: 'include' });
    const body = (await r.json().catch(() => ({}))) as { apiKey?: string; error?: string };
    if (!r.ok || !body.apiKey) throw new Error(body.error ?? `key ${r.status}`);
    if (stopped && !queue.length) return;
    ws = new WebSocket(SONIOX);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      ws!.send(JSON.stringify({ api_key: body.apiKey, model: 'stt-rt-v6', audio_format: 'pcm_s16le', sample_rate: RATE, num_channels: 1, language_hints: ['ar', 'en', 'nl'], enable_language_identification: true }));
      open = true;
      for (const b of queue.splice(0)) ws!.send(b);
      if (stopped) ws!.send('');
    };
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data)) as { tokens?: { text: string; is_final?: boolean }[]; finished?: boolean; error_message?: string };
      if (msg.error_message) return fail(msg.error_message);
      let p = '';
      for (const t of msg.tokens ?? []) { if (t.text === '<end>') continue; if (t.is_final) final += t.text; else p += t.text; }
      partial = p;
      onText((final + partial).trim());
      if (msg.finished) { finished = true; markDone(); }
    };
    ws.onerror = () => fail('socket error');
    ws.onclose = () => markDone();
  })().catch((e) => fail((e as Error).message));

  const release = () => { mic.stop(); void ctx.close().catch(() => {}); };
  return {
    level: () => mic.level,
    async finish() {
      stopped = true;
      const blob = recorded();
      mic.stop();
      if (open && ws) ws.send(''); // an empty frame ends the audio
      await Promise.race([done, new Promise((r) => setTimeout(r, 2500))]);
      try { ws?.close(); } catch { /* gone */ }
      void ctx.close().catch(() => {});
      const text = (final + (finished ? '' : partial)).trim();
      if (text || !failed) { void blob; return text; }
      // The live stream never worked: transcribe the recording on the server.
      const audio = await blob;
      if (!audio || audio.size < 200) return '';
      const r = await fetch('/api/voice/transcribe', { method: 'POST', credentials: 'include', headers: { 'Content-Type': audio.type }, body: audio });
      const data = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!r.ok) throw new Error(data.error ?? 'Transcription failed. Please try again.');
      return String(data.text ?? '').trim();
    },
    cancel() {
      stopped = true;
      try { recorder?.state === 'recording' && recorder.stop(); } catch { /* gone */ }
      try { ws?.close(); } catch { /* gone */ }
      release();
    },
  };
}
