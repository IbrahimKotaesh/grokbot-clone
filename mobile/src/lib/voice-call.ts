// Voice-call engine for the iPhone app.
//
// The call screen (screens/CallScreen.tsx) talks only to this interface, so the real audio
// transport can be dropped in without touching the UI.
//
// What the live version needs to do (the server side already exists in server/src/voice.ts):
//   1. POST /api/voice/session { botId } → { callId, clientSecret, websocketUrl, session, sampleRate }
//   2. Open websocketUrl with the client secret and send `session.update` with `session`.
//   3. Stream microphone audio as 24 kHz PCM16 (`input_audio_buffer.append`) and play
//      `response.output_audio.delta` chunks back. This needs a native audio module that exposes raw
//      PCM frames (expo-audio only records to files), e.g. react-native-audio-api or a small Expo module.
//   4. Relay `function_call` events to POST /api/voice/tool and send the result back.
//   5. POST /api/voice/end { callId, transcript } when the call ends.
//
// Until that module is added, `start` reports the call as unavailable and the screen says so plainly.

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

export const voiceCallsAvailable = false;

export function startVoiceCall(_botId: string, handlers: CallHandlers): VoiceCall {
  let ended = false;
  const timer = setTimeout(() => {
    if (!ended)
      handlers.onPhase(
        "unavailable",
        "Live voice turns on once the voice service is connected to the iPhone app.",
      );
  }, 1400);
  return {
    setMuted() {},
    setSpeaker() {},
    end() {
      ended = true;
      clearTimeout(timer);
      handlers.onPhase("ended");
    },
  };
}
