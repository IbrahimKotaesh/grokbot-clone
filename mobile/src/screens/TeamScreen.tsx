import React, { useState } from "react";
import { voiceCallsAvailable } from "../lib/voice-call";
import { View, Text, FlatList, RefreshControl, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import type { Bot } from "../../../packages/contracts/src/types";
import { useWorkspace } from "../lib/store";
import { Avatar, IconButton, ErrorText, Header, Button, EmptyState, SectionLabel, LockBadge, styles as s } from "../components/UI";
import { useBilling, hasComputer } from "../lib/billing";
import { FadeIn, PressableScale } from "../components/motion";
import { palette as p, type, space, radius } from "../theme";
import { botStatus, plainPreview, relativeTime, statusLine } from "../lib/format";
import { TAB_BAR_SPACE } from "../components/FloatingTabBar";
import { t, n } from "../lib/i18n";

export function TeamScreen({
  openChat,
  openCreate,
  openMarketplace,
  openCall,
  openComputer,
}: {
  openChat: () => void;
  openCreate: () => void;
  openMarketplace: () => void;
  openCall: () => void;
  openComputer: () => void;
}) {
  const bots = useWorkspace((x) => x.bots),
    live = useWorkspace((x) => x.live),
    refresh = useWorkspace((x) => x.refresh),
    select = useWorkspace((x) => x.select);
  const [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState<string | null>(null);
  const primary = bots.find((b) => b.isPrimary);
  const team = bots.filter((b) => !b.isPrimary);
  const working = bots.filter((b) => live[b.id]?.isRunning).length;
  const go = async (id: string, then: () => void) => {
    setError(null);
    try {
      await select(id);
      then();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <View style={s.screen}>
      <Header
        title={t("Bots")}
        subtitle={
          bots.length
            ? `${n(bots.length, "{n} bot", "{n} bots")}${working ? ` · ${t("{n} working", { n: working })}` : ""}`
            : undefined
        }
        right={
          <>
            <IconButton name="add" label={t("Create your own bot")} variant="filled" onPress={openCreate} />
          </>
        }
      />
      <FlatList
        data={team}
        keyExtractor={(b) => b.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl + TAB_BAR_SPACE }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={p.muted}
            onRefresh={() => {
              setRefreshing(true);
              void refresh()
                .catch((e) => setError(e.message))
                .finally(() => setRefreshing(false));
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: space.sm }}>
            <ErrorText error={error} />
            {primary && (
              <FadeIn>
                <PrimaryCard
                  bot={primary}
                  onChat={() => void go(primary.id, openChat)}
                  onCall={() => void go(primary.id, openCall)}
                  onComputer={() => void go(primary.id, openComputer)}
                />
              </FadeIn>
            )}
            {team.length > 0 && <SectionLabel>{t("Team")}</SectionLabel>}
          </View>
        }
        renderItem={({ item: b, index }) => (
          <FadeIn delay={60 + index * 45}>
            <BotRow bot={b} onPress={() => void go(b.id, openChat)} onCall={() => void go(b.id, openCall)} />
          </FadeIn>
        )}
        ListEmptyComponent={
          <FadeIn delay={120}>
            <EmptyState
              icon="people-outline"
              title={t("Build your team")}
              detail={t("Hire ready-made bots for email, accounting, HR and more, each with its own skills and computer.")}
              action={
                <View style={{ gap: space.sm, alignItems: "center" }}>
                  <Button title={t("Browse the Marketplace")} icon="storefront" compact onPress={openMarketplace} />
                  <Button title={t("Create your own")} variant="ghost" compact onPress={openCreate} />
                </View>
              }
            />
          </FadeIn>
        }
      />
    </View>
  );
}

function PrimaryCard({
  bot,
  onChat,
  onCall,
  onComputer,
}: {
  bot: Bot;
  onChat: () => void;
  onCall: () => void;
  onComputer: () => void;
}) {
  const live = useWorkspace((x) => x.live[bot.id]);
  const computerOn = useBilling((x) => hasComputer(x.summary));
  const status = botStatus(bot, live);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t("Open {name}", { name: bot.name })}
      onPress={onChat}
      scaleTo={0.985}
      style={{
        backgroundColor: p.surface,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: p.line,
        padding: space.lg,
        gap: space.lg,
      }}
    >
      <View style={s.row}>
        <Avatar shape={bot.avatarShape} size={58} primary status={status} color={bot.avatarColor} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[type.title, { color: p.text }]} numberOfLines={1}>
            {bot.name}
            {!!bot.label && statusLine(bot, live) !== t(bot.label) && <Text style={[type.subhead, { color: p.faint, fontWeight: "500" }]}>{`  ·  ${t(bot.label)}`}</Text>}
          </Text>
          <Text style={[type.subhead, { color: status === "working" ? p.green : status === "attention" ? p.amber : p.muted }]} numberOfLines={1}>
            {statusLine(bot, live)}
          </Text>
        </View>
      </View>
      {!!bot.lastPreview && (
        <Text style={[type.callout, { color: p.muted }]} numberOfLines={2}>
          {plainPreview(bot.lastPreview)}
        </Text>
      )}
      <View style={[s.row, { gap: space.sm }]}>
        <Button title={t("Message")} icon="chatbubble-ellipses" compact onPress={onChat} style={{ flex: 1 }} />
        {voiceCallsAvailable && <IconButton name="call" label={t("Call {name}", { name: bot.name })} variant="filled" onPress={onCall} />}
        <View>
          <IconButton name="desktop-outline" label={t("{name}'s computer", { name: bot.name })} variant="filled" onPress={onComputer} />
          {!computerOn && <LockBadge />}
        </View>
      </View>
    </PressableScale>
  );
}

function BotRow({ bot, onPress, onCall }: { bot: Bot; onPress: () => void; onCall: () => void }) {
  const live = useWorkspace((x) => x.live[bot.id]);
  const status = botStatus(bot, live);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("Open {name}", { name: bot.name })}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        s.row,
        { paddingHorizontal: space.sm, paddingVertical: space.md, borderRadius: radius.lg, marginHorizontal: -space.sm },
        pressed && { backgroundColor: p.surface },
      ]}
    >
      <Avatar shape={bot.avatarShape} size={50} status={status} color={bot.avatarColor} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={s.rowBetween}>
          <Text style={[type.headline, { color: p.text, flex: 1 }]} numberOfLines={1}>
            {bot.name}
            {!!bot.label && <Text style={[type.subhead, { color: p.faint, fontWeight: "400" }]}>{`  ·  ${t(bot.label)}`}</Text>}
          </Text>
          <Text style={[type.caption, { color: bot.unread ? p.text : p.faint }]}>{relativeTime(bot.lastActivityAt)}</Text>
        </View>
        <View style={[s.row, { gap: space.sm }]}>
          <Text
            style={[type.subhead, { color: status === "working" ? p.green : p.muted, flex: 1 }]}
            numberOfLines={1}
          >
            {live?.isRunning || live?.awaiting ? statusLine(bot, live) : plainPreview(bot.lastPreview) || t("Start a conversation")}
          </Text>
          {bot.unread > 0 && (
            <View style={{ backgroundColor: p.text, borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: p.onPrimary, fontSize: 12, fontWeight: "700" }}>{bot.unread}</Text>
            </View>
          )}
        </View>
      </View>
      {voiceCallsAvailable && <IconButton name="call-outline" label={t("Call {name}", { name: bot.name })} color={p.muted} size={40} onPress={onCall} />}
    </Pressable>
  );
}
