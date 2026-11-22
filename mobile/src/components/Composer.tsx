import { Image } from "expo-image";
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActionSheetIOS,
  Platform,
  ScrollView,
  Keyboard,
  Animated,
  Easing,
  LayoutAnimation,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync, useAudioRecorderState } from "expo-audio";
import { fetch as nativeFetch } from "expo/fetch";
import type { Bot } from "../../../packages/contracts/src/types";
import type { Attachment } from "../../../packages/client/src";
import { client, authHeaders } from "../lib/session";
import { liveAvailable, startLive, type LiveSession } from "../lib/live-transcribe";
import { SPEECH_LANGS, getSpeechLang, setSpeechLang, speechAvailable, startDictation, type Dictation, type SpeechLang } from "../lib/speech";
import { useWorkspace } from "../lib/store";
import { IconButton, ModelMark, ProviderMark } from "./UI";
import { router } from "expo-router";
import { modelName } from "../lib/models";
import { FadeIn, TypingDots, useLoop } from "./motion";
import { palette as p, type, space, radius } from "../theme";
import { t } from "../lib/i18n";

export interface ComposerHandle {
  prefill(text: string): void;
}
type Mode = "idle" | "recording" | "transcribing";
const BARS = 48;
const TICK = 60; // ms per new waveform bar
interface Sample {
  id: number;
  v: number;
}
let sampleId = 0;
const emptySamples = () => Array.from({ length: BARS }, () => ({ id: sampleId++, v: 0 }));

