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
import { SPEECH_LANGS, getSpeechLang, setSpeechLang, speechAvailable, startDictation, type Dictation, type SpeechLang } from "../lib/speech";
import { useWorkspace } from "../lib/store";
import { IconButton } from "./UI";
import { FadeIn, TypingDots, useLoop } from "./motion";
import { palette as p, type, space, radius } from "../theme";

export interface ComposerHandle {
  prefill(text: string): void;
}
type Mode = "idle" | "recording" | "transcribing";
const BARS = 32;

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
    [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const insets = useSafeAreaInsets();
  const running = useWorkspace((x) => x.live[bot.id]?.isRunning ?? false);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }),
    recording = useAudioRecorderState(recorder, 90);
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
  useEffect(() => () => dictation.current?.abort(), []);
  const editAttachments = (f: (old: typeof attachments) => typeof attachments) => {
    smooth();
    setAttachments(f);
  };
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
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboard(false));
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
    const level = Math.max(0.06, Math.min(1, (db + 55) / 50));
    setLevels((old) => [...old.slice(1), level]);
  }, [recording.durationMillis]);

  async function files() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (picked.canceled) return;
      const added: typeof attachments = [];
      for (const file of picked.assets) {
        if ((file.size ?? 0) > 10 * 1024 * 1024) throw Error("Choose files under 10 MB.");
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
        if (!permission.granted) throw Error("Enable camera access in your phone settings.");
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.65, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.65, base64: true, allowsMultipleSelection: true, selectionLimit: 4 });
      if (result.canceled) return;
      const added = result.assets.map((asset, i) => {
        if (!asset.base64 || asset.base64.length > 4 * 1024 * 1024) throw Error("Choose a smaller photo (under 3 MB).");
        return { name: asset.fileName ?? `Photo-${i + 1}.jpg`, dataUrl: `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`, image: true };
      });
      editAttachments((old) => [...old, ...added].slice(0, 8));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function attach() {
    const options = [
      { label: "Take photo", run: () => void photo(true) },
      { label: "Photo library", run: () => void photo() },
      { label: "Choose files", run: () => void files() },
    ];
    if (Platform.OS === "ios")
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options.map((o) => o.label), "Cancel"], cancelButtonIndex: options.length, userInterfaceStyle: "dark" },
        (i) => options[i]?.run(),
      );
    else Alert.alert("Add to message", "", [...options.map((o) => ({ text: o.label, onPress: o.run })), { text: "Cancel", style: "cancel" as const }]);
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
      level: (v) => setLevels((old) => [...old.slice(1), v]),
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
    if (!response.ok) throw Error(result.error ?? "Transcription failed.");
    return String(result.text ?? "").trim();
  }
  async function startRecording() {
    try {
      spoken.current = "";
      setLive("");
      if (speechAvailable()) dictation.current = await listen(lang);
      else {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) throw Error("Enable microphone access in your phone settings.");
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
      Keyboard.dismiss();
      setLevels(Array(BARS).fill(0));
      changeMode("recording");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      recordTimer.current = setTimeout(() => void stopRecording("send"), 60000);
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
    try {
      let text = "";
      if (d) {
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
            throw Error("Turn on Dictation in Settings → General → Keyboard so Fino can turn your voice into text.");
          if (!text && r.error === "language-not-supported") throw Error("This language isn't available for voice typing on your phone yet.");
        }
      } else {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false });
        if (next !== "cancel") {
          changeMode("transcribing");
          if (!recorder.uri) throw Error("No audio was captured.");
          text = await serverTranscribe(recorder.uri, "audio/mp4");
        }
      }
      if (next === "cancel") {
        changeMode("idle");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      if (!text) throw Error("I couldn't hear anything. Try again a little closer.");
      changeMode("transcribing");
      if (after.current === "send") await send([draft, text].filter(Boolean).join(" "));
      else {
        setDraft((old) => [old, text].filter(Boolean).join(" "));
        setTimeout(() => input.current?.focus(), 80);
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
      <View style={{ backgroundColor: p.raised, borderRadius: radius.xl, borderWidth: 1, borderColor: mode === "recording" ? "#ff5a5f55" : p.line, overflow: "hidden" }}>
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
                        accessibilityLabel={`Remove ${a.name}`}
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
            <TextInput
              ref={input}
              accessibilityLabel="Message"
              placeholder={`Message ${bot.name}`}
              placeholderTextColor={p.faint}
              selectionColor={p.text}
              multiline
              value={draft}
              onChangeText={setDraft}
              onContentSizeChange={(e) => onInputSize(e.nativeEvent.contentSize.height)}
              style={{
                fontSize: 17,
                lineHeight: 23,
                color: p.text,
                minHeight: 46,
                maxHeight: 150,
                paddingHorizontal: space.lg,
                paddingTop: 13,
                paddingBottom: 4,
                textAlign: "auto",
                writingDirection: "auto",
              }}
            />
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingBottom: 6, gap: 2 }}>
              <IconButton name="add" label="Add photo or file" color={p.muted} size={38} iconSize={22} disabled={busy} onPress={attach} />
              <View style={{ flex: 1 }} />
              {/* One main button: mic while empty, send once there's something to send. Calls live in the header. */}
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
                  {live || "Listening…"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Dictation language: ${langInfo.name}. Tap to switch.`}
                  hitSlop={8}
                  onPress={() => void switchLanguage()}
                  style={{ minWidth: 34, height: 26, paddingHorizontal: 8, borderRadius: radius.full, backgroundColor: p.elevated, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: p.text, fontSize: 13, fontWeight: "700" }}>{langInfo.short}</Text>
                </Pressable>
              </View>
            )}
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: 84, paddingHorizontal: 8, gap: 4 }}>
            <IconButton name="trash-outline" label="Discard recording" color={p.muted} size={40} iconSize={20} onPress={() => void stopRecording("cancel")} />
            <RecDot />
            <Text style={[type.callout, { color: p.text, fontVariant: ["tabular-nums"], width: 40 }]}>
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </Text>
            <Waveform levels={levels} />
            <IconButton name="text-outline" label="Turn into text to edit" color={p.text} variant="filled" size={38} iconSize={18} onPress={() => void stopRecording("insert")} />
            <IconButton name="arrow-up" label="Send voice message" variant="primary" size={38} iconSize={20} onPress={() => void stopRecording("send")} />
          </View>
          </FadeIn>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: 84, paddingHorizontal: space.lg, gap: space.md }}>
            <TypingDots color={p.muted} size={6} />
            <Text style={[type.callout, { color: p.muted }]}>{after.current === "send" ? "Sending your voice message…" : "Transcribing…"}</Text>
          </View>
        )}
      </View>
      {mode === "recording" && (
        <Text style={[type.caption, { color: p.faint, textAlign: "center", fontWeight: "400" }]}>Send it as a message, or tap Aa to edit the text first</Text>
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

const MAIN = {
  mic: { icon: "mic", label: "Record a voice message", size: 19 },
  send: { icon: "arrow-up", label: "Send message", size: 20 },
  stop: { icon: "stop", label: "Stop response", size: 15 },
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
      <IconButton name={m.icon} label={MAIN[kind].label} variant="primary" size={36} iconSize={m.size} disabled={disabled} onPress={onPress} />
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

function Waveform({ levels }: { levels: number[] }) {
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2.5, height: 36, overflow: "hidden" }}>
      {levels.map((l, i) => (
        <Bar key={i} level={l} />
      ))}
    </View>
  );
}
function Bar({ level }: { level: number }) {
  const h = useRef(new Animated.Value(level)).current;
  useEffect(() => {
    Animated.timing(h, { toValue: level, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [level]);
  return (
    <Animated.View
      style={{
        width: 3,
        height: 32,
        borderRadius: 2,
        backgroundColor: p.text,
        opacity: 0.85,
        transform: [{ scaleY: h }],
      }}
    />
  );
}
