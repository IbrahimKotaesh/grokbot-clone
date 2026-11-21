import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { Toolkit } from "../../../packages/contracts/src/types";
import { client, logout, connectApp } from "../lib/session";
import { useWorkspace } from "../lib/store";
import { Button, ErrorText, styles as s } from "../components/UI";
import { palette as p } from "../theme";
export function AppsScreen() {
  const [apps, setApps] = useState<Toolkit[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        void client
          .request<{ apps: Toolkit[] }>(
            "GET",
            `/apps?search=${encodeURIComponent(search)}`,
            undefined,
            controller.signal,
          )
          .then((r) => setApps(r.apps))
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message);
          }),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.section}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.title}>Connected apps</Text>
      <TextInput
        accessibilityLabel="Search apps"
        placeholder="Gmail, GitHub, Slack…"
        placeholderTextColor={p.muted}
        value={search}
        onChangeText={setSearch}
        style={s.input}
      />
      <ErrorText error={error} />
      {apps.map((app) => (
        <View key={app.slug} style={s.card}>
          <Text style={s.text}>{app.name}</Text>
          <Text style={s.muted}>{app.description}</Text>
          <Button
            title={app.connected ? "Connected" : "Connect"}
            secondary={app.connected}
            busy={busy === app.slug}
            disabled={app.connected}
            onPress={() => {
              setBusy(app.slug);
              void connectApp(app.slug)
                .then(async () => {
                  const response = await client.request<{ apps: Toolkit[] }>(
                    "GET",
                    `/apps?search=${encodeURIComponent(search)}`,
                  );
                  setApps(response.apps);
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(null));
            }}
          />
        </View>
      ))}
    </ScrollView>
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
  const [items, setItems] = useState<NotificationItem[]>([]),
    [error, setError] = useState<string | null>(null),
    [refreshing, setRefreshing] = useState(false);
  const load = useCallback(
    () =>
      client
        .request<{ items: NotificationItem[] }>("GET", "/push/notifications")
        .then((r) => setItems(r.items))
        .catch((e) => setError(e.message)),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.section}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={p.blue}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Text style={s.title}>Updates</Text>
      <Text style={s.muted}>Updates your bots have been asked to send.</Text>
      <ErrorText error={error} />
      {items.map((item) => (
        <View key={item.id} style={s.card}>
          <Text style={[s.text, { color: p.blue, fontWeight: "600" }]}>
            {item.title}
          </Text>
          <Text selectable style={s.text}>
            {item.body}
          </Text>
          <Text style={s.muted}>
            {new Date(item.createdAt).toLocaleString()}
          </Text>
          {item.botId && (
            <Button
              title="Open conversation"
              secondary
              onPress={() => {
                void client.request("POST", "/push/notifications/read", {
                  id: item.id,
                });
                void useWorkspace
                  .getState()
                  .select(item.botId!)
                  .then(async () => {
                    if (item.generation)
                      await useWorkspace
                        .getState()
                        .selectChat(item.botId!, item.generation);
                    openChat();
                  })
                  .catch((e) => setError(e.message));
              }}
            />
          )}
        </View>
      ))}
      {!items.length && <Text style={s.muted}>No updates yet.</Text>}
    </ScrollView>
  );
}
export function AccountScreen({ onLogout }: { onLogout: () => void }) {
  const user = useWorkspace((x) => x.user);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.section}>
      <Text style={s.title}>Settings</Text>
      <View style={s.card}>
        <Text style={s.text}>{user?.name}</Text>
        <Text style={s.muted}>{user?.email}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.label}>Workspace</Text>
        <Text style={s.text}>Cloud server</Text>
        <Text style={s.muted}>
          Your team keeps working on the server when you close the app.
        </Text>
      </View>
      <View style={s.card}>
        <Text style={s.label}>Fino mobile</Text>
        <Text style={s.text}>Native interface for iPhone and Android</Text>
      </View>
      <Button
        title="Sign out"
        secondary
        onPress={() =>
          Alert.alert(
            "Sign out of Fino?",
            "Your bots and conversations stay on the server.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Sign out",
                onPress: () =>
                  void logout().finally(() => {
                    useWorkspace.getState().reset();
                    onLogout();
                  }),
              },
            ],
          )
        }
      />
    </ScrollView>
  );
}