export const Composer = forwardRef<ComposerHandle, { bot: Bot; generation: number }>(function Composer(
  { bot, generation },
  ref,
) {
  const [draft, setDraft] = useState(""),
    [attachments, setAttachments] = useState<(Attachment & { image: boolean })[]>([]),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<Mode>("idle"),
    [error, setError] = useState(""),
    [keyboard, setKeyboard] = useState(false),
    [levels, setLevels] = useState<Sample[]>(emptySamples);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const insets = useSafeAreaInsets();
  const running = useWorkspace((x) => x.live[bot.id]?.isRunning ?? false);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }),
    recording = useAudioRecorderState(recorder, 60);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What to do with the transcript once recording stops.
  const after = useRef<"send" | "insert" | "cancel">("send");
  // Apple dictation when the phone supports it, otherwise a recording sent to the server.
  const dictation = useRef<Dictation | null>(null);
  const spoken = useRef(""); // text from before a language switch
  const [live, setLive] = useState(""),
    [lang, setLang] = useState<SpeechLang>(getSpeechLang),
    [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (mode !== "recording") return;
    const started = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(t);
  }, [mode]);
  // Live Soniox stream (words appear while speaking); falls back to a recording when unavailable.
  const liveSession = useRef<LiveSession | null>(null);
  useEffect(
    () => () => {
      dictation.current?.abort();
      liveSession.current?.abort();
    },
    [],
  );
  const editAttachments = (f: (old: typeof attachments) => typeof attachments) => {
    smooth();
    setAttachments(f);
  };
  // Eases each new loudness sample into the previous one so the waveform flows instead of flickering.
  // Loudness arrives in uneven bursts (especially from the live stream on a real phone). It goes into a
  // small queue, and a steady ticker draws one bar per tick, so the waveform moves at an even pace.
  const levelQueue = useRef<number[]>([]);
  const pushLevel = (v: number) => {
    const q = levelQueue.current;
    q.push(v);
    if (q.length > 12) q.splice(0, q.length - 12);
  };
  useEffect(() => {
    if (mode !== "recording") return;
    levelQueue.current = [];
    const t = setInterval(() => {
      const q = levelQueue.current;
      if (q.length > 4) q.splice(0, q.length - 4); // fell behind: catch up instead of lagging
      const next = q.shift();
      setLevels((old) => {
        const prev = old[old.length - 1].v;
        const v = next === undefined ? prev * 0.6 : prev * 0.15 + next * 0.85;
        return [...old.slice(1), { id: sampleId++, v }];
      });
    }, TICK);
    return () => clearInterval(t);
  }, [mode]);
  const textIn = useRef(new Animated.Value(1)).current;
  const changeMode = (m: Mode) => {
    smooth();
    setMode(m);
  };
  // Grow the box line by line with a soft ease rather than a jump.
  const inputHeight = useRef(0);
  const onInputSize = (h: number) => {
    if (inputHeight.current && Math.abs(h - inputHeight.current) > 2) smooth("ease");
    inputHeight.current = h;
  };

  useImperativeHandle(ref, () => ({
    prefill(text) {
      setDraft(text);
      setTimeout(() => input.current?.focus(), 50);
    },
  }));
  useEffect(() => {
    // Move the box with the keyboard (same duration and curve), so it rides up and down as one piece.
    const follow = (e: { duration?: number }, open: boolean) => {
      LayoutAnimation.configureNext({ duration: e.duration || 250, update: { type: LayoutAnimation.Types.keyboard } });
      setKeyboard(open);
    };
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => follow(e, true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", (e) => follow(e, false));
    return () => {
      show.remove();
      hide.remove();
      if (recordTimer.current) clearTimeout(recordTimer.current);
    };
  }, []);
  // Feed the live waveform from the recorder's level meter (dBFS, about -60…0).
  useEffect(() => {
    if (!recording.isRecording) return;
    const db = recording.metering ?? -60;
    const level = Math.max(0, Math.min(1, (db + 50) / 42));
    pushLevel(level);
  }, [recording.durationMillis]);

  async function files() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (picked.canceled) return;
      const added: typeof attachments = [];
      for (const file of picked.assets) {
        if ((file.size ?? 0) > 10 * 1024 * 1024) throw Error(t("Choose files under 10 MB."));
        added.push({
          name: file.name,
          dataUrl: `data:${file.mimeType ?? "application/octet-stream"};base64,${await new File(file.uri).base64()}`,
          image: false,
        });
      }
      editAttachments((old) => [...old, ...added].slice(0, 8));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function photo(camera = false) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw Error(t("Enable camera access in your phone settings."));
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.65, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.65, base64: true, allowsMultipleSelection: true, selectionLimit: 4 });
      if (result.canceled) return;
      const added = result.assets.map((asset, i) => {
        if (!asset.base64 || asset.base64.length > 4 * 1024 * 1024) throw Error(t("Choose a smaller photo (under 3 MB)."));
        return { name: asset.fileName ?? `Photo-${i + 1}.jpg`, dataUrl: `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`, image: true };
      });
      editAttachments((old) => [...old, ...added].slice(0, 8));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function attach() {
    const options = [
      { label: t("Take photo"), run: () => void photo(true) },
      { label: t("Photo library"), run: () => void photo() },
      { label: t("Choose files"), run: () => void files() },
    ];
    if (Platform.OS === "ios")
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options.map((o) => o.label), "Cancel"], cancelButtonIndex: options.length, userInterfaceStyle: "dark" },
        (i) => options[i]?.run(),
      );
    else Alert.alert(t("Add to message"), "", [...options.map((o) => ({ text: o.label, onPress: o.run })), { text: t("Cancel"), style: "cancel" as const }]);
  }
  async function send(text = draft) {
    if (busy || (!text.trim() && !attachments.length)) return;
    setBusy(true);
    setError("");
    try {
      const { row } = await client.send(bot.id, generation, text, attachments.filter((a) => a.image), attachments.filter((a) => !a.image));
      useWorkspace.getState().event({ type: "rows", botId: bot.id, generation, rows: [row] });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDraft("");
      setAttachments([]);
    } catch (e) {
      setError((e as Error).message);
      if (text !== draft) setDraft(text); // keep a voice transcript so nothing is lost
    } finally {
      setBusy(false);
    }
  }
  function listen(language: SpeechLang) {
    return startDictation(language, {
      level: (v) => pushLevel(v),
      text: (t) => {
        smooth("ease");
        setLive([spoken.current, t].filter(Boolean).join(" "));
      },
    });
  }
  async function switchLanguage() {
    const next = SPEECH_LANGS.find((l) => l.id !== lang)!.id;
    setLang(next);
    setSpeechLang(next);
    void Haptics.selectionAsync();
    if (!dictation.current) return;
    try {
      const r = await dictation.current.stop();
      spoken.current = [spoken.current, r.text].filter(Boolean).join(" ");
      dictation.current = await listen(next);
    } catch (e) {
      dictation.current = null;
      setError((e as Error).message);
    }
  }
  async function serverTranscribe(uri: string, contentType: string) {
    const data = await new File(uri).bytes();
    const response = await nativeFetch(`${client.base}/api/voice/transcribe`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": contentType },
      body: data,
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error ?? t("Transcription failed."));
    return String(result.text ?? "").trim();
  }
  async function startRecording() {
    try {
      spoken.current = "";
      setLive("");
      if (liveAvailable())
        liveSession.current = await startLive({
          // Words stream in the background but aren't shown one by one (too jumpy); the whole text lands at once.
          text: () => {},
          level: (v) => pushLevel(v),
        });
      else if (speechAvailable()) dictation.current = await listen(lang);
      else {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) throw Error(t("Enable microphone access in your phone settings."));
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
      Keyboard.dismiss();
      setLevels(emptySamples());
      changeMode("recording");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      recordTimer.current = setTimeout(() => void stopRecording("insert"), 60000);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function stopRecording(next: "send" | "insert" | "cancel") {
    after.current = next;
    if (recordTimer.current) clearTimeout(recordTimer.current);
    recordTimer.current = null;
    const d = dictation.current;
    dictation.current = null;
    const ls = liveSession.current;
    liveSession.current = null;
    try {
      let text = "";
      if (ls) {
        if (next === "cancel") ls.abort();
        else {
          const r = await ls.finish();
          text = r.text;
          // The live stream broke or heard nothing: send the saved recording to the server instead.
          if (!text && r.fileUri) {
            changeMode("transcribing");
            text = await serverTranscribe(r.fileUri, "audio/wav").catch(() => "");
          }
        }
      } else if (d) {
        if (next === "cancel") d.abort();
        else {
          const r = await d.stop();
          text = [spoken.current, r.text].filter(Boolean).join(" ").trim();
          // Apple heard nothing: let the server try the saved audio.
          if (!text && r.audioUri) {
            changeMode("transcribing");
            text = await serverTranscribe(r.audioUri, "audio/wav").catch(() => "");
          }
          if (!text && r.error === "service-not-allowed")
            throw Error(t("Turn on Dictation in Settings → General → Keyboard so Fino can turn your voice into text."));
          if (!text && r.error === "language-not-supported") throw Error(t("This language isn't available for voice typing on your phone yet."));
        }
      } else {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false });
        if (next !== "cancel") {
          changeMode("transcribing");
          if (!recorder.uri) throw Error(t("No audio was captured."));
          text = await serverTranscribe(recorder.uri, "audio/mp4");
        }
      }
      if (next === "cancel") {
        changeMode("idle");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      if (!text) throw Error(t("I couldn't hear anything. Try again a little closer."));
      changeMode("transcribing");
      if (after.current === "send") await send([draft, text].filter(Boolean).join(" "));
      else {
        // The transcript eases into the box (fade + small rise) instead of popping in.
        textIn.setValue(0);
        changeMode("idle");
        setDraft((old) => [old, text].filter(Boolean).join(" "));
        Animated.timing(textIn, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      changeMode("idle");
    }
  }

  const canSend = !!draft.trim() || !!attachments.length;
  const stopping = running && !canSend;
  const seconds = Math.floor(elapsed / 1000);
  const langInfo = SPEECH_LANGS.find((l) => l.id === lang)!;
  return (
    <View
      style={{
        paddingHorizontal: space.md,
        paddingTop: space.sm,
        paddingBottom: keyboard ? space.sm : Math.max(insets.bottom, space.md),
        backgroundColor: p.background,
        gap: space.sm,
      }}
    >
      {!!error && (
        <FadeIn offset={4} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.sm }}>
          <Ionicons name="alert-circle" size={14} color={p.red} />
          <Text accessibilityRole="alert" style={[type.footnote, { color: p.red, flex: 1 }]} onPress={() => setError("")}>
            {error}
          </Text>
        </FadeIn>
      )}
      <View style={{ backgroundColor: p.raised, borderRadius: 22, borderWidth: 1, borderColor: mode === "recording" ? "#ff5a5f55" : p.line, overflow: "hidden" }}>
        {mode === "idle" ? (
          <>
            {!!attachments.length && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.md, paddingTop: space.md }}
              >
                {attachments.map((a, i) => (
                  <FadeIn key={`${a.name}-${i}`} offset={4}>
                    <View style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: p.elevated, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                      {a.image ? (
                        <Image source={{ uri: a.dataUrl }} style={{ width: 64, height: 64 }} contentFit="cover" />
                      ) : (
                        <View style={{ alignItems: "center", gap: 2, padding: 4 }}>
                          <Ionicons name="document-text-outline" size={20} color={p.muted} />
                          <Text style={{ color: p.muted, fontSize: 9 }} numberOfLines={1}>
                            {a.name}
                          </Text>
                        </View>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("Remove {name}", { name: a.name })}
                        hitSlop={8}
                        onPress={() => editAttachments((old) => old.filter((_, j) => j !== i))}
                        style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "#000000b0", alignItems: "center", justifyContent: "center" }}
                      >
                        <Ionicons name="close" size={13} color="#fff" />
                      </Pressable>
                    </View>
                  </FadeIn>
                ))}
              </ScrollView>
            )}
            {/* Text on top; below it: attach, the bot's model (tap to change), voice and send. */}
            <Animated.View style={{ opacity: textIn, transform: [{ translateY: textIn.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }}>
              <TextInput
                ref={input}
                accessibilityLabel={t("Message")}
                placeholder={t("Message {name}", { name: bot.name })}
                placeholderTextColor={p.faint}
                selectionColor={p.text}
                multiline
                value={draft}
                onChangeText={setDraft}
                onContentSizeChange={(e) => onInputSize(e.nativeEvent.contentSize.height)}
                style={{
                  fontSize: 16,
                  lineHeight: 21,
                  color: p.text,
                  minHeight: 38,
                  maxHeight: 130,
                  paddingHorizontal: space.md + 2,
                  paddingTop: 11,
                  paddingBottom: 2,
                  textAlign: "auto",
                  writingDirection: "auto",
                }}
              />
            </Animated.View>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingBottom: 6, paddingTop: 2, gap: 6 }}>
              <IconButton name="add" label={t("Add photo or file")} color={p.muted} size={34} iconSize={21} variant="filled" disabled={busy} onPress={attach} />
              <ModelChip bot={bot} />
              <View style={{ flex: 1 }} />
              {(canSend || stopping) && !busy && (
                <IconButton name="mic-outline" label={t("Record a voice message")} color={p.muted} size={34} iconSize={19} variant="filled" disabled={busy} onPress={() => void startRecording()} />
              )}
              {/* Main button: mic while empty, send once there's something to send, stop while the bot replies. */}
              <MainButton
                kind={stopping ? "stop" : canSend || busy ? "send" : "mic"}
                disabled={busy}
                onPress={() => {
                  if (stopping) void client.request("POST", `/bots/${bot.id}/interrupt`, { generation }).catch((e) => setError(e.message));
                  else if (canSend) void send();
                  else void startRecording();
                }}
              />
            </View>
          </>
        ) : mode === "recording" ? (
          <FadeIn offset={4} duration={200}>
            {speechAvailable() && (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md }}>
                <Text
                  numberOfLines={4}
                  style={[type.callout, { flex: 1, color: live ? p.text : p.faint, textAlign: "auto", writingDirection: "auto" }]}
                >
                  {live || t("Listening…")}
                </Text>
                {!liveAvailable() && <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("Dictation language: {name}. Tap to switch.", { name: langInfo.name })}
                  hitSlop={8}
                  onPress={() => void switchLanguage()}
                  style={{ minWidth: 34, height: 26, paddingHorizontal: 8, borderRadius: radius.full, backgroundColor: p.elevated, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: p.text, fontSize: 13, fontWeight: "700" }}>{langInfo.short}</Text>
                </Pressable>}
              </View>
            )}
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 6, gap: 4 }}>
            <IconButton name="trash-outline" label={t("Discard recording")} color={p.muted} size={40} iconSize={20} onPress={() => void stopRecording("cancel")} />
            <RecDot />
            <Text style={[type.callout, { color: p.text, fontVariant: ["tabular-nums"], width: 40 }]}>
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </Text>
            <Waveform levels={levels} />
            <IconButton name="checkmark" label={t("Done, put the text in the message box")} variant="primary" size={38} iconSize={21} onPress={() => void stopRecording("insert")} />
          </View>
          </FadeIn>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: space.lg, gap: space.md }}>
            <TypingDots color={p.muted} size={6} />
            <Text style={[type.callout, { color: p.muted }]}>{after.current === "send" ? t("Sending your voice message…") : t("Transcribing…")}</Text>
          </View>
        )}
      </View>
      {mode === "recording" && (
        <Text style={[type.caption, { color: p.faint, textAlign: "center", fontWeight: "400" }]}>{t("Tap ✓ to put the text in the box")}</Text>
      )}
    </View>
  );
});

