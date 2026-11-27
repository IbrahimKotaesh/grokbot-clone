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
import { palette as p, type, space, radius, fw } from "../theme";
import { statusLine, usesComputer } from "../lib/format";
import { t } from "../lib/i18n";

const statusCopy: Record<ComputerState["status"], { label: string; tone: "live" | "busy" | "off" | "bad" }> = {
  running: { label: t("Online"), tone: "live" },
  creating: { label: t("Setting up"), tone: "busy" },
  starting: { label: t("Starting"), tone: "busy" },
  resuming: { label: t("Waking up"), tone: "busy" },
  suspending: { label: t("Going to sleep"), tone: "busy" },
  suspended: { label: t("Asleep"), tone: "off" },
  stopped: { label: t("Off"), tone: "off" },
  absent: { label: t("Not set up yet"), tone: "off" },
  error: { label: t("Needs attention"), tone: "bad" },
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
        title={t("Computer")}
        left={<IconButton name="chevron-down" label={t("Close")} onPress={done} />}
        right={<IconButton name="refresh" label={t("Refresh status")} color={p.muted} onPress={() => void loadState()} />}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md }}>
        <FadeIn style={[s.row, { paddingVertical: space.sm }]}>
          <Avatar shape={bot.avatarShape} size={44} color={bot.avatarColor} status={working ? "working" : null} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.headline, { color: p.text }]}>{bot.name}&apos;s screen</Text>
            <Text style={[type.footnote, { color: p.muted }]}>{t("Its own desktop on your cloud computer")}</Text>
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
            accessibilityLabel={t("Enlarge screen")}
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
                  <Text style={{ color: "#fff", fontSize: 10, ...fw("700"), letterSpacing: 0.6 }}>LIVE</Text>
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
                  {running ? t("{name} hasn't opened a screen yet", { name: bot.name }) : computer?.status === "absent" ? t("No computer yet") : t("The computer is {name}", { name: st.label.toLowerCase() })}
                </Text>
                <Text style={[type.footnote, { color: p.muted, textAlign: "center", maxWidth: 260 }]}>
                  {running
                    ? t("Ask it to open a website or an app and you'll watch it work here.")
                    : t("Wake it up to see what your bot sees. It sleeps on its own when nobody is using it.")}
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
              title={computer?.status === "absent" ? t("Set up computer") : t("Wake computer")}
              icon="power"
              busy={busy === "wake" || statusCopy[computer?.status ?? "absent"].tone === "busy"}
              onPress={() => void run("wake", "POST", "/computer/ensure")}
            />
          ) : (
            <Button title={t("Give it a task")} icon="chatbubble-ellipses" onPress={done} />
          )}
        </FadeIn>

        <SectionLabel>{t("Controls")}</SectionLabel>
        <Group>
          <ListRow
            leading={
              <View style={[s.rowIcon, { backgroundColor: "#df9c7822" }]}>
                <ProviderMark provider="claude" size={17} />
              </View>
            }
            title={t("Claude Code")}
            subtitle={t("Run Claude Code here with your own Claude subscription")}
            onPress={openClaudeCode}
          />
          <ListRow
            icon="sparkles-outline"
            title={t("Clean screen")}
            subtitle={t("Close {name}'s windows and start fresh", { name: bot.name })}
            onPress={!running ? undefined : () =>
              Alert.alert(t("Clean this screen?"), t("{name}'s open windows will close.", { name: bot.name }), [
                { text: t("Cancel"), style: "cancel" },
                { text: t("Clean screen"), style: "destructive", onPress: () => void run("reset", "POST", `/bots/${bot.id}/screen/reset`) },
              ])
            }
            chevron={false}
            trailing={busy === "reset" ? <TypingDots color={p.muted} size={4} /> : undefined}
          />
          <ListRow
            icon="moon-outline"
            title={t("Put computer to sleep")}
            subtitle={t("Pauses every bot's screen to save resources")}
            onPress={
              running
                ? () =>
                    Alert.alert(t("Put the computer to sleep?"), t("All bots share this machine. It wakes again when one needs it."), [
                      { text: t("Cancel"), style: "cancel" },
                      { text: t("Sleep"), onPress: () => void run("sleep", "POST", "/computer/suspend") },
                    ])
                : undefined
            }
            chevron={false}
          />
        </Group>
        <SectionLabel>{t("About")}</SectionLabel>
        <Group>
          <ListRow icon="layers-outline" title={t("Own screen per bot")} subtitle={t("Every bot works in its own window space, so they never get in each other's way.")} />
          <ListRow icon="shield-checkmark-outline" title={t("You stay in control")} subtitle={t("Sensitive actions still ask for your approval in the chat.")} />
        </Group>
      </ScrollView>
      <Modal visible={zoom} animationType="fade" supportedOrientations={["portrait", "landscape"]} onRequestClose={() => setZoom(false)}>
        <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}>
          <ScrollView maximumZoomScale={5} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            {frame && <Image source={{ uri: frame, headers: authHeaders() }} style={{ width, height: height * 0.8 }} contentFit="contain" cachePolicy="none" transition={160} />}
          </ScrollView>
          <View style={{ position: "absolute", top: 56, right: space.lg }}>
            <IconButton name="close" label={t("Close")} variant="filled" onPress={() => setZoom(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
