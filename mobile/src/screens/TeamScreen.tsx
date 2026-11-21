import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
} from "react-native";
import { useWorkspace } from "../lib/store";
import { Avatar, IconButton, ErrorText, styles as s } from "../components/UI";
import { palette as p } from "../theme";
export function TeamScreen({
  openChat,
  openCreate,
}: {
  openChat: () => void;
  openCreate: () => void;
}) {
  const bots = useWorkspace((x) => x.bots),
    refresh = useWorkspace((x) => x.refresh),
    select = useWorkspace((x) => x.select);
  const [search, setSearch] = useState(""),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState<string | null>(null);
  const primary = bots.find((b) => b.isPrimary);
  const team = bots.filter(
    (b) =>
      !b.isPrimary &&
      `${b.name} ${b.label}`.toLowerCase().includes(search.toLowerCase()),
  );
  const choose = async (id: string) => {
    setError(null);
    try {
      await select(id);
      openChat();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <View style={s.screen}>
      <View style={[s.header, { justifyContent: "space-between" }]}>
        <Text style={s.title}>Your team</Text>
        <IconButton name="add" label="Create bot" onPress={openCreate} />
      </View>
      <FlatList
        data={team}
        keyExtractor={(b) => b.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={p.blue}
            onRefresh={() => {
              setRefreshing(true);
              void refresh()
                .catch((e) => setError(e.message))
                .finally(() => setRefreshing(false));
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 20, paddingBottom: 20 }}>
            <ErrorText error={error} />
            {primary && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${primary.name}`}
                onPress={() => void choose(primary.id)}
                style={({ pressed }) => [
                  s.card,
                  s.row,
                  { padding: 20 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Avatar shape={primary.avatarShape} size={78} primary />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[s.title, { fontSize: 23 }]}>
                    {primary.name}
                  </Text>
                  <Text style={s.muted}>
                    {primary.label || "Chief of Staff"}
                  </Text>
                </View>
              </Pressable>
            )}
            <TextInput
              placeholder="Find a teammate"
              accessibilityLabel="Find a teammate"
              placeholderTextColor={p.muted}
              value={search}
              onChangeText={setSearch}
              style={s.input}
            />
            <Text style={s.label}>Teammates</Text>
          </View>
        }
        renderItem={({ item: b }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${b.name}`}
            onPress={() => void choose(b.id)}
            style={({ pressed }) => [
              s.row,
              { padding: 12, borderRadius: 18, minHeight: 90 },
              pressed && { backgroundColor: p.surface },
            ]}
          >
            <Avatar shape={b.avatarShape} size={62} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={[s.text, { fontWeight: "600" }]}>{b.name}</Text>
              <Text style={s.muted} numberOfLines={2}>
                {b.lastPreview || b.label || "Start a conversation"}
              </Text>
            </View>
            {b.unread > 0 && (
              <View
                style={{
                  backgroundColor: p.blue,
                  borderRadius: 12,
                  minWidth: 24,
                  padding: 5,
                }}
              >
                <Text style={{ textAlign: "center", fontWeight: "700" }}>
                  {b.unread}
                </Text>
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={s.muted}>
            {search
              ? "No teammates match your search."
              : "Add a teammate to grow your team."}
          </Text>
        }
      />
    </View>
  );
}
