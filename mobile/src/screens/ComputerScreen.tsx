import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, Modal, Animated, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComputerState } from "../../../packages/contracts/src/types";
import { client, authHeaders } from "../lib/session";
import { useWorkspace } from "../lib/store";
import { Avatar, Button, ErrorText, Group, Header, IconButton, ListRow, ProviderMark, SectionLabel, styles as s } from "../components/UI";
import { FadeIn, TypingDots, useLoop } from "../components/motion";
import { palette as p, type, space, radius } from "../theme";
import { statusLine, usesComputer } from "../lib/format";

const statusCopy: Record<ComputerState["status"], { label: string; tone: "live" | "busy" | "off" | "bad" }> = {
  running: { label: "Online", tone: "live" },
  creating: { label: "Setting up", tone: "busy" },
  starting: { label: "Starting", tone: "busy" },
  resuming: { label: "Waking up", tone: "busy" },
  suspending: { label: "Going to sleep", tone: "busy" },
  suspended: { label: "Asleep", tone: "off" },
  stopped: { label: "Off", tone: "off" },
  absent: { label: "Not set up yet", tone: "off" },
  error: { label: "Needs attention", tone: "bad" },
};

export function ComputerScreen({ done, openClaudeCode }: { done: () => void; openClaudeCode?: () => void }) {
  const bot = useWorkspace((x) => x.bots.find((b) => b.id === x.selected));
  const live = useWorkspace((x) => (x.selected ? x.live[x.selected] : undefined));
  const [computer, setComputer] = useState<ComputerState | null>(null),
    [frame, setFrame] = useState<string | null>(null),
    [noScreen, setNoScreen] = useState(false),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [zoom, setZoom] = useState(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tick = useRef(0);
  const running = computer?.status === "running";
  const loadState = useCallback(async () => {
    try {
      const { computer } = await client.request<{ computer: ComputerState }>("GET", "/computer");
      setComputer(computer);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void loadState();
    const t = setInterval(() => void loadState(), running ? 8000 : 3000);
    return () => clearInterval(t);
  }, [running]);
  // A fresh screenshot every ~1.2s while the machine is up; expo-image cross-fades frames.
  useEffect(() => {
    if (!running || !bot) return;
    const next = () => setFrame(`${client.base}/api/bots/${bot.id}/screenshot?t=${Date.now()}-${tick.current++}`);
    next();
    const t = setInterval(next, 1200);
    return () => clearInterval(t);
  }, [running, bot?.id]);
  const pulse = useLoop(1400, running);
  if (!bot) return null;
  const st = statusCopy[computer?.status ?? "absent"];
  const toneColor = { live: p.green, busy: p.amber, off: p.faint, bad: p.red }[st.tone];
  const working = usesComputer(live);
  const run = async (key: string, method: "POST", path: string) => {
    setBusy(key);
    setError(null);
    try {
      const r = await client.request<{ computer?: ComputerState }>(method, path);
      if (r.computer) setComputer(r.computer);
      else await loadState();
      setNoScreen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const frameW = width - space.lg * 2;
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <Header
        large={false}
        title="Computer"
        left={<IconButton name="chevron-down" label="Close" onPress={done} />}
        right={<IconButton name="refresh" label="Refresh status" color={p.muted} onPress={() => void loadState()} />}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md }}>
        <FadeIn style={[s.row, { paddingVertical: space.sm }]}>
          <Avatar shape={bot.avatarShape} size={44} color={bot.avatarColor} status={working ? "working" : null} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.headline, { color: p.text }]}>{bot.name}&apos;s screen</Text>
            <Text style={[type.footnote, { color: p.muted }]}>Its own desktop on your cloud computer</Text>
          </View>
          <View style={[s.row, { gap: 6, backgroundColor: p.surface, borderRadius: radius.full, paddingHorizontal: 10, height: 28, borderWidth: 1, borderColor: p.line }]}>
            <Animated.View
              style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: toneColor, opacity: running ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }) : 1 }}
            />
            <Text style={[type.caption, { color: p.text }]}>{st.label}</Text>
          </View>
        </FadeIn>

        <FadeIn delay={80}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enlarge screen"
            disabled={!running || noScreen}
            onPress={() => setZoom(true)}
            style={{
              width: frameW,
              height: frameW * 0.625,
              borderRadius: radius.lg,
              backgroundColor: p.surface,
              borderWidth: 1,
              borderColor: p.lineStrong,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {running && frame && !noScreen ? (
              <>
                <Image
                  source={{ uri: frame, headers: authHeaders() }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="contain"
                  cachePolicy="none"
                  transition={160}
                  onError={() => setNoScreen(true)}
                />
                <View style={[s.row, { position: "absolute", top: 10, left: 10, gap: 5, backgroundColor: "#000000b3", borderRadius: radius.full, paddingHorizontal: 8, height: 22 }]}>
                  <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.red, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }} />
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 0.6 }}>LIVE</Text>
                </View>
                <View style={{ position: "absolute", bottom: 10, right: 10, backgroundColor: "#000000b3", borderRadius: 14, padding: 5 }}>
                  <Ionicons name="expand" size={14} color="#fff" />
                </View>
              </>
            ) : (
              <View style={{ alignItems: "center", gap: space.sm, padding: space.xl }}>
                {computer?.status && statusCopy[computer.status].tone === "busy" ? (
                  <TypingDots color={p.muted} />
                ) : (
                  <Ionicons name={running ? "desktop-outline" : "moon-outline"} size={30} color={p.faint} />
                )}
                <Text style={[type.callout, { color: p.text, textAlign: "center" }]}>
                  {running ? `${bot.name} hasn't opened a screen yet` : computer?.status === "absent" ? "No computer yet" : `The computer is ${st.label.toLowerCase()}`}
                </Text>
                <Text style={[type.footnote, { color: p.muted, textAlign: "center", maxWidth: 260 }]}>
                  {running
                    ? "Ask it to open a website or an app and you'll watch it work here."
                    : "Wake it up to see what your bot sees. It sleeps on its own when nobody is using it."}
                </Text>
              </View>
            )}
          </Pressable>
        </FadeIn>

        {live?.isRunning && (
          <FadeIn style={[s.row, { gap: 10, paddingHorizontal: space.xs }]}>
            <TypingDots color={working ? p.green : p.muted} size={5} />
            <Text style={[type.footnote, { color: working ? p.green : p.muted, flex: 1 }]} numberOfLines={1}>
              {statusLine(bot, live)}
            </Text>
          </FadeIn>
        )}
        <ErrorText error={error ?? (computer?.status === "error" ? computer.error : null)} />

        <FadeIn delay={140} style={{ gap: space.sm }}>
          {!running ? (
            <Button
              title={computer?.status === "absent" ? "Set up computer" : "Wake computer"}
              icon="power"
              busy={busy === "wake" || statusCopy[computer?.status ?? "absent"].tone === "busy"}
              onPress={() => void run("wake", "POST", "/computer/ensure")}
            />
          ) : (
            <Button title="Give it a task" icon="chatbubble-ellipses" onPress={done} />
          )}
        </FadeIn>

        <SectionLabel>Controls</SectionLabel>
        <Group>
          <ListRow
            leading={
              <View style={[s.rowIcon, { backgroundColor: "#df9c7822" }]}>
                <ProviderMark provider="claude" size={17} />
              </View>
            }
            title="Claude Code"
            subtitle="Run Claude Code here with your own Claude subscription"
            onPress={openClaudeCode}
          />
          <ListRow
            icon="sparkles-outline"
            title="Clean screen"
            subtitle={`Close ${bot.name}'s windows and start fresh`}
            onPress={!running ? undefined : () =>
              Alert.alert("Clean this screen?", `${bot.name}'s open windows will close.`, [
                { text: "Cancel", style: "cancel" },
                { text: "Clean screen", style: "destructive", onPress: () => void run("reset", "POST", `/bots/${bot.id}/screen/reset`) },
              ])
            }
            chevron={false}
            trailing={busy === "reset" ? <TypingDots color={p.muted} size={4} /> : undefined}
          />
          <ListRow
            icon="moon-outline"
            title="Put computer to sleep"
            subtitle="Pauses every bot's screen to save resources"
            onPress={
              running
                ? () =>
                    Alert.alert("Put the computer to sleep?", "All bots share this machine. It wakes again when one needs it.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Sleep", onPress: () => void run("sleep", "POST", "/computer/suspend") },
                    ])
                : undefined
            }
            chevron={false}
          />
        </Group>
        <SectionLabel>About</SectionLabel>
        <Group>
          <ListRow icon="layers-outline" title="Own screen per bot" subtitle="Every bot works in its own window space, so they never get in each other's way." />
          <ListRow icon="shield-checkmark-outline" title="You stay in control" subtitle="Sensitive actions still ask for your approval in the chat." />
        </Group>
      </ScrollView>
      <Modal visible={zoom} animationType="fade" supportedOrientations={["portrait", "landscape"]} onRequestClose={() => setZoom(false)}>
        <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}>
          <ScrollView maximumZoomScale={5} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            {frame && <Image source={{ uri: frame, headers: authHeaders() }} style={{ width, height: height * 0.8 }} contentFit="contain" cachePolicy="none" transition={160} />}
          </ScrollView>
          <View style={{ position: "absolute", top: 56, right: space.lg }}>
            <IconButton name="close" label="Close" variant="filled" onPress={() => setZoom(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
