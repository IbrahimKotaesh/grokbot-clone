import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TextInput, Alert, RefreshControl, Pressable, Linking, Switch, ActionSheetIOS, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import type { Toolkit, LiveState, ComputerState } from "../../../packages/contracts/src/types";
import { client, logout, connectApp } from "../lib/session";
import { useWorkspace } from "../lib/store";
import { Avatar, Button, ErrorText, Header, IconButton, Group, ListRow, SectionLabel, EmptyState, ProviderMark, styles as s } from "../components/UI";
import { FadeIn, TypingDots } from "../components/motion";
import { palette as p, type, space, radius, themeChoice, setThemeChoice, type ThemeChoice } from "../theme";
import { relativeTime } from "../lib/format";
import { useBilling, currentPlan, type Plan } from "../lib/billing";
import { resetPurchases } from "../lib/purchases";
import { TAB_BAR_SPACE } from "../components/FloatingTabBar";
import { t, n, mirror, isArabic } from "../lib/i18n";

export function AppsScreen({ done }: { done?: () => void }) {
  const [apps, setApps] = useState<Toolkit[]>([]),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(
    (signal?: AbortSignal) =>
      client
        .request<{ apps: Toolkit[] }>("GET", `/apps?search=${encodeURIComponent(search)}`, undefined, signal)
        .then((r) => {
          setApps(r.apps ?? []);
          setError(null);
        }),
    [search],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        void load(controller.signal)
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message);
          })
          .finally(() => setLoading(false)),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);
  const connected = apps.filter((a) => a.connected);
  const rest = apps.filter((a) => !a.connected);
  const row = (app: Toolkit) => (
    <ListRow
      key={app.slug}
      leading={
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {app.logo ? (
            <Image source={{ uri: app.logo }} style={{ width: 24, height: 24 }} contentFit="contain" />
          ) : (
            <Text style={{ fontWeight: "700", color: "#000" }}>{app.name[0]}</Text>
          )}
        </View>
      }
      title={app.name}
      subtitle={app.description}
      chevron={false}
      trailing={
        app.connected ? (
          <Ionicons name="checkmark-circle" size={22} color={p.green} />
        ) : (
          <Button
            title={t("Connect")}
            compact
            variant="secondary"
            busy={busy === app.slug}
            style={{ minHeight: 32, paddingHorizontal: 14 }}
            onPress={() => {
              setBusy(app.slug);
              void connectApp(app.slug)
                .then(() => load())
                .catch((e) => setError(e.message))
                .finally(() => setBusy(null));
            }}
          />
        )
      }
    />
  );
  return (
    <View style={s.screen}>
      <Header large={false} title={t("Connected apps")} left={<IconButton name="chevron-back" label={t("Back")} onPress={() => done?.()} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled">
        <View style={[s.row, { gap: space.sm, backgroundColor: p.raised, borderRadius: radius.md, paddingHorizontal: space.md, height: 44, marginTop: space.sm }]}>
          <Ionicons name="search" size={17} color={p.faint} />
          <TextInput
            accessibilityLabel={t("Search apps")}
            placeholder={t("Search Gmail, GitHub, Slack…")}
            placeholderTextColor={p.faint}
            selectionColor={p.text}
            value={search}
            onChangeText={setSearch}
            style={[type.body, { color: p.text, flex: 1 }]}
            autoCorrect={false}
          />
        </View>
        <View style={{ marginTop: space.md }}>
          <ErrorText error={error} />
        </View>
        {loading && (
          <View style={{ paddingVertical: space.xxxl, alignItems: "center" }}>
            <TypingDots color={p.muted} />
          </View>
        )}
        {connected.length > 0 && (
          <FadeIn>
            <SectionLabel>{t("Connected")}</SectionLabel>
            <Group>{connected.map(row)}</Group>
          </FadeIn>
        )}
        {rest.length > 0 && (
          <FadeIn delay={60}>
            <SectionLabel>{search ? t("Results") : t("Available")}</SectionLabel>
            <Group>{rest.map(row)}</Group>
          </FadeIn>
        )}
        {!loading && !apps.length && !error && <EmptyState icon="apps-outline" title={t("No apps found")} detail={t("Try another name.")} />}
      </ScrollView>
    </View>
  );
}

