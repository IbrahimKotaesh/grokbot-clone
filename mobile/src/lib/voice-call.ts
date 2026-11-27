// Voice-call engine for the iPhone app: the same flow as the web client (web/src/voice/call.ts).
//
//   1. POST /api/voice/session { botId } → { callId, clientSecret, websocketUrl, session, sampleRate }
//   2. Open websocketUrl (the server's fal Grok relay) with the client secret and send `session.update`.
//   3. Stream the mic as 24 kHz PCM16 (`input_audio_buffer.append`) and play `response.output_audio.delta`.
//      Audio runs in the local native module modules/badr-voice (AVAudioEngine with echo cancellation).
//   4. Relay `function_call`s to POST /api/voice/tool and send the outputs back; when handed-off work
//      lands in the chat, tell the voice agent with a [work_landed] note so Badr says the outcome.
//   5. POST /api/voice/end { callId, transcript } so the call record and summary land in the chat.
//
// The call screen (screens/CallScreen.tsx) only talks to the small interface below.
import type { EventSubscription } from "expo";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { BadrVoice } from "../../modules/badr-voice";
import { client, socketHeaders } from "./session";
import { useWorkspace } from "./store";
import { t } from "./i18n";

export type CallPhase = "connecting" | "live" | "unavailable" | "ended" | "error";

export interface CallHandlers {
  onPhase(phase: CallPhase, detail?: string): void;
  /** 0…1 loudness of whoever is speaking; drives the orb. */
  onLevel?(level: number, speaker: "you" | "bot"): void;
  /** Live captions. */
  onCaption?(text: string, speaker: "you" | "bot"): void;
}

export interface VoiceCall {
  setMuted(muted: boolean): void;
  setSpeaker(on: boolean): void;
  end(): void;
}

export const voiceCallsAvailable = !!BadrVoice;

export function startVoiceCall(botId: string, handlers: CallHandlers): VoiceCall {
  const call = new Call(botId, handlers);
  void call.start();
  return call;
}

type Json = Record<string, any>;
interface VoiceSession {
  callId: string;
  clientSecret: string;
  websocketUrl: string;
  sampleRate: number;
  session: Json;
}
interface Caption { id: string; role: "user" | "assistant"; text: string }
interface PendingTask { seq: number; request: string; since: number; sawRunning: boolean; awaitingNoted: boolean; doneSince: number | null }

