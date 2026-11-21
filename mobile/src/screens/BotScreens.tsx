import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Switch,
} from "react-native";
import type {
  Bot,
  Memory,
  Routine,
  Task,
  Skill,
  PermissionMode,
} from "../../../packages/contracts/src/types";
import { client } from "../lib/session";
import { useWorkspace } from "../lib/store";
import { Avatar, Button, ErrorText, styles as s } from "../components/UI";
import {
  palette as p,
  fruits,
  fruitColor,
  chatColors,
  type Fruit,
  fruitFor,
} from "../theme";
export function CreateBotScreen({ done }: { done: () => void }) {
  const [name, setName] = useState(""),
    [shape, setShape] = useState<Fruit>("watermelon"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.section}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.title}>A new teammate</Text>
      <Text style={s.muted}>Choose a character and give them a name.</Text>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        {fruits.map((f) => (
          <Pressable
            key={f}
            accessibilityLabel={f}
            accessibilityRole="radio"
            accessibilityState={{ selected: shape === f }}
            onPress={() => setShape(f)}
            style={{
              padding: 6,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: shape === f ? p.blue : "transparent",
            }}
          >
            <Avatar shape={f} size={64} />
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Bot name"
        placeholder="Name"
        placeholderTextColor={p.muted}
        value={name}
        onChangeText={setName}
        maxLength={60}
        style={s.input}
      />
      <ErrorText error={error} />
      <Button
        title="Create teammate"
        disabled={!name.trim()}
        busy={busy}
        onPress={() => {
          setBusy(true);
          void client
            .request<{ bot: Bot }>("POST", "/bots", {
              name,
              avatarShape: shape,
              avatarColor: fruitColor[shape],
              mode: "personal",
            })
            .then(async ({ bot }) => {
              await useWorkspace.getState().refresh();
              await useWorkspace.getState().select(bot.id);
              done();
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      />
    </ScrollView>
  );
}
export function ChatsScreen({ done }: { done: () => void }) {
  const id = useWorkspace((x) => x.selected),
    chats = useWorkspace((x) => (id ? (x.chats[id] ?? []) : [])),
    select = useWorkspace((x) => x.selectChat),
    create = useWorkspace((x) => x.newChat);
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  if (!id) return null;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.section}>
      <Button
        title="New conversation"
        busy={busy}
        onPress={() => {
          setBusy(true);
          void create(id)
            .then(done)
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      />
      <ErrorText error={error} />
      {chats.map((chat) => (
        <Pressable
          key={chat.generation}
          accessibilityRole="button"
          onPress={() =>
            void select(id, chat.generation)
              .then(done)
              .catch((e) => setError(e.message))
          }
          style={s.card}
        >
          <Text style={s.text}>{chat.title}</Text>
          <Text style={s.muted}>
            {chat.messageCount} messages ·{" "}
            {new Date(chat.updatedAt).toLocaleDateString()}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
const permissions: { id: PermissionMode; name: string; detail: string }[] = [
  {
    id: "read_only",
    name: "Read only",
    detail: "Read and research. Writes remain blocked.",
  },
  {
    id: "balanced",
    name: "Balanced",
    detail: "Work independently with approvals for sensitive actions.",
  },
  { id: "ask", name: "Ask first", detail: "Request approval before actions." },
  {
    id: "autonomous",
    name: "Autonomous",
    detail: "Act with the workspace permissions you granted.",
  },
];
export function ModelScreen({ done }: { done: () => void }) {
  const bot = useWorkspace((x) => x.bots.find((b) => b.id === x.selected));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  if (!bot) return null;
  const patch = async (data: Partial<Bot>) => {
    setBusy(true);
    try {
      const { bot: updated } = await client.patchBot(bot.id, data);
      useWorkspace.getState().event({ type: "bot", bot: updated });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.section}>
      <Text style={s.muted}>
        Used by {bot.name}. Each teammate keeps their own choice.
      </Text>
      {(["codex", "claude"] as const).map((provider) => (
        <Button
          key={provider}
          title={`${provider === "codex" ? "ChatGPT" : "Claude"}${bot.agentProvider === provider ? " ✓" : ""}`}
          secondary={bot.agentProvider !== provider}
          busy={busy}
          onPress={() => void patch({ agentProvider: provider, model: "" })}
        />
      ))}
      <Text style={[s.label, { marginTop: 16 }]}>Permissions</Text>
      {permissions.map((mode) => (
        <Pressable
          key={mode.id}
          accessibilityRole="radio"
          accessibilityState={{ selected: bot.permissionMode === mode.id }}
          disabled={busy}
          onPress={() => void patch({ permissionMode: mode.id })}
          style={[
            s.card,
            {
              borderWidth: 1,
              borderColor:
                bot.permissionMode === mode.id ? p.blue : "transparent",
            },
          ]}
        >
          <Text style={s.text}>{mode.name}</Text>
          <Text style={s.muted}>{mode.detail}</Text>
        </Pressable>
      ))}
      <ErrorText error={error} />
    </ScrollView>
  );
}
interface Bundle {
  memories: Memory[];
  routines: Routine[];
  tasks: Task[];
  skills: Skill[];
  memory: { savedMemories: number; conversationMessages: number };
}
export function BotSettingsScreen({ done }: { done: () => void }) {
  const bot = useWorkspace((x) => x.bots.find((b) => b.id === x.selected));
  const [name, setName] = useState(bot?.name ?? ""),
    [instructions, setInstructions] = useState(bot?.instructions ?? ""),
    [shape, setShape] = useState<Bot["avatarShape"]>(
      fruitFor(bot?.avatarShape ?? "watermelon"),
    ),
    [color, setColor] = useState(bot?.avatarColor ?? "blue"),
    [bundle, setBundle] = useState<Bundle | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const botId = bot?.id;
  useEffect(() => {
    if (botId)
      void client
        .request<Bundle>("GET", `/bots/${botId}/settings`)
        .then(setBundle)
        .catch((e) => setError(e.message));
  }, [botId]);
  if (!bot) return null;
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={[s.section, { paddingBottom: 40 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.label}>Character</Text>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        {fruits.map((f) => (
          <Pressable
            key={f}
            accessibilityLabel={f}
            onPress={() => {
              setShape(f);
              setColor(fruitColor[f]);
            }}
            style={{
              borderWidth: 2,
              borderColor: shape === f ? p.blue : "transparent",
              borderRadius: 16,
              padding: 6,
            }}
          >
            <Avatar shape={f} size={62} />
          </Pressable>
        ))}
      </View>
      <Text style={s.label}>Conversation color</Text>
      <View style={[s.row, { flexWrap: "wrap" }]}>
        {Object.entries(chatColors).map(([name, hex]) => (
          <Pressable
            key={name}
            accessibilityLabel={`${name} chat color`}
            onPress={() => setColor(name as Bot["avatarColor"])}
            style={{
              width: 38,
              height: 38,
              backgroundColor: hex,
              borderRadius: 19,
              borderWidth: color === name ? 3 : 0,
              borderColor: p.text,
            }}
          />
        ))}
      </View>
      <TextInput
        accessibilityLabel="Bot name"
        value={name}
        onChangeText={setName}
        style={s.input}
      />
      <Text style={s.label}>Instructions</Text>
      <TextInput
        accessibilityLabel="Instructions"
        value={instructions}
        onChangeText={setInstructions}
        style={[s.input, { minHeight: 140, textAlignVertical: "top" }]}
        multiline
      />
      <ErrorText error={error} />
      <Button
        title="Save changes"
        busy={busy}
        disabled={!name.trim()}
        onPress={() => {
          setBusy(true);
          void client
            .patchBot(bot.id, {
              name,
              instructions,
              avatarShape: shape,
              avatarColor: color,
            })
            .then(({ bot }) => {
              useWorkspace.getState().event({ type: "bot", bot });
              done();
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      />
      {bundle && (
        <>
          <Text style={[s.title, { fontSize: 21, marginTop: 16 }]}>
            Memory · {bundle.memories.length}
          </Text>
          {bundle.memories.length === 0 && (
            <Text style={s.muted}>
              Memories learned by this teammate will appear here.
            </Text>
          )}
          {bundle.memories.map((m) => (
            <View key={m.id} style={s.card}>
              <Text selectable style={s.text}>
                {m.text}
              </Text>
            </View>
          ))}
          <Text style={[s.title, { fontSize: 21, marginTop: 16 }]}>
            Routines
          </Text>
          {bundle.routines.map((r) => (
            <View key={r.id} style={s.card}>
              <View style={s.row}>
                <Text style={[s.text, { flex: 1 }]}>{r.name}</Text>
                <Switch
                  accessibilityLabel={`Enable ${r.name}`}
                  value={r.enabled}
                  onValueChange={(enabled) =>
                    void client
                      .request<{ routine: Routine }>(
                        "PATCH",
                        `/routines/${r.id}`,
                        { enabled },
                      )
                      .then(({ routine }) =>
                        setBundle({
                          ...bundle,
                          routines: bundle.routines.map((x) =>
                            x.id === r.id ? routine : x,
                          ),
                        }),
                      )
                      .catch((e) => setError(e.message))
                  }
                />
              </View>
              <Text style={s.muted}>{r.description || r.schedule}</Text>
            </View>
          ))}
          <Text style={[s.title, { fontSize: 21 }]}>Tasks</Text>
          {bundle.tasks.map((t) => (
            <View key={t.id} style={s.card}>
              <Text style={s.text}>{t.title}</Text>
              <Text style={s.muted}>
                {t.state} · {t.note}
              </Text>
            </View>
          ))}
          <Text style={[s.title, { fontSize: 21 }]}>Skills</Text>
          {bundle.skills.map((skill) => (
            <View key={skill.id} style={s.card}>
              <Text style={s.text}>{skill.name}</Text>
              <Text style={s.muted}>{skill.description}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