interface NotificationItem {
  id: string;
  botId: string | null;
  generation: number | null;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
}
export function AlertsScreen({ openChat }: { openChat: () => void }) {
  const [waiting, setWaiting] = useState<LiveState[]>([]);
  const bots = useWorkspace((x) => x.bots);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NotificationItem[]>([]),
    [error, setError] = useState<string | null>(null),
    [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    const results = await Promise.allSettled([client.request<{ items: NotificationItem[] }>("GET", "/push/notifications"), client.bots()]);
    if (results[0].status === "fulfilled") setItems(results[0].value.items ?? []);
    else setError(t("Couldn't load important messages. Pull down to try again."));
    if (results[1].status === "fulfilled") setWaiting(results[1].value.live.filter((x) => !!x.awaiting));
    else setError(t("Couldn't refresh requests. Pull down to try again."));
    setLoading(false);
  }, []);
  const open = async (botId: string, generation: number | null, notificationId?: string) => {
    try {
      await useWorkspace.getState().select(botId);
      if (generation) await useWorkspace.getState().selectChat(botId, generation);
      if (notificationId) {
        try {
          await client.request("POST", "/push/notifications/read", { id: notificationId });
          setItems((old) => old.map((item) => (item.id === notificationId ? { ...item, readAt: Date.now() } : item)));
        } catch {
          /* A read receipt must not prevent opening the conversation. */
        }
      }
      openChat();
    } catch {
      setError(t("Couldn't open this conversation. Please try again."));
    }
  };
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const unread = items.filter((i) => !i.readAt).length + waiting.length;
  return (
    <View style={s.screen}>
      <Header title={t("Inbox")} subtitle={unread ? n(unread, "{n} needs you", "{n} need you") : t("Requests and updates from your bots")} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl + TAB_BAR_SPACE, gap: space.sm, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={p.muted}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <ErrorText error={error} />
        {loading && (
          <View style={{ paddingVertical: space.xxxl, alignItems: "center" }}>
            <TypingDots color={p.muted} />
          </View>
        )}
        {waiting.length > 0 && <SectionLabel>{t("Needs you")}</SectionLabel>}
        {waiting.map((item, i) => {
          const bot = bots.find((b) => b.id === item.botId);
          return (
            <FadeIn key={item.botId + ":" + item.generation} delay={i * 50}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void open(item.botId, item.generation ?? null)}
                style={({ pressed }) => [s.card, { borderColor: "#ffc04d40", backgroundColor: pressed ? p.raised : p.surface }]}
              >
                <View style={s.row}>
                  {bot && <Avatar shape={bot.avatarShape} size={38} status="attention" color={bot.avatarColor} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[type.headline, { color: p.text }]}>{bot?.name ?? t("Bot")}</Text>
                    <Text style={[type.caption, { color: p.amber }]}>Waiting for approval · {relativeTime(item.awaiting?.since)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={p.faint} style={mirror("chevron-forward")} />
                </View>
                <Text style={[type.callout, { color: p.text }]}>{item.awaiting?.reason}</Text>
              </Pressable>
            </FadeIn>
          );
        })}
        {items.length > 0 && <SectionLabel>{t("Updates")}</SectionLabel>}
        {items.map((item, i) => {
          const bot = bots.find((b) => b.id === item.botId);
          return (
            <FadeIn key={item.id} delay={(waiting.length + i) * 50}>
              <Pressable
                accessibilityRole="button"
                disabled={!item.botId}
                onPress={() => item.botId && void open(item.botId, item.generation, item.id)}
                style={({ pressed }) => [s.card, { backgroundColor: pressed ? p.raised : p.surface }]}
              >
                <View style={s.row}>
                  {bot ? (
                    <Avatar shape={bot.avatarShape} size={38} status={item.readAt ? null : "unread"} color={bot.avatarColor} />
                  ) : (
                    <View style={[s.rowIcon, { width: 38, height: 38, borderRadius: 19 }]}>
                      <Ionicons name="notifications-outline" size={18} color={p.text} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[type.headline, { color: p.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[type.caption, { color: p.faint, fontWeight: "400" }]}>{relativeTime(item.createdAt)}</Text>
                  </View>
                  {!item.readAt && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.blue }} />}
                </View>
                <Text selectable style={[type.callout, { color: p.muted }]} numberOfLines={4}>
                  {item.body}
                </Text>
              </Pressable>
            </FadeIn>
          );
        })}
        {!loading && !error && !items.length && !waiting.length && (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <FadeIn>
              <EmptyState icon="checkmark-done" title={t("You're all caught up")} detail={t("Approvals and important updates from your bots will land here.")} />
            </FadeIn>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export function AccountScreen({ onLogout, openApps, openPlan, openModels, openClaudeCode }: { onLogout: () => void; openApps: () => void; openPlan: () => void; openModels: () => void; openClaudeCode: () => void }) {
  const user = useWorkspace((x) => x.user);
  const bots = useWorkspace((x) => x.bots);
  const [computer, setComputer] = useState<ComputerState | null>(null);
  const billing = useBilling((x) => x.summary);
  const plan = currentPlan(billing);
  const [models, setModels] = useState<string | null>(null);
  const [autoApprove, setAutoApprove] = useState<boolean | null>(null);
  const changeAutoApprove = (on: boolean) => {
    const apply = () => {
      setAutoApprove(on);
      void client.request<{ autoApprove: boolean }>("PUT", "/account/approvals", { autoApprove: on }).then((r) => setAutoApprove(r.autoApprove)).catch(() => setAutoApprove(!on));
    };
    if (!on) return apply();
    Alert.alert(t("Stop asking for approval?"), t("Your bots will run commands, use your connected apps and act on your computer without asking first. They still stop and ask if something looks suspicious."), [
      { text: t("Cancel"), style: "cancel" },
      { text: t("Don't ask me"), onPress: apply },
    ]);
  };
  useFocusEffect(
    useCallback(() => {
      void client.request<{ autoApprove: boolean }>("GET", "/account/approvals").then((r) => setAutoApprove(r.autoApprove)).catch(() => {});
      void useBilling.getState().load().catch(() => {});
      void client
        .request<{ credentials: { provider: string; connected: boolean }[] }>("GET", "/credentials")
        .then((r) => {
          const on = r.credentials.filter((c) => c.connected).map((c) => ({ chatgpt: t("ChatGPT"), openai: "OpenAI", anthropic: "Claude", xai: "xAI" })[c.provider] ?? c.provider);
          setModels(on.length ? on.join(", ") : t("Not connected"));
        })
        .catch(() => {});
      void client
        .request<{ computer: ComputerState }>("GET", "/computer")
        .then((r) => setComputer(r.computer))
        .catch(() => {});
    }, []),
  );
  const initial = (user?.name || user?.email || "?").trim()[0]?.toUpperCase();
  const computerLabel =
    computer?.status === "running" ? t("Online") : computer?.status === "suspended" ? t("Asleep") : computer?.status === "absent" ? t("Not set up") : computer?.status ? t("Starting") : "…";
  return (
    <View style={s.screen}>
      <Header title={t("Settings")} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl + TAB_BAR_SPACE }}>
        <FadeIn style={[s.card, s.row, { padding: space.lg }]}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: p.text, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: p.onPrimary, fontSize: 22, fontWeight: "700" }}>{initial}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.title, { color: p.text }]} numberOfLines={1}>
              {user?.name || t("Your account")}
            </Text>
            <Text style={[type.subhead, { color: p.muted }]} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </FadeIn>
        <FadeIn delay={30}>
          <PlanCard plan={plan} usage={billing?.usage} onPress={openPlan} />
        </FadeIn>
        <FadeIn delay={60}>
          <SectionLabel>{t("Workspace")}</SectionLabel>
          <Group>
            <ListRow icon="hardware-chip-outline" title={t("AI models")} subtitle={models ?? "…"} onPress={openModels} />
            <ListRow
              leading={
                <View style={[s.rowIcon, { backgroundColor: "#df9c7822" }]}>
                  <ProviderMark provider="claude" size={17} />
                </View>
              }
              title={t("Claude Code")}
              subtitle={plan && !plan.computer ? t("Pro · runs on your computer") : t("Use your Claude subscription on your computer")}
              onPress={openClaudeCode}
            />
            <ListRow icon="sparkles-outline" title={t("Bots")} value={plan?.bots && billing ? `${billing.usage.bots} / ${plan.bots} + Quinn` : String(bots.length)} chevron={false} />
            <ListRow icon="apps-outline" title={t("Connected apps")} subtitle={t("Gmail, GitHub, Slack and more")} onPress={openApps} />
            <ListRow
              icon="flash-outline"
              title={t("Don't ask for approval")}
              subtitle={autoApprove ? t("Bots act on their own") : t("Bots ask before commands and app actions")}
              trailing={<Switch value={!!autoApprove} disabled={autoApprove === null} onValueChange={changeAutoApprove} />}
              chevron={false}
            />
            <ListRow
              icon="desktop-outline"
              title={t("Cloud computer")}
              subtitle={t("Shared machine, a separate screen for each bot")}
              trailing={
                <View style={[s.row, { gap: 6 }]}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: computer?.status === "running" ? p.green : p.faint }} />
                  <Text style={[type.callout, { color: p.muted }]}>{computerLabel}</Text>
                </View>
              }
              chevron={false}
            />
          </Group>
        </FadeIn>
        <FadeIn delay={120}>
          <SectionLabel>{t("About")}</SectionLabel>
          <Group>
            <ListRow icon="cloud-done-outline" title={t("Always working")} subtitle={t("Your bots keep going when you close the app.")} />
            <ListRow
              icon="contrast-outline"
              title={t("Appearance")}
              value={themeChoice === "light" ? t("Light") : themeChoice === "dark" ? t("Dark") : t("System")}
              onPress={() => {
                const choices: ThemeChoice[] = ["system", "light", "dark"];
                const labels = [t("System"), t("Light"), t("Dark")];
                const pick = (i: number) => i >= 0 && i < 3 && setThemeChoice(choices[i]);
                if (Platform.OS === "ios")
                  ActionSheetIOS.showActionSheetWithOptions({ title: t("Appearance"), options: [...labels, t("Cancel")], cancelButtonIndex: 3 }, pick);
                else Alert.alert(t("Appearance"), "", [...labels.map((l, i) => ({ text: l, onPress: () => pick(i) })), { text: t("Cancel"), style: "cancel" as const }]);
              }}
            />
            <ListRow icon="language-outline" title={t("Language")} value={isArabic ? "العربية" : "English"} onPress={() => void Linking.openSettings()} />
            <ListRow icon="information-circle-outline" title={t("Version")} value={Constants.expoConfig?.version ?? "1.0"} />
          </Group>
        </FadeIn>
        <FadeIn delay={180}>
          <View style={{ height: space.xl }} />
          <Group>
            <ListRow
              icon="log-out-outline"
              title={t("Sign out")}
              destructive
              chevron={false}
              onPress={() =>
                Alert.alert(t("Sign out of Fino?"), t("Your bots and conversations stay on the server."), [
                  { text: t("Cancel"), style: "cancel" },
                  {
                    text: t("Sign out"),
                    style: "destructive",
                    onPress: () =>
                      void Promise.all([logout(), resetPurchases()]).finally(() => {
                        useWorkspace.getState().reset();
                        onLogout();
                      }),
                  },
                ])
              }
            />
          </Group>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert(
                t("Delete your account?"),
                t("This permanently deletes your bots, conversations, memories, files and connected keys. It can't be undone. Cancel any subscription in your App Store settings first."),
                [
                  { text: t("Cancel"), style: "cancel" },
                  {
                    text: t("Delete account"),
                    style: "destructive",
                    onPress: () =>
                      void client
                        .request("DELETE", "/account", { confirm: "DELETE" })
                        .then(() => Promise.all([logout().catch(() => {}), resetPurchases()]))
                        .then(() => {
                          useWorkspace.getState().reset();
                          onLogout();
                        })
                        .catch((e) => Alert.alert(t("Couldn't delete your account"), e.message)),
                  },
                ],
              )
            }
            style={{ alignItems: "center", paddingVertical: space.lg, marginTop: space.sm }}
          >
            <Text style={[type.footnote, { color: p.faint }]}>{t("Delete account")}</Text>
          </Pressable>
        </FadeIn>
      </ScrollView>
    </View>
  );
}

