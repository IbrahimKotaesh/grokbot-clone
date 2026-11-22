// Voice-message dictation with Apple's own speech recognition (free, fast, no server work).
// Words appear while the user speaks; when they stop, the text is ready at once. The audio is also
// saved to a file, so if Apple returns nothing the composer can still send it to the server.
import type { ExpoSpeechRecognitionModule as SpeechModule } from "expo-speech-recognition";
import * as SecureStore from "expo-secure-store";

export type SpeechLang = "en-US" | "ar-SA";
export const SPEECH_LANGS: { id: SpeechLang; short: string; name: string }[] = [
  { id: "en-US", short: "EN", name: "English" },
  { id: "ar-SA", short: "ع", name: "العربية" },
];
const KEY = "fino.dictation-language";

// Loaded lazily: an older app build without the native module must keep working (it falls back to the server).
let mod: typeof SpeechModule | null | undefined;
function native() {
  if (mod === undefined) {
    try {
      mod = require("expo-speech-recognition").ExpoSpeechRecognitionModule as typeof SpeechModule;
    } catch {
      mod = null;
    }
  }
  return mod;
}

export function getSpeechLang(): SpeechLang {
  try {
    const saved = SecureStore.getItem(KEY);
    if (saved === "en-US" || saved === "ar-SA") return saved;
  } catch {}
  return /^ar/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? "ar-SA" : "en-US";
}
export function setSpeechLang(lang: SpeechLang) {
  try {
    SecureStore.setItem(KEY, lang);
  } catch {}
}

// Off: Apple dictation needs a language picked up front and can't mix Arabic and English. Voice messages go
// to the server (Soniox), which detects the language itself. Kept for an offline mode later.
const APPLE_DICTATION = false;

export function speechAvailable() {
  if (!APPLE_DICTATION) return false;
  try {
    // Not isRecognitionAvailable(): that checks the phone's own region (e.g. ar-LB), which Apple may not
    // support even though en-US and ar-SA work. Real problems surface as errors when listening starts.
    return native() != null;
  } catch {
    return false; // native module missing (an older build)
  }
}

export interface DictationResult {
  text: string;
  audioUri: string | null;
  error: string | null;
}
export interface Dictation {
  stop(): Promise<DictationResult>;
  abort(): void;
}

const join = (...parts: string[]) => parts.map((x) => x.trim()).filter(Boolean).join(" ");

export async function startDictation(lang: SpeechLang, on: { level(v: number): void; text(t: string): void }): Promise<Dictation> {
  const ExpoSpeechRecognitionModule = native();
  if (!ExpoSpeechRecognitionModule) throw Error("Voice typing isn't available on this phone.");
  const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!permission.granted) throw Error("Allow microphone and speech recognition for Fino in your phone settings.");

  let committed = "",
    interim = "",
    audioUri: string | null = null,
    error: string | null = null,
    ended = false;
  let markEnded = () => {};
  const endedP = new Promise<void>((r) => (markEnded = r));

  const subs = [
    ExpoSpeechRecognitionModule.addListener("result", (e) => {
      const t = e.results[0]?.transcript ?? "";
      if (e.isFinal) {
        committed = join(committed, t);
        interim = "";
      } else {
        // iOS sometimes restarts the transcript after a pause; keep what was said before.
        if (interim && t.length < interim.length / 2 && !interim.startsWith(t.slice(0, 6))) committed = join(committed, interim);
        interim = t;
      }
      on.text(join(committed, interim));
    }),
    ExpoSpeechRecognitionModule.addListener("volumechange", (e) => on.level(Math.max(0.06, Math.min(1, (e.value + 2) / 10)))),
    ExpoSpeechRecognitionModule.addListener("audioend", (e) => {
      audioUri = e.uri;
    }),
    ExpoSpeechRecognitionModule.addListener("error", (e) => {
      if (e.error === "aborted") return;
      error = e.error;
      console.warn(`[speech] ${e.error}: ${e.message}`);
    }),
    ExpoSpeechRecognitionModule.addListener("end", () => {
      ended = true;
      markEnded();
    }),
  ];
  const cleanup = () => subs.forEach((s) => s.remove());

  ExpoSpeechRecognitionModule.start({
    lang,
    interimResults: true,
    continuous: true,
    addsPunctuation: true,
    iosTaskHint: "dictation",
    recordingOptions: { persist: true },
    volumeChangeEventOptions: { enabled: true, intervalMillis: 90 },
  });

  return {
    async stop() {
      if (!ended) ExpoSpeechRecognitionModule.stop();
      await Promise.race([endedP, new Promise((r) => setTimeout(r, 2500))]);
      cleanup();
      return { text: join(committed, interim), audioUri, error };
    },
    abort() {
      if (!ended) ExpoSpeechRecognitionModule.abort();
      cleanup();
    },
  };
}