/** Animates the next layout change (the box growing or shrinking) instead of jumping. */
function smooth(kind: "spring" | "ease" = "spring") {
  LayoutAnimation.configureNext(
    kind === "spring"
      ? {
          duration: 340,
          create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
          update: { type: LayoutAnimation.Types.spring, springDamping: 0.86 },
          delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        }
      : { duration: 180, update: { type: LayoutAnimation.Types.easeInEaseOut } },
  );
}

/** The bot's current model, like "DeepSeek V4.1 Flash" with its logo. Tapping opens the model settings. */
function ModelChip({ bot }: { bot: Bot }) {
  const provider = (bot as { agentProvider?: string }).agentProvider ?? "codex";
  const model = bot.model ?? "";
  const label =
    provider === "openrouter" ? modelName(model) : provider === "claude-code" ? "Claude Code" : provider === "claude" ? "Claude" : provider === "xai" ? "Grok" : provider === "groq" ? "Groq" : "ChatGPT";
  const mark =
    provider === "openrouter" ? <ModelMark model={model || "deepseek/"} size={15} /> : provider === "claude" || provider === "claude-code" ? <ProviderMark provider="claude" size={14} /> : provider === "codex" ? <ProviderMark provider="codex" size={14} /> : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("Model: {name}. Tap to change.", { name: label })}
      onPress={() => {
        void Haptics.selectionAsync();
        router.push("/model");
      }}
      hitSlop={4}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: pressed ? p.elevated : p.background, maxWidth: 210 })}
    >
      {mark}
      <Text numberOfLines={1} style={{ color: p.text, fontSize: 14, fontWeight: "500", flexShrink: 1 }}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={13} color={p.muted} />
    </Pressable>
  );
}

