import { Image } from "expo-image";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
  useAudioRecorderState,
} from "expo-audio";
import { fetch as nativeFetch } from "expo/fetch";
import type { Bot } from "../../../packages/contracts/src/types";
import type { Attachment } from "../../../packages/client/src";
import { client, authHeaders } from "../lib/session";
import { useWorkspace } from "../lib/store";
import { IconButton, ProviderMark, styles as s } from "./UI";
import { palette as p } from "../theme";
export function Composer({
  bot,
  generation,
  onModels,
}: {
  bot: Bot;
  generation: number;
  onModels: () => void;
}) {
  const [draft, setDraft] = useState(""),
    [attachments, setAttachments] = useState<
      (Attachment & { image: boolean })[]
    >([]),
    [busy, setBusy] = useState(false),
    [transcribing, setTranscribing] = useState(false),
    [error, setError] = useState("");
  const running = useWorkspace((x) => x.live[bot.id]?.isRunning ?? false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY),
    recording = useAudioRecorderState(recorder, 250);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (recordTimer.current) clearTimeout(recordTimer.current);
    },
    [],
  );
  async function files() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const added: typeof attachments = [];
      for (const file of picked.assets) {
        if ((file.size ?? 0) > 10 * 1024 * 1024)
          throw Error("Choose files under 10 MB.");
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
        if (!permission.granted)
          throw Error("Enable camera access in your phone settings.");
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.65,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.65,
            base64: true,
            allowsMultipleSelection: true,
            selectionLimit: 4,
          });
      if (result.canceled) return;
      const added = result.assets.map((asset, i) => {
        if (!asset.base64 || asset.base64.length > 4 * 1024 * 1024)
          throw Error("Choose a smaller photo (under 3 MB).");
        return {
          name: asset.fileName ?? `Photo-${i + 1}.jpg`,
          dataUrl: `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`,
          image: true,
        };
      });
      setAttachments((old) => [...old, ...added].slice(0, 8));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function send() {
    if (busy || (!draft.trim() && !attachments.length)) return;
    setBusy(true);
    setError("");
    try {
      const { row } = await client.send(
        bot.id,
        generation,
        draft,
        attachments.filter((a) => a.image),
        attachments.filter((a) => !a.image),
      );
      useWorkspace
        .getState()
        .event({ type: "rows", botId: bot.id, generation, rows: [row] });
      setDraft("");
      setAttachments([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function startRecording() {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted)
        throw Error("Enable microphone access in your phone settings.");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordTimer.current = setTimeout(() => void stopRecording(), 60000);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function stopRecording() {
    if (recordTimer.current) clearTimeout(recordTimer.current);
    recordTimer.current = null;
    setTranscribing(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (!recorder.uri) throw Error("No audio was captured.");
      const data = await new File(recorder.uri).bytes();
      const response = await nativeFetch(
        `${client.base}/api/voice/transcribe`,
        {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "audio/mp4" },
          body: data,
        },
      );
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Transcription failed.");
      setDraft((old) => [old, result.text].filter(Boolean).join(" "));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTranscribing(false);
    }
  }
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 8,
        backgroundColor: p.background,
        borderTopWidth: 0.5,
        borderTopColor: p.line,
        gap: 8,
      }}
    >
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: p.red, fontSize: 13 }}>
          {error}
        </Text>
      )}
      {attachments.map((a, i) => (
        <Pressable
          key={i}
          accessibilityLabel={`Remove ${a.name}`}
          onPress={() => setAttachments((old) => old.filter((_, j) => j !== i))}
          style={[
            s.row,
            { padding: 8, backgroundColor: p.raised, borderRadius: 10 },
          ]}
        >
          {a.image && (
            <Image
              source={{ uri: a.dataUrl }}
              style={{ width: 44, height: 44, borderRadius: 8 }}
              contentFit="cover"
            />
          )}
          <Text style={[s.muted, { flex: 1 }]} numberOfLines={1}>
            {a.image ? "Photo" : "File"} · {a.name}
          </Text>
          <Text style={s.text}>×</Text>
        </Pressable>
      ))}
      <View
        style={{ backgroundColor: p.surface, borderRadius: 22, padding: 8 }}
      >
        <TextInput
          accessibilityLabel="Message"
          placeholder={`Message ${bot.name}…`}
          placeholderTextColor={p.muted}
          multiline
          value={draft}
          onChangeText={setDraft}
          style={{
            fontSize: 17,
            lineHeight: 25,
            color: p.text,
            minHeight: 56,
            maxHeight: 160,
            paddingHorizontal: 10,
            paddingTop: 10,
            textAlign: "auto",
            writingDirection: "auto",
          }}
        />
        <View style={[s.row, { gap: 2 }]}>
          <IconButton
            name="add"
            label="Add attachment"
            onPress={() =>
              Alert.alert("Add to conversation", "", [
                { text: "Photo library", onPress: () => void photo() },
                { text: "Take photo", onPress: () => void photo(true) },
                { text: "Choose files", onPress: () => void files() },
                { text: "Cancel", style: "cancel" },
              ])
            }
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose model"
            onPress={onModels}
            style={[s.row, { padding: 8, borderRadius: 12, gap: 6 }]}
          >
            <ProviderMark provider={bot.agentProvider ?? "codex"} />
            <Text style={{ fontSize: 14, color: p.text }}>
              {bot.agentProvider === "claude" ? "Claude" : "ChatGPT"}
            </Text>
            <Text style={s.muted}>⌄</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {transcribing ? (
            <ActivityIndicator color={p.blue} />
          ) : (
            <IconButton
              name={recording.isRecording ? "stop-circle" : "mic-outline"}
              color={recording.isRecording ? p.red : p.muted}
              label={
                recording.isRecording ? "Finish recording" : "Record voice"
              }
              onPress={() =>
                void (recording.isRecording
                  ? stopRecording()
                  : startRecording())
              }
            />
          )}
          <IconButton
            name={
              running && !draft.trim() && !attachments.length
                ? "stop"
                : "arrow-up"
            }
            label={
              running && !draft.trim() && !attachments.length
                ? "Stop response"
                : "Send message"
            }
            disabled={busy || transcribing}
            color={p.blue}
            onPress={() => {
              if (running && !draft.trim() && !attachments.length)
                void client
                  .request("POST", `/bots/${bot.id}/interrupt`, { generation })
                  .catch((e) => setError(e.message));
              else void send();
            }}
          />
        </View>
      </View>
      {recording.isRecording && (
        <Text style={s.muted}>
          Recording · {Math.floor(recording.durationMillis / 1000)}s · Tap stop
          to transcribe
        </Text>
      )}
    </View>
  );
}
