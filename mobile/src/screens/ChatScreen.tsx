import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from "react-native";
import type { Row } from "../../../packages/contracts/src/types";
import { client } from "../lib/session";
import { useWorkspace, rowKey } from "../lib/store";
import {
  Avatar,
  IconButton,
  Button,
  ErrorText,
  styles as s,
} from "../components/UI";
import { MessageRow } from "../components/MessageRow";
import { Composer } from "../components/Composer";
import { palette as p } from "../theme";
const empty: Row[] = [];
export function ChatScreen({
  openTeam,
  openSettings,
  openChats,
  openModels,
}: {
  openTeam: () => void;
  openSettings: () => void;
  openChats: () => void;
  openModels: () => void;
}) {
  const id = useWorkspace((x) => x.selected);
  const bot = useWorkspace((x) => x.bots.find((b) => b.id === x.selected));
  const generation = useWorkspace((x) =>
    id ? (x.generations[id] ?? bot?.generation ?? 1) : 1,
  );
  const rows = useWorkspace((x) =>
    id ? (x.rows[rowKey(id, generation)] ?? empty) : empty,
  );
  const connected = useWorkspace((x) => x.connected),
    live = useWorkspace((x) => (id ? x.live[id] : undefined));
  const [error, setError] = useState<string | null>(null),
    [loadingOlder, setLoadingOlder] = useState(false),
    [exhausted, setExhausted] = useState<Record<string, boolean>>({});
  const list = useRef<FlatList<Row>>(null),
    stick = useRef(true),
    frame = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    stick.current = true;
    return () => {
      if (frame.current) clearTimeout(frame.current);
    };
  }, [id, generation]);
  if (!bot)
    return (
      <View style={[s.screen, s.section, { justifyContent: "center" }]}>
        <Text style={s.title}>Choose a teammate</Text>
        <Text style={s.muted} onPress={openTeam}>
          Open your team to start a conversation.
        </Text>
      </View>
    );
  const pin = () => {
    if (!stick.current || frame.current) return;
    frame.current = setTimeout(() => {
      frame.current = null;
      list.current?.scrollToEnd({ animated: false });
    }, 50);
  };
  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={s.header}>
        <IconButton
          name="people-outline"
          label="Open team"
          onPress={openTeam}
        />
        <Avatar shape={bot.avatarShape} size={40} primary={bot.isPrimary} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open conversations"
          onPress={openChats}
          style={{ flex: 1, paddingHorizontal: 10, gap: 3 }}
        >
          <Text style={[s.text, { fontWeight: "600" }]} numberOfLines={1}>
            {bot.name}
          </Text>
          <Text style={[s.muted, { fontSize: 11 }]}>
            {connected ? "Connected" : "Reconnecting…"}
          </Text>
        </Pressable>
        <IconButton
          name="ellipsis-horizontal"
          label="Bot settings"
          onPress={openSettings}
        />
      </View>
      <ErrorText error={error} />
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => `${r.generation}:${r.seq}`}
        renderItem={({ item }) => <MessageRow row={item} bot={bot} />}
        contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        initialNumToRender={15}
        maxToRenderPerBatch={8}
        windowSize={7}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            e.nativeEvent;
          stick.current =
            contentSize.height - contentOffset.y - layoutMeasurement.height <
            100;
        }}
        scrollEventThrottle={64}
        onContentSizeChange={pin}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        ListHeaderComponent={
          !exhausted[rowKey(bot.id, generation)] && rows.length >= 200 ? (
            <View style={{ padding: 12 }}>
              <Button
                title="Load earlier messages"
                secondary
                busy={loadingOlder}
                onPress={() => {
                  setLoadingOlder(true);
                  void client
                    .request<{ rows: Row[] }>(
                      "GET",
                      `/bots/${bot.id}/rows?generation=${generation}&beforeSeq=${rows[0].seq}`,
                    )
                    .then((result) => {
                      if (result.rows.length < 200)
                        setExhausted((old) => ({
                          ...old,
                          [rowKey(bot.id, generation)]: true,
                        }));
                      useWorkspace.getState().event({
                        type: "rows",
                        botId: bot.id,
                        generation,
                        rows: result.rows,
                      });
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setLoadingOlder(false));
                }}
              />
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: 30,
              gap: 18,
            }}
          >
            <Avatar shape={bot.avatarShape} size={100} />
            <Text style={[s.title, { fontSize: 24 }]}>{bot.name}</Text>
            <Text style={[s.muted, { textAlign: "center" }]}>
              {bot.description || "What would you like to work on?"}
            </Text>
          </View>
        }
        ListFooterComponent={
          live?.isRunning ? (
            <View style={[s.row, { padding: 18 }]}>
              <ActivityIndicator size="small" color={p.blue} />
              <Text style={s.muted}>{live.activity?.detail ?? "Working…"}</Text>
            </View>
          ) : undefined
        }
      />
      <Composer
        key={`${bot.id}:${generation}`}
        bot={bot}
        generation={generation}
        onModels={openModels}
      />
    </KeyboardAvoidingView>
  );
}