const MAIN = {
  mic: { icon: "mic", label: t("Record a voice message"), size: 19 },
  send: { icon: "arrow-up", label: t("Send message"), size: 20 },
  stop: { icon: "stop", label: t("Stop response"), size: 15 },
} as const;
/** The composer's main button. Its icon swaps with a quick scale so the change is noticeable but calm. */
function MainButton({ kind, disabled, onPress }: { kind: keyof typeof MAIN; disabled?: boolean; onPress: () => void }) {
  const v = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState(kind);
  useEffect(() => {
    if (kind === shown) return;
    Animated.timing(v, { toValue: 0, duration: 90, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setShown(kind);
      Animated.spring(v, { toValue: 1, damping: 14, stiffness: 260, mass: 0.6, useNativeDriver: true }).start();
    });
  }, [kind]);
  const m = MAIN[shown];
  return (
    <Animated.View style={{ opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
      <IconButton name={m.icon} label={MAIN[kind].label} variant="primary" size={34} iconSize={m.size} disabled={disabled} onPress={onPress} />
    </Animated.View>
  );
}

function RecDot() {
  const v = useLoop(1000);
  return (
    <Animated.View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: p.red,
        marginLeft: 4,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }),
      }}
    />
  );
}

/**
 * Live voice waveform: rounded bars that scroll in from the right. Newer bars are brighter, quiet
 * moments rest on a soft baseline, and heights ease between samples so it moves like speech.
 */