const voiceApi = {
  session: (botId: string) => client.request<VoiceSession>("POST", "/voice/session", { botId }),
  tool: (botId: string, callId: string, name: string, args: unknown) =>
    client.request<{ output: string; taskSeq?: number }>("POST", "/voice/tool", { botId, callId, name, args }),
  end: (botId: string, callId: string, transcript: { role: string; text: string }[], error?: string) =>
    client.request<{ ok: true }>("POST", "/voice/end", { botId, callId, transcript, error }),
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

class Call implements VoiceCall {
  private ended = false;
  private ws: WebSocket | null = null;
  private sess: VoiceSession | null = null;
  private ready = false;
  private muted = false;
  private responseActive = false;
  private responseSpoke = false;
  private responseId: string | null = null;
  private interruptedId: string | null = null;
  private userSpeaking = false;
  private playing = false;
  private idleWaiters: (() => void)[] = [];
  private inflight = new Map<string, { name: string; promise: Promise<string> }>();
  private handled = new Set<string>();
  private captions: Caption[] = [];
  private tasks: PendingTask[] = [];
  private notes: string[] = [];
  private subs: EventSubscription[] = [];
  private unsubStore: (() => void) | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private checkTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly botId: string,
    private readonly h: CallHandlers,
  ) {}

  async start() {
    const native = BadrVoice;
    if (!native) {
      this.h.onPhase("unavailable", t("Update the app to call from your iPhone."));
      return;
    }
    this.h.onPhase("connecting");
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (this.ended) return;
      if (!perm.granted) return this.fail(t("Allow the microphone in Settings to call."));
      this.sess = await voiceApi.session(this.botId);
      if (this.ended) {
        void voiceApi.end(this.botId, this.sess.callId, [], "Cancelled").catch(() => {});
        return;
      }
      this.subs.push(
        native.addListener("onAudio", (e) => this.sendAudio(e.data)),
        native.addListener("onPlaybackIdle", () => this.onPlaybackIdle()),
        native.addListener("onInterrupted", () => this.end("Call interrupted")),
      );
      await native.start(this.sess.sampleRate || 24000);
      if (this.ended) return native.stop();
      this.levelTimer = setInterval(() => this.pollLevels(), 70);
      this.connect(this.sess);
    } catch (e) {
      this.fail((e as Error)?.message || t("Couldn't start the call"));
    }
  }

  private connect(sess: VoiceSession) {
    // React Native's WebSocket takes headers as a third argument; the relay authenticates by cookie.
    const Ctor = WebSocket as unknown as new (url: string, protocols: string[], options: { headers: Record<string, string> }) => WebSocket;
    const ws = new Ctor(sess.websocketUrl, [`xai-client-secret.${sess.clientSecret}`], { headers: socketHeaders() });
    this.ws = ws;
    this.connectTimer = setTimeout(() => {
      if (!this.ready) this.fail(t("Couldn't connect the call"));
    }, 15000);
    ws.onopen = () => this.send({ type: "session.update", session: sess.session });
    ws.onmessage = (m) => {
      if (typeof m.data !== "string") return;
      try {
        this.handle(JSON.parse(m.data));
      } catch (e) {
        console.warn("[voice] bad event", e);
      }
    };
    ws.onerror = () => {};
    ws.onclose = (e) => {
      if (this.ended) return;
      if (this.ready) this.end(t("Call dropped"));
      else this.fail(`${t("Couldn't connect the call")}${e.reason ? ` (${e.reason})` : ""}`);
    };
  }

  private send(ev: Json) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(ev));
  }

  private sendAudio(b64: string) {
    if (!this.ready || this.ended || this.muted) return;
    this.send({ type: "input_audio_buffer.append", audio: b64 });
  }

  private pollLevels() {
    if (!BadrVoice || this.ended) return;
    const l = BadrVoice.levels();
    if (l.out > 0.02 || this.playing) this.h.onLevel?.(l.out, "bot");
    else this.h.onLevel?.(this.muted ? 0 : l.mic, "you");
  }

  setMuted(m: boolean) {
    this.muted = m;
    BadrVoice?.setMuted(m);
    if (m && this.ready) this.send({ type: "input_audio_buffer.clear" });
  }

  setSpeaker(on: boolean) {
    BadrVoice?.setSpeaker(on);
  }

  // ---------- playback ----------

  private play(b64: string) {
    this.playing = true;
    BadrVoice?.play(b64);
  }

  private onPlaybackIdle() {
    this.playing = false;
    for (const w of this.idleWaiters.splice(0)) w();
  }

  private whenIdle(maxMs = 8000) {
    if (!this.playing) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, maxMs);
      this.idleWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // ---------- realtime events ----------

  private handle(ev: Json) {
    switch (ev.type) {
      case "session.updated":
        if (!this.ready) {
          this.ready = true;
          if (this.connectTimer) clearTimeout(this.connectTimer);
          this.h.onPhase("live");
          this.watchTranscript();
          this.send({ type: "response.create" }); // Badr greets first
        }
        return;

      case "input_audio_buffer.speech_started":
        this.userSpeaking = true;
        // Barge-in: stop talking and listen.
        if (this.playing) {
          BadrVoice?.clear();
          this.onPlaybackIdle();
        }
        if (this.responseActive) {
          this.interruptedId = this.responseId;
          this.send({ type: "response.cancel" });
        }
        return;
      case "input_audio_buffer.speech_stopped":
      case "input_audio_buffer.committed":
        this.userSpeaking = false;
        this.flushNotes();
        return;

      case "conversation.item.added":
      case "conversation.item.created": {
        const item = ev.item ?? {};
        if (item.role === "user" && Array.isArray(item.content) && item.content.some((c: Json) => c?.type === "input_audio")) {
          const tr = item.content.find((c: Json) => c?.transcript)?.transcript;
          this.caption(item.id, "user", tr ?? "", "set");
        }
        return;
      }
      case "conversation.item.input_audio_transcription.updated":
      case "conversation.item.input_audio_transcription.completed":
        this.caption(ev.item_id, "user", ev.transcript ?? "", "set");
        return;
      case "conversation.item.input_audio_transcription.delta":
        this.caption(ev.item_id, "user", ev.delta ?? "", "append");
        return;

      case "response.created":
        this.responseActive = true;
        this.responseSpoke = false;
        this.responseId = ev.response?.id ?? null;
        return;
      case "response.output_item.added":
        if (ev.item?.type === "message") this.caption(ev.item.id, "assistant", "", "set");
        return;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
      case "response.output_text.delta":
      case "response.text.delta":
        if (this.interruptedId && ev.response_id === this.interruptedId) return;
        this.responseSpoke = true;
        this.caption(ev.item_id, "assistant", ev.delta ?? "", "append");
        return;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        if (ev.transcript) this.caption(ev.item_id, "assistant", ev.transcript, "set");
        return;
      case "response.output_audio.delta":
      case "response.audio.delta":
        if (ev.delta && !(this.interruptedId && ev.response_id === this.interruptedId)) {
          this.responseSpoke = true;
          this.play(ev.delta);
        }
        return;

      case "response.function_call_arguments.done":
        this.startTool(ev.call_id, ev.name, ev.arguments);
        return;
      case "response.done":
        this.responseActive = false;
        for (const o of (ev.response?.output ?? []) as Json[]) if (o?.type === "function_call") this.startTool(o.call_id, o.name, o.arguments);
        if (this.inflight.size) void this.finishTools(this.responseSpoke);
        else this.flushNotes();
        return;

      case "error": {
        const code = String(ev.error?.code ?? ev.code ?? "");
        if (/cancel/i.test(code) || /no active response/i.test(String(ev.error?.message ?? ""))) return;
        console.warn("[voice] realtime error", ev.error ?? ev);
        if (!this.ready) this.fail(ev.error?.message ?? t("Couldn't connect the call"));
        return;
      }
    }
  }

  private caption(id: string | undefined, role: Caption["role"], text: string, mode: "set" | "append") {
    if (!id) return;
    let c = this.captions.find((x) => x.id === id);
    if (!c) {
      c = { id, role, text: "" };
      this.captions.push(c);
      if (this.captions.length > 200) this.captions.shift();
    }
    c.text = mode === "append" ? c.text + text : text || c.text;
    if (c.text.trim()) this.h.onCaption?.(c.text.trim(), role === "user" ? "you" : "bot");
  }

  private transcript() {
    return this.captions.filter((c) => c.text.trim()).map((c) => ({ role: c.role, text: c.text.trim() }));
  }

  // ---------- tools ----------

  private startTool(callId: string | undefined, name: string | undefined, rawArgs: string | undefined) {
    if (!callId || !name || !this.sess || this.handled.has(callId)) return;
    this.handled.add(callId);
    let args: Json = {};
    try {
      args = rawArgs ? JSON.parse(rawArgs) : {};
    } catch {
      /* the model sent bad JSON */
    }
    const promise =
      name === "end_the_call"
        ? Promise.resolve("Ending the call.")
        : voiceApi
            .tool(this.botId, this.sess.callId, name, args)
            .then((r) => {
              if (name === "send_task" && r.taskSeq) this.addTask(r.taskSeq, String(args.request ?? ""));
              return r.output;
            })
            .catch((e) => `Tool error: ${(e as Error).message}. Tell the user it didn't go through.`);
    this.inflight.set(callId, { name, promise });
  }

  private async finishTools(spoke: boolean) {
    const batch = [...this.inflight.entries()];
    this.inflight.clear();
    const outputs = await Promise.all(batch.map(([, b]) => b.promise));
    if (this.ended) return;
    // Every output first, then one response.create.
    batch.forEach(([callId], i) => this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: outputs[i] } }));
    if (batch.some(([, b]) => b.name === "end_the_call")) {
      await this.whenIdle(8000);
      this.end();
      return;
    }
    const needsReply = !spoke || batch.some(([, b]) => b.name !== "send_task");
    if (needsReply) {
      await this.whenIdle(8000);
      if (!this.ended && !this.responseActive && !this.inflight.size) this.send({ type: "response.create" });
    } else this.flushNotes();
  }

  // ---------- work_landed: tell Badr when handed-off work finishes in the chat ----------

  private rowsNow() {
    const s = useWorkspace.getState();
    const gen = s.generations[this.botId] ?? s.chats[this.botId]?.find((c) => c.isMain)?.generation ?? 1;
    return s.rows[`${this.botId}:${gen}`] ?? [];
  }

  private addTask(seq: number, request: string) {
    this.tasks.push({ seq, request, since: Date.now(), sawRunning: false, awaitingNoted: false, doneSince: null });
    this.scheduleCheck(800);
  }

  private watchTranscript() {
    this.unsubStore = useWorkspace.subscribe((s, prev) => {
      if (!this.tasks.length) return;
      if (s.live[this.botId] !== prev.live[this.botId] || s.rows !== prev.rows) {
        if (s.live[this.botId]?.isRunning) for (const task of this.tasks) task.sawRunning = true;
        this.scheduleCheck(400);
      }
    });
  }

  private scheduleCheck(ms: number) {
    if (this.checkTimer) clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => this.checkTasks(), ms);
  }

  private checkTasks() {
    if (this.ended || !this.tasks.length) return;
    const live = useWorkspace.getState().live[this.botId];
    const rows = this.rowsNow();
    const now = Date.now();
    let recheck = false;
    for (const task of [...this.tasks]) {
      if (live?.isRunning) task.sawRunning = true;
      const after = rows.filter((r) => r.seq > task.seq);
      if (live?.awaiting) {
        if (!task.awaitingNoted) {
          task.awaitingNoted = true;
          this.queueNote(`The work you handed off ("${clip(task.request, 160)}") is paused and needs ${this.firstName()}'s OK in the chat: ${live.awaiting.reason}. Tell them it's waiting for their approval on screen.`);
        }
        task.doneSince = null;
        continue;
      }
      task.awaitingNoted = false;
      const replies = after.filter((r) => r.body.type === "message" && r.body.role === "assistant" && !r.body.streaming);
      const streaming = after.some((r) => r.body.type === "message" && r.body.streaming);
      const finished = !live?.isRunning && !streaming && (replies.length > 0 || task.sawRunning) && now - task.since > 1500;
      if (!finished) {
        task.doneSince = null;
        continue;
      }
      if (task.doneSince === null || now - task.doneSince < 1200) {
        task.doneSince ??= now;
        recheck = true;
        continue;
      }
      this.tasks = this.tasks.filter((x) => x !== task);
      const text = replies.map((r) => (r.body.type === "message" ? r.body.text : "")).join("\n\n").trim();
      this.queueNote(
        `The work you handed off just finished. Request: "${clip(task.request, 200)}". ${text ? `Your text agent replied:\n"""\n${clip(text, 1800)}\n"""` : "It finished without a written reply."}`,
      );
    }
    if (recheck || this.tasks.length) this.scheduleCheck(recheck ? 700 : 3000);
  }

  private firstName() {
    return (useWorkspace.getState().user?.name ?? "").split(/\s+/)[0] || "the user";
  }

  private queueNote(text: string) {
    this.notes.push(text);
    this.flushNotes();
  }

  private flushNotes() {
    if (!this.ready || this.ended || !this.notes.length) return;
    if (this.responseActive || this.userSpeaking || this.inflight.size) return; // retried on response.done / speech_stopped
    if (this.playing) {
      void this.whenIdle().then(() => this.flushNotes());
      return;
    }
    const text = this.notes.splice(0).map((n) => `[work_landed] ${n}`).join("\n\n");
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: `${text}\n\n(Automatic note from your text agent, not spoken by ${this.firstName()}. Tell them the outcome now, briefly.)` }] },
    });
    this.send({ type: "response.create" });
  }

  // ---------- teardown ----------

  private fail(message: string) {
    this.end(message);
  }

  end(error?: string) {
    if (this.ended) return;
    this.ended = true;
    for (const timer of [this.connectTimer, this.checkTimer]) if (timer) clearTimeout(timer);
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.unsubStore?.();
    for (const s of this.subs) s.remove();
    try {
      this.ws?.close(1000, "call ended");
    } catch {
      /* ignore */
    }
    BadrVoice?.stop();
    for (const w of this.idleWaiters.splice(0)) w();
    if (this.sess) void voiceApi.end(this.botId, this.sess.callId, this.transcript(), error).catch((e) => console.warn("[voice] end failed", e));
    this.h.onLevel?.(0, "bot");
    if (error) this.h.onPhase("error", error);
    else this.h.onPhase("ended");
  }
}
