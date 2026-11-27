import { NativeModule, requireOptionalNativeModule } from "expo";

type Events = {
  /** ~40 ms of mono PCM16 (little-endian) at the call's sample rate, base64. */
  onAudio(e: { data: string }): void;
  /** Everything queued with play() has been heard. */
  onPlaybackIdle(): void;
  /** A phone call or Siri took the audio. */
  onInterrupted(): void;
};

export declare class BadrVoiceNative extends NativeModule<Events> {
  start(sampleRate: number): Promise<{ voiceProcessing: boolean; inputRate: number }>;
  play(base64Pcm16: string): void;
  clear(): void;
  setMuted(muted: boolean): void;
  setSpeaker(on: boolean): void;
  levels(): { mic: number; out: number; playing: boolean };
  stop(): void;
}

/** Null on builds made before the module existed, so the app hides calling instead of crashing. */
export const BadrVoice = requireOptionalNativeModule<BadrVoiceNative>("BadrVoice");