const WAVE_H = 30;
const BAR_W = 3;
const STEP = 6; // bar width + gap
function Waveform({ levels }: { levels: Sample[] }) {
  const n = levels.length;
  // Each new sample adds a bar on the right. Instead of jumping left a whole bar, the row starts one
  // step to the right and glides back over the time until the next sample, so it scrolls continuously.
  const shift = useRef(new Animated.Value(0)).current;
  const newest = levels[n - 1]?.id;
  React.useLayoutEffect(() => {
    shift.setValue(STEP);
    Animated.timing(shift, { toValue: 0, duration: TICK, easing: Easing.linear, useNativeDriver: true }).start();
  }, [newest]);
  return (
    <View style={{ flex: 1, height: WAVE_H + 6, overflow: "hidden", justifyContent: "center" }}>
      <Animated.View style={{ direction: "ltr", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: STEP - BAR_W, paddingRight: 4, transform: [{ translateX: shift }] }}>
        {levels.map((l, i) => (
          <Bar key={l.id} level={l.v} fade={0.28 + 0.72 * (i / Math.max(1, n - 1)) ** 1.4} />
        ))}
      </Animated.View>
    </View>
  );
}
function Bar({ level, fade }: { level: number; fade: number }) {
  // Background noise stays on the baseline; speech rises clearly above it.
  const x = Math.min(1, Math.max(0, (level - 0.14) / 0.86));
  const target = 4 + (WAVE_H - 4) * x ** 0.75; // bar height in points
  // All movement runs on the native thread (useNativeDriver), so the bars stay smooth while JS streams
  // audio. A stretched middle plus two round caps that slide with it keeps the ends round at any height.
  // Each bar keeps its own height (it belongs to one moment of sound); it just grows in once.
  const h = useRef(new Animated.Value(4)).current;
  useEffect(() => {
    Animated.timing(h, { toValue: target, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [target]);
  const body = WAVE_H - BAR_W;
  const scaleY = h.interpolate({ inputRange: [BAR_W, WAVE_H], outputRange: [0, 1], extrapolate: "clamp" });
  const up = h.interpolate({ inputRange: [BAR_W, WAVE_H], outputRange: [0, -body / 2], extrapolate: "clamp" });
  const down = h.interpolate({ inputRange: [BAR_W, WAVE_H], outputRange: [0, body / 2], extrapolate: "clamp" });
  const cap = { position: "absolute" as const, width: BAR_W, height: BAR_W, borderRadius: BAR_W / 2, backgroundColor: p.text };
  return (
    <View style={{ width: BAR_W, height: WAVE_H, alignItems: "center", justifyContent: "center", opacity: fade }}>
      <Animated.View style={{ width: BAR_W, height: body, backgroundColor: p.text, transform: [{ scaleY }] }} />
      <Animated.View style={[cap, { transform: [{ translateY: up }] }]} />
      <Animated.View style={[cap, { transform: [{ translateY: down }] }]} />
    </View>
  );
}
