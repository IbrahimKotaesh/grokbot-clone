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
import { useWorkspace } from "../lib/store";
import { IconButton } from "./UI";
import { FadeIn, TypingDots, useLoop } from "./motion";
import { palette as p, type, space, radius } from "../theme";

export interface ComposerHandle {
  prefill(text: string): void;
}
type Mode = "idle" | "recording" | "transcribing";
const BARS = 32;

export const Composer = forwardRef<ComposerHandle, { bot: Bot; generation: number; openCall: () => void }>(function Composer(
  { bot, generation, openCall },
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
      setAttachments((old) => [...old, ...added].slice(0, 8));
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
      setAttachments((old) => [...old, ...added].slice(0, 8));
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
  async function startRecording() {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw Error("Enable microphone access in your phone settings.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      Keyboard.dismiss();
      setLevels(Array(BARS).fill(0));
      setMode("recording");
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
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (next === "cancel") {
        setMode("idle");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      setMode("transcribing");
      if (!recorder.uri) throw Error("No audio was captured.");
      const data = await new File(recorder.uri).bytes();
      const response = await nativeFetch(`${client.base}/api/voice/transcribe`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "audio/mp4" },
        body: data,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Transcription failed.");
      const text = String(result.text ?? "").trim();
      if (!text) throw Error("I couldn't hear anything. Try again a little closer.");
      if (after.current === "send") await send([draft, text].filter(Boolean).join(" "));
      else {
        setDraft((old) => [old, text].filter(Boolean).join(" "));
        setTimeout(() => input.current?.focus(), 80);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMode("idle");
    }
  }

  const canSend = !!draft.trim() || !!attachments.length;
  const stopping = running && !canSend;
  const seconds = Math.floor(recording.durationMillis / 1000);
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
      <View style={{ backgroundColor: p.raised, borderRadius: radius.xl, borderWidth: 1, borderColor: p.line, overflow: "hidden" }}>
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
                        onPress={() => setAttachments((old) => old.filter((_, j) => j !== i))}
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
              <IconButton name="mic-outline" label="Record a voice message" color={p.muted} size={38} iconSize={21} disabled={busy} onPress={() => void startRecording()} />
              {canSend || running || busy ? (
                <IconButton
                  name={stopping ? "stop" : "arrow-up"}
                  label={stopping ? "Stop response" : "Send message"}
                  variant="primary"
                  size={36}
                  iconSize={stopping ? 15 : 20}
                  disabled={busy}
                  onPress={() => {
                    if (stopping) void client.request("POST", `/bots/${bot.id}/interrupt`, { generation }).catch((e) => setError(e.message));
                    else void send();
                  }}
                />
              ) : (
                <IconButton name="call" label={`Call ${bot.name}`} variant="primary" size={36} iconSize={17} onPress={openCall} />
              )}
            </View>
          </>
        ) : mode === "recording" ? (
          <FadeIn offset={4} duration={200} style={{ flexDirection: "row", alignItems: "center", minHeight: 84, paddingHorizontal: 8, gap: 4 }}>
            <IconButton name="trash-outline" label="Discard recording" color={p.muted} size={40} iconSize={20} onPress={() => void stopRecording("cancel")} />
            <RecDot />
            <Text style={[type.callout, { color: p.text, fontVariant: ["tabular-nums"], width: 40 }]}>
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </Text>
            <Waveform levels={levels} />
            <IconButton name="text-outline" label="Turn into text to edit" color={p.text} variant="filled" size={38} iconSize={18} onPress={() => void stopRecording("insert")} />
            <IconButton name="arrow-up" label="Send voice message" variant="primary" size={38} iconSize={20} onPress={() => void stopRecording("send")} />
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
