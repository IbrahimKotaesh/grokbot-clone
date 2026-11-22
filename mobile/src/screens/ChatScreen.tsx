import React, { useRef, useState, useMemo, useEffect } from "react";
import { voiceCallsAvailable } from "../lib/voice-call";
import {
  View,
  Text,
  FlatList,

  Platform,
  Pressable,
  ActionSheetIOS,
  Alert,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { chatTimeline, type ChatItem } from "../lib/chat-timeline";
import { WorkDetails } from "../components/WorkDetails";
import type { Bot, Row } from "../../../packages/contracts/src/types";
import { client } from "../lib/session";
import { useWorkspace, rowKey } from "../lib/store";
import { Avatar, IconButton, Button, ErrorText, Chip, KeyboardScreen, LockBadge, styles as s } from "../components/UI";
import { useBilling, hasComputer } from "../lib/billing";
import { MessageRow } from "../components/MessageRow";
import { Composer, type ComposerHandle } from "../components/Composer";
import { FadeIn, TypingDots, useLoop } from "../components/motion";
import { palette as p, type, space } from "../theme";
import { botStatus, statusLine, usesComputer } from "../lib/format";
import { catalog } from "../lib/catalog";
import { t } from "../lib/i18n";
const empty: Row[] = [];
const suggestions = [
  { icon: "sunny-outline", label: t("Plan my day") },
  { icon: "search-outline", label: t("Research a topic for me") },
  { icon: "mail-outline", label: t("Draft an email") },
  { icon: "desktop-outline", label: t("Open a website on your computer") },
] as const;

export function ChatScreen({
  openTeam,
  openSettings,
  openChats,
  openCall,
  openComputer,
}: {
  openTeam: () => void;
  openSettings: () => void;
  openChats: () => void;
  openCall: () => void;
  openComputer: () => void;
}) {
  const id = useWorkspace((x) => x.selected);
  const bot = useWorkspace((x) => x.bots.find((b) => b.id === x.selected));
  const generation = useWorkspace((x) => (id ? (x.generations[id] ?? bot?.generation ?? 1) : 1));
  const rows = useWorkspace((x) => (id ? (x.rows[rowKey(id, generation)] ?? empty) : empty));
  const timeline = useMemo(() => chatTimeline(rows).reverse(), [rows]);
  const live = useWorkspace((x) => (id ? x.live[id] : undefined));
  const newChat = useWorkspace((x) => x.newChat);
  const [error, setError] = useState<string | null>(null),
    [loadingOlder, setLoadingOlder] = useState(false),
    [exhausted, setExhausted] = useState<Record<string, boolean>>({});
  const list = useRef<FlatList<ChatItem>>(null);
  const composer = useRef<ComposerHandle>(null);
  const stick = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const latest = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(latest, {
      toValue: showLatest ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showLatest]);
  const computerLive = useLoop(1200, usesComputer(live));
  const computerOn = useBilling((x) => hasComputer(x.summary));
  if (!bot)
    return (
      <View style={[s.screen, s.section, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={[type.title, { color: p.text }]}>{t("Choose a bot")}</Text>
        <Button title={t("Open your team")} variant="secondary" compact onPress={openTeam} />
      </View>
    );
  const status = botStatus(bot, live);
  // Marketplace bots suggest their own skills; everyone else gets general starters.
  const template = catalog.find((t) => t.label === bot.label);
  const starters = template ? template.skills.map((sk) => ({ icon: "flash-outline" as const, label: sk.name })) : suggestions;
  const more = () => {
    const actions = [
      { label: t("New conversation"), run: () => void newChat(bot.id).catch((e) => setError(e.message)) },
      { label: t("All conversations"), run: openChats },
      { label: t("Computer"), run: openComputer },
      { label: t("{name} settings", { name: bot.name }), run: openSettings },
    ];
    if (Platform.OS === "ios")
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...actions.map((a) => a.label), "Cancel"], cancelButtonIndex: actions.length, userInterfaceStyle: "dark" },
        (i) => actions[i]?.run(),
      );
    else Alert.alert(bot.name, "", [...actions.map((a) => ({ text: a.label, onPress: a.run })), { text: t("Cancel"), style: "cancel" as const }]);
  };
  return (
    <KeyboardScreen>
      <View style={[s.header, { gap: space.xs, borderBottomWidth: 0.5, borderBottomColor: p.line }]}>
        <IconButton name="chevron-back" label={t("Back to bots")} onPress={openTeam} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("{name} conversations", { name: bot.name })}
          onPress={openChats}
          style={({ pressed }) => [s.row, { flex: 1, gap: 10, opacity: pressed ? 0.7 : 1 }]}
        >
          <Avatar shape={bot.avatarShape} size={34} status={status === "unread" ? null : status} color={bot.avatarColor} />
          <View style={{ flex: 1 }}>
            <Text style={[type.headline, { color: p.text }]} numberOfLines={1}>
              {bot.name}
            </Text>
            <Text
              style={[type.caption, { color: status === "working" ? p.green : status === "attention" ? p.amber : p.muted, fontWeight: "500" }]}
              numberOfLines={1}
            >
              {statusLine(bot, live)}
            </Text>
          </View>
        </Pressable>
        <View>
          <IconButton name="desktop-outline" label={t("{name}'s computer", { name: bot.name })} onPress={openComputer} />
          {!computerOn && <LockBadge />}
          {usesComputer(live) && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 10,
                right: 9,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: p.green,
                opacity: computerLive.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }),
              }}
            />
          )}
        </View>
        {voiceCallsAvailable && <IconButton name="call-outline" label={t("Call {name}", { name: bot.name })} onPress={openCall} />}
        <IconButton name="ellipsis-horizontal" label={t("More")} onPress={more} />
      </View>
      {!!error && (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
          <ErrorText error={error} />
        </View>
      )}
      <FlatList
        ref={list}
        inverted
        data={timeline}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) =>
          "work" in item ? <WorkDetails rows={item.work} bot={bot} /> : <MessageRow row={item.row} bot={bot} />
        }
        contentContainerStyle={{ paddingVertical: space.md, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        initialNumToRender={15}
        maxToRenderPerBatch={8}
        windowSize={7}
        onScroll={(e) => {
          const nearLatest = e.nativeEvent.contentOffset.y < 120;
          stick.current = nearLatest;
          if (nearLatest === showLatest) setShowLatest(!nearLatest);
        }}
        onScrollBeginDrag={() => {
          stick.current = false;
        }}
        scrollEventThrottle={64}
        onContentSizeChange={() => {
          if (stick.current) list.current?.scrollToOffset({ offset: 0, animated: true });
        }}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        ListFooterComponent={
          !exhausted[rowKey(bot.id, generation)] && rows.length >= 200 ? (
            <View style={{ padding: space.md, alignItems: "center" }}>
              <Button
                title={t("Load earlier messages")}
                variant="secondary"
                compact
                busy={loadingOlder}
                onPress={() => {
                  setLoadingOlder(true);
                  void client
                    .request<{ rows: Row[] }>("GET", `/bots/${bot.id}/rows?generation=${generation}&beforeSeq=${rows[0].seq}`)
                    .then((result) => {
                      if (result.rows.length < 200) setExhausted((old) => ({ ...old, [rowKey(bot.id, generation)]: true }));
                      useWorkspace.getState().event({ type: "rows", botId: bot.id, generation, rows: result.rows });
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setLoadingOlder(false));
                }}
              />
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          // Inverted lists flip their empty view; flip it back.
          <View style={{ flex: 1, justifyContent: "center", padding: space.xxl, transform: [{ scaleY: -1 }] }}>
            <FadeIn style={{ alignItems: "center", gap: space.md }}>
              <Avatar shape={bot.avatarShape} size={84} color={bot.avatarColor} />
              <Text style={[type.largeTitle, { color: p.text, textAlign: "center", marginTop: space.sm }]}>{t("How can I help?")}</Text>
              <Text style={[type.callout, { color: p.muted, textAlign: "center", maxWidth: 300 }]}>
                {bot.description || t("{name} can browse, use its own computer, connect your apps and get things done.", { name: bot.name })}
              </Text>
            </FadeIn>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.sm, marginTop: space.xxl }}>
              {starters.map((sug, i) => (
                <FadeIn key={sug.label} delay={180 + i * 70}>
                  <Chip label={sug.label} icon={sug.icon} onPress={() => composer.current?.prefill(sug.label)} />
                </FadeIn>
              ))}
            </View>
          </View>
        }
        ListHeaderComponent={
          live?.isRunning ? (
            <FadeIn offset={6} style={[s.row, { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 10 }]}>
              <ThinkingAvatar bot={bot} />
              <Text style={[type.footnote, { color: p.muted, flexShrink: 1 }]} numberOfLines={1}>
                {statusLine(bot, live)}
              </Text>
              <TypingDots color={p.muted} size={4} />
            </FadeIn>
          ) : undefined
        }
      />
      <Animated.View
        pointerEvents={showLatest ? "auto" : "none"}
        style={{
          position: "absolute",
          alignSelf: "center",
          bottom: 116,
          opacity: latest,
          transform: [{ translateY: latest.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: latest.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Jump to latest")}
          onPress={() => {
            stick.current = true;
            setShowLatest(false);
            list.current?.scrollToOffset({ offset: 0, animated: true });
          }}
          style={{ backgroundColor: p.elevated, borderRadius: 20, borderWidth: 1, borderColor: p.lineStrong, width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="arrow-down" size={18} color={p.text} />
        </Pressable>
      </Animated.View>
      <Composer ref={composer} bot={bot} generation={generation} />
    </KeyboardScreen>
  );
}

/** The bot's own face while it works: it breathes gently, so the chat feels like that bot is thinking. */
function ThinkingAvatar({ bot }: { bot: Bot }) {
  const v = useLoop(1600);
  return (
    <Animated.View
      style={{
        transform: [
          { scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] }) },
          { translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -1.5, 0] }) },
        ],
      }}
    >
      <Avatar shape={bot.avatarShape} size={26} color={bot.avatarColor} />
    </Animated.View>
  );
}