function PlanCard({ plan, usage, onPress }: { plan: Plan | null; usage?: { computerMinutes: number }; onPress: () => void }) {
  const top = plan?.id === "max" || plan?.id === "enterprise";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("Your plan")}
      onPress={onPress}
      style={({ pressed }) => [s.card, { marginTop: space.md, gap: space.md, backgroundColor: pressed ? p.raised : p.surface, borderColor: p.lineStrong }]}
    >
      <View style={s.row}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#ffc04d1f", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="sparkles" size={18} color={p.amber} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { color: p.text }]}>{plan ? t("{name} plan", { name: plan.name }) : t("Your plan")}</Text>
          <Text style={[type.footnote, { color: p.muted }]}>
            {!plan
              ? "…"
              : plan.computer
                ? plan.computerHours === null
                  ? t("Unlimited computer use")
                  : t("Computer · {used} of {total} h this month", { used: ((usage?.computerMinutes ?? 0) / 60).toFixed(1), total: plan.computerHours })
                : t("Assistant only · no computer use")}
          </Text>
        </View>
        {top ? (
          <Ionicons name="chevron-forward" size={16} color={p.faint} style={mirror("chevron-forward")} />
        ) : (
          <View style={{ backgroundColor: p.text, borderRadius: radius.full, paddingHorizontal: 12, height: 30, justifyContent: "center" }}>
            <Text style={{ color: p.onPrimary, fontWeight: "700", fontSize: 13 }}>{t("Upgrade")}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
