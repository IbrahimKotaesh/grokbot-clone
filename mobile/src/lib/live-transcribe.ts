// Live voice typing: the microphone streams to Soniox while the user speaks, so words appear as they
// talk (Arabic, English or both, detected automatically). The server only hands out a short-lived,
// single-use key; the real Soniox key never reaches the phone. The audio is also saved as a WAV file,
// so if the live stream fails the composer can still send the recording to the server.
import { LegacyEventEmitter, requireOptionalNativeModule } from "expo-modules-core";
import { client } from "./session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const native = requireOptionalNativeModule<any>("AudioStudio"); // missing in older app builds
export const liveAvailable = () => !!native;

const SAMPLE_RATE = 16000;

export interface LiveResult {
  text: string;
  fileUri: string | null;
}
export interface LiveSession {
  /** Stops the mic and waits briefly for the last words. */
  finish(): Promise<LiveResult>;
  abort(): void;
}

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** Loudness 0…1 of a 16-bit PCM chunk, for the waveform. */
function level(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum = 0;
  const n = Math.floor(bytes.byteLength / 2);
  for (let i = 0; i < n; i += 4) {
    const s = view.getInt16(i * 2, true) / 32768;
    sum += s * s;
  }
  const rms = Math.sqrt(sum / Math.max(1, n / 4));
  // Same decibel scale as the recorder's meter (about -50 dB silence … -8 dB loud speech).
  const db = 20 * Math.log10(Math.max(rms, 1e-5));
  return Math.max(0, Math.min(1, (db + 50) / 42));
}

export async function startLive(on: { text(t: string): void; level(v: number): void }): Promise<LiveSession> {
  if (!native) throw Error("Live voice typing needs the latest app version.");
  const permission = await native.requestPermissionsAsync();
  if (permission?.status !== "granted" && !permission?.granted) throw Error("Enable microphone access in your phone settings.");

  let final = "",
    partial = "",
    finished = false,
    stopped = false,
    open = false,
    failed = false;
  const queue: ArrayBuffer[] = [];
  let markFinished = () => {};
  const finishedP = new Promise<void>((r) => (markFinished = r));
  let ws: WebSocket | null = null;

  // Start the mic at once; audio captured before the socket opens is queued and sent when it does.
  const emitter = new LegacyEventEmitter(native);
  const sub = emitter.addListener("AudioData", (e: { encoded?: string; deltaSize?: number }) => {
    if (!e.encoded || !e.deltaSize) return;
    const bytes = base64ToBytes(e.encoded);
    on.level(level(bytes));
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    if (open && ws) ws.send(buf);
    else if (!failed) queue.push(buf);
  });
  await native.startRecording({ sampleRate: SAMPLE_RATE, channels: 1, encoding: "pcm_16bit", interval: 100, enableProcessing: false, keepAwake: false });

  const connect = async () => {
    const { apiKey } = await client.request<{ apiKey: string }>("POST", "/voice/live-key");
    // React Native's WebSocket takes headers as a third argument (not in the DOM typings).
    const Socket = WebSocket as unknown as new (url: string, protocols: undefined, options: { headers: Record<string, string> }) => WebSocket;
    ws = new Socket("wss://stt-rt.soniox.com/transcribe-websocket", undefined, { headers: { Authorization: `Bearer ${apiKey}` } });
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      ws!.send(
        JSON.stringify({
          model: "stt-rt-v6",
          audio_format: "pcm_s16le",
          sample_rate: SAMPLE_RATE,
          num_channels: 1,
          language_hints: ["ar", "en"],
          enable_language_identification: true,
        }),
      );
      open = true;
      for (const b of queue.splice(0)) ws!.send(b);
      if (stopped) ws!.send("");
    };
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data)) as { tokens?: { text: string; is_final?: boolean }[]; finished?: boolean; error_message?: string };
      if (msg.error_message) {
        console.warn("[live] Soniox:", msg.error_message);
        failed = true;
        markFinished();
        return;
      }
      let p = "";
      for (const t of msg.tokens ?? []) {
        if (t.text === "<end>") continue;
        if (t.is_final) final += t.text;
        else p += t.text;
      }
      partial = p;
      on.text((final + partial).trim());
      if (msg.finished) {
        finished = true;
        markFinished();
      }
    };
    ws.onerror = () => {
      failed = true;
      markFinished();
    };
    ws.onclose = () => markFinished();
  };
  connect().catch((e) => {
    console.warn("[live] connect failed:", (e as Error).message);
    failed = true;
    markFinished();
  });

  const stopMic = async () => {
    sub.remove();
    try {
      const r = await native.stopRecording();
      return (r?.fileUri as string) ?? null;
    } catch {
      return null;
    }
  };

  return {
    async finish() {
      stopped = true;
      const fileUri = await stopMic();
      if (open && ws) ws.send(""); // empty text frame = end of audio
      await Promise.race([finishedP, new Promise((r) => setTimeout(r, 3000))]);
      try {
        ws?.close();
      } catch {}
      // If the stream broke, the saved file is the fallback (the composer sends it to the server).
      const text = (final + (finished ? "" : partial)).trim();
      return { text: failed && !text ? "" : text, fileUri };
    },
    abort() {
      stopped = true;
      void stopMic();
      try {
        ws?.close();
      } catch {}
    },
  };
}
