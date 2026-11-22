import React, { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, Pressable, Switch, Animated, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { Bot, Memory, Routine, Task, Skill, PermissionMode } from "../../../packages/contracts/src/types";
import { client } from "../lib/session";
import { useWorkspace } from "../lib/store";
import { Avatar, Button, ErrorText, Header, IconButton, Group, ListRow, SectionLabel, TextField, Chip, EmptyState, ProviderMark, KeyboardScreen, styles as s } from "../components/UI";
import { FadeIn } from "../components/motion";
import { palette as p, fruits, fruitColor, chatColors, type Fruit, fruitFor, type, space, radius, motion } from "../theme";
import { relativeTime } from "../lib/format";
import { handlePlanLimit, useBilling, hasComputer, openUpgrade } from "../lib/billing";

const roles = [
  { label: "Researcher", icon: "search-outline", text: "Research topics in depth, compare sources and give me a short, well-sourced summary." },
  { label: "Writer", icon: "create-outline", text: "Draft and polish emails, posts and documents in my voice. Keep it clear and concise." },
  { label: "Developer", icon: "code-slash-outline", text: "Help me build and debug software. Explain trade-offs and keep changes small." },
  { label: "Assistant", icon: "calendar-outline", text: "Handle my everyday tasks: schedule, reminders, inbox triage and quick errands." },
] as const;

/** Spring "pop" whenever `trigger` changes. */
function usePop(trigger: unknown) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    v.setValue(0.82);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, ...motion.spring, damping: 11 }).start();
  }, [trigger]);
  return v;
}

function CharacterPicker({ value, onChange, size = 58 }: { value: Fruit; onChange: (f: Fruit) => void; size?: number }) {
  return (
    <View style={[s.row, { justifyContent: "space-between" }]}>
      {fruits.map((f) => {
        const on = value === f;
        return (
          <Pressable
            key={f}
            accessibilityLabel={f}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(f);
            }}
            style={{ padding: 4, borderRadius: size, borderWidth: 2, borderColor: on ? p.text : "transparent" }}
          >
            <Avatar shape={f} size={size} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function CreateBotScreen({ done }: { done: () => void }) {
  const [name, setName] = useState(""),
    [shape, setShape] = useState<Fruit>("orange"),
    [role, setRole] = useState<string | null>(null),
    [instructions, setInstructions] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const pop = usePop(shape);
  const create = () => {
    setBusy(true);
    void client
      .request<{ bot: Bot }>("POST", "/bots", {
        name,
        label: role ?? "",
        instructions,
        avatarShape: shape,
        avatarColor: fruitColor[shape],
        mode: "personal",
      })
      .then(async ({ bot }) => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await useWorkspace.getState().refresh();
        await useWorkspace.getState().select(bot.id);
        done();
      })
      .catch((e) => {
        if (e?.code !== "plan_limit") return setError(e.message);
        done();
        setTimeout(() => handlePlanLimit(e), 400); // open the upgrade screen once this modal has closed
      })
      .finally(() => setBusy(false));
  };
  return (
    <KeyboardScreen>
      <Header large={false} title="New bot" left={<IconButton name="close" label="Cancel" onPress={done} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <FadeIn style={{ alignItems: "center", gap: space.md, paddingTop: space.lg }}>
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <Avatar shape={shape} size={104} />
          </Animated.View>
          <Text style={[type.title, { color: name.trim() ? p.text : p.faint }]} numberOfLines={1}>
            {name.trim() || "Your new bot"}
          </Text>
          {!!role && <Text style={[type.subhead, { color: p.muted, marginTop: -8 }]}>{role}</Text>}
        </FadeIn>
        <FadeIn delay={60}>
          <CharacterPicker value={shape} onChange={setShape} />
        </FadeIn>
        <FadeIn delay={120} style={{ gap: space.lg }}>
          <TextField label="Name" placeholder="e.g. Nova" value={name} onChangeText={setName} maxLength={60} autoFocus returnKeyType="next" />
          <View style={{ gap: space.sm }}>
            <Text style={[s.label, { paddingHorizontal: space.xs }]}>Role</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {roles.map((r) => (
                <Chip
                  key={r.label}
                  label={r.label}
                  icon={r.icon}
                  selected={role === r.label}
                  onPress={() => {
                    if (role === r.label) {
                      setRole(null);
                      if (instructions === r.text) setInstructions("");
                    } else {
                      setRole(r.label);
                      if (!instructions || roles.some((x) => x.text === instructions)) setInstructions(r.text);
                    }
                  }}
                />
              ))}
            </View>
          </View>
          <TextField
            label="Instructions"
            placeholder="What should it focus on? You can change this anytime."
            value={instructions}
            onChangeText={setInstructions}
            multiline
            style={{ minHeight: 110, textAlignVertical: "top" }}
          />
        </FadeIn>
        <ErrorText error={error} />
      </ScrollView>
      <View style={{ paddingHorizontal: space.xl, paddingVertical: space.md, borderTopWidth: 0.5, borderTopColor: p.line }}>
        <Button title="Create bot" disabled={!name.trim()} busy={busy} onPress={create} />
      </View>
    </KeyboardScreen>
  );
}

export function ChatsScreen({ done }: { done: () => void }) {
  const id = useWorkspace((x) => x.selected),
    bot = useWorkspace((x) => x.bots.find((b) => b.id === x.selected)),
    current = useWorkspace((x) => (x.selected ? x.generations[x.selected] : undefined)),
    chats = useWorkspace((x) => (id ? (x.chats[id] ?? []) : [])),
    select = useWorkspace((x) => x.selectChat),
    create = useWorkspace((x) => x.newChat);
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  if (!id) return null;
  return (
    <ScrollView style={s.screen} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md }}>
        <Header large={false} title="Conversations" right={<IconButton name="close" label="Close" variant="filled" size={34} iconSize={16} onPress={done} />} />
        <Button
          title="New conversation"
          icon="add"
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
        {chats.length > 0 && (
          <Group>
            {chats.map((chat) => {
              const on = chat.generation === (current ?? bot?.generation);
              return (
                <ListRow
                  key={chat.generation}
                  icon={on ? "chatbubble" : "chatbubble-outline"}
                  title={chat.title}
                  subtitle={`${chat.messageCount} ${chat.messageCount === 1 ? "message" : "messages"} · ${relativeTime(chat.updatedAt)}`}
                  trailing={on ? <Ionicons name="checkmark" size={18} color={p.text} /> : undefined}
                  chevron={false}
                  onPress={() =>
                    void select(id, chat.generation)
                      .then(done)
                      .catch((e) => setError(e.message))
                  }
                />
              );
            })}
          </Group>
        )}
      </ScrollView>
  );
}

const permissions: { id: PermissionMode; name: string; detail: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { id: "read_only", name: "Read only", detail: "Read and research. Writes stay blocked.", icon: "eye-outline" },
  { id: "balanced", name: "Balanced", detail: "Works on its own, asks before sensitive actions.", icon: "shield-half-outline" },
  { id: "ask", name: "Ask first", detail: "Asks before every action.", icon: "hand-left-outline" },
  { id: "autonomous", name: "Autonomous", detail: "Acts with all the access you granted.", icon: "flash-outline" },
];
type ProviderId = "codex" | "claude-code" | "claude" | "openrouter" | "groq" | "xai";
const providerOptions: { id: ProviderId; name: string; detail: string; needs: string[]; mark?: string; icon?: React.ComponentProps<typeof Ionicons>["name"]; color?: string; models?: string[] }[] = [
  { id: "codex", name: "ChatGPT", detail: "Your ChatGPT subscription or OpenAI key", needs: ["chatgpt", "openai"], mark: "codex" },
  { id: "claude-code", name: "Claude Code", detail: "Your Claude subscription · pure Claude Code, on your computer", needs: ["@computer"], mark: "claude" },
  { id: "claude", name: "Claude (API key)", detail: "Your Anthropic API key", needs: ["anthropic"], mark: "claude" },
  { id: "openrouter", name: "OpenRouter", detail: "Gemini, DeepSeek, Llama… some free", needs: ["openrouter"], icon: "git-network-outline", color: "#a78bfa", models: ["openrouter/auto", "google/gemini-2.5-flash", "deepseek/deepseek-chat"] },
  { id: "groq", name: "Groq", detail: "Very fast, free tier", needs: ["groq"], icon: "flash-outline", color: "#ff9f43", models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
  { id: "xai", name: "Grok", detail: "Fast Grok models from xAI", needs: ["xai"], icon: "planet-outline", color: p.text },
];
export function ModelScreen({ done, openModels, openClaudeCode }: { done: () => void; openModels?: () => void; openClaudeCode?: () => void }) {
  const computerOn = useBilling((x) => hasComputer(x.summary));
  const bot = useWorkspace((x) => x.bots.find((b) => b.id === x.selected));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [connected, setConnected] = useState<string[] | null>(null),
    [shared, setShared] = useState(false),
    [model, setModel] = useState(bot?.model ?? "");
  useEffect(() => {
    void client
      .request<{ credentials: { provider: string; connected: boolean }[]; sharedLogin: boolean }>("GET", "/credentials")
      .then((r) => {
        setConnected(r.credentials.filter((c) => c.connected).map((c) => c.provider));
        setShared(r.sharedLogin);
      })
      .catch(() => setConnected([]));
  }, []);
  if (!bot) return null;
  const patch = async (data: Partial<Bot>) => {
    setBusy(true);
    setError(null);
    try {
      const { bot: updated } = await client.patchBot(bot.id, data);
      useWorkspace.getState().event({ type: "bot", bot: updated });
      void Haptics.selectionAsync();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const provider = (bot.agentProvider ?? "codex") as ProviderId;
  const current = providerOptions.find((o) => o.id === provider);
  // codex/claude can fall back to the server's own login in development.
  const ready = (o: (typeof providerOptions)[number]) =>
    o.id === "claude-code" ? computerOn : !!connected && (o.needs.some((n) => connected.includes(n)) || (shared && (o.id === "codex" || o.id === "claude")));
  return (
    <ScrollView style={s.screen} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <Header large={false} title="Model & permissions" right={<IconButton name="close" label="Close" variant="filled" size={34} iconSize={16} onPress={done} />} />
        <ErrorText error={error} />
        <SectionLabel>Brain</SectionLabel>
        <Group>
          {providerOptions.map((o) => {
            const on = provider === o.id;
            const ok = ready(o);
            return (
              <ListRow
                key={o.id}
                leading={
                  <View style={[s.rowIcon, { width: 34, height: 34, borderRadius: 10 }]}>
                    {o.mark ? <ProviderMark provider={o.mark} size={20} /> : <Ionicons name={o.icon!} size={18} color={o.color} />}
                  </View>
                }
                title={o.name}
                subtitle={o.id === "claude-code" && !ok ? "Pro · runs on your computer" : connected === null ? o.detail : ok ? o.detail : "Not connected · tap to add a key"}
                chevron={false}
                trailing={<Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={22} color={on ? p.text : p.faint} />}
                onPress={
                  busy
                    ? undefined
                    : () => {
                        if (o.id === "claude-code" && !ok) return openUpgrade("computer");
                        if (connected && !ok) return openModels?.();
                        setModel("");
                        void patch({ agentProvider: o.id as Bot["agentProvider"], model: "" });
                      }
                }
              />
            );
          })}
        </Group>
        {provider === "claude-code" && (
          <View style={[s.card, { gap: space.md, marginTop: space.md }]}>
            <Text style={[type.callout, { color: p.text }]}>This bot is Claude Code as it is: no extra instructions, tools or approvals. It runs on your computer with your Claude subscription.</Text>
            <Text style={[type.footnote, { color: p.muted }]}>Sign in once: open Claude Code, type /login and follow Anthropic&apos;s sign-in.</Text>
            <Button title="Open Claude Code" icon="terminal-outline" compact variant="secondary" onPress={() => openClaudeCode?.()} />
          </View>
        )}
        {current?.models && (
          <View style={{ gap: space.sm, marginTop: space.md }}>
            <Text style={[s.label, { paddingHorizontal: space.xs }]}>Model</Text>
            <View style={[s.row, { gap: space.sm }]}>
              <TextInput
                accessibilityLabel="Model id"
                placeholder={`Default · ${current.models[0]}`}
                placeholderTextColor={p.faint}
                selectionColor={p.text}
                value={model}
                onChangeText={setModel}
                autoCapitalize="none"
                autoCorrect={false}
                style={[s.input, { flex: 1, fontFamily: "Menlo", fontSize: 14 }]}
              />
              <Button title="Save" compact variant="secondary" disabled={busy || model === (bot.model ?? "")} onPress={() => void patch({ model: model.trim() })} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {current.models.map((m) => (
                <Chip
                  key={m}
                  label={m}
                  selected={(bot.model || current.models![0]) === m}
                  onPress={() => {
                    setModel(m);
                    void patch({ model: m });
                  }}
                />
              ))}
            </View>
          </View>
        )}
        {provider !== "claude-code" && (
          <>
        <SectionLabel>Permissions</SectionLabel>
        <Group>
          {permissions.map((mode) => (
            <ListRow
              key={mode.id}
              icon={mode.icon}
              title={mode.name}
              subtitle={mode.detail}
              chevron={false}
              trailing={<Ionicons name={bot.permissionMode === mode.id ? "checkmark-circle" : "ellipse-outline"} size={22} color={bot.permissionMode === mode.id ? p.text : p.faint} />}
              onPress={busy ? undefined : () => void patch({ permissionMode: mode.id })}
            />
          ))}
        </Group>
          </>
        )}
        <Text style={[type.footnote, { color: p.faint, paddingHorizontal: space.xs, marginTop: space.md }]}>Each bot keeps its own choice. Changes apply from the next message.</Text>
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
export function BotSettingsScreen({ done, openModel }: { done: () => void; openModel: () => void }) {
  const bot = useWorkspace((x) => x.bots.find((b) => b.id === x.selected));
  const [name, setName] = useState(bot?.name ?? ""),
    [instructions, setInstructions] = useState(bot?.instructions ?? ""),
    [shape, setShape] = useState<Fruit>(fruitFor(bot?.avatarShape ?? "watermelon")),
    [color, setColor] = useState(bot?.avatarColor ?? "blue"),
    [bundle, setBundle] = useState<Bundle | null>(null),
    [section, setSection] = useState<"memory" | "routines" | "tasks" | "skills" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const pop = usePop(shape);
  const botId = bot?.id;
  useEffect(() => {
    if (botId)
      void client
        .request<Bundle>("GET", `/bots/${botId}/settings`)
        .then(setBundle)
        .catch((e) => setError(e.message));
  }, [botId]);
  if (!bot) return null;
  const dirty = name !== bot.name || instructions !== (bot.instructions ?? "") || shape !== fruitFor(bot.avatarShape) || color !== bot.avatarColor;
  const save = () => {
    setBusy(true);
    void client
      .patchBot(bot.id, { name, instructions, avatarShape: shape, avatarColor: color })
      .then(({ bot }) => {
        useWorkspace.getState().event({ type: "bot", bot });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        done();
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  };
  const toggle = (key: typeof section) => setSection(section === key ? null : key);
  return (
    <KeyboardScreen>
      <Header
        large={false}
        title="Bot settings"
        left={<IconButton name="close" label="Close" onPress={done} />}
        right={
          <Pressable accessibilityRole="button" disabled={!dirty || !name.trim() || busy} onPress={save} hitSlop={10} style={{ paddingHorizontal: space.md }}>
            <Text style={[type.headline, { color: dirty && name.trim() ? p.text : p.faint }]}>{busy ? "Saving…" : "Save"}</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <FadeIn style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }}>
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <Avatar shape={shape} size={92} primary={bot.isPrimary} />
          </Animated.View>
          <Text style={[type.title, { color: p.text }]}>{name || bot.name}</Text>
          {!!bot.label && <Text style={[type.subhead, { color: p.muted }]}>{bot.label}</Text>}
        </FadeIn>
        <ErrorText error={error} />

        <SectionLabel>Profile</SectionLabel>
        <View style={[s.card, { gap: space.lg }]}>
          <TextField label="Name" value={name} onChangeText={setName} maxLength={60} />
          <View style={{ gap: space.sm }}>
            <Text style={[s.label, { paddingHorizontal: space.xs }]}>Character</Text>
            <CharacterPicker
              value={shape}
              size={52}
              onChange={(f) => {
                setShape(f);
                setColor(fruitColor[f]);
              }}
            />
          </View>
          <View style={{ gap: space.sm }}>
            <Text style={[s.label, { paddingHorizontal: space.xs }]}>Accent</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2, paddingHorizontal: 2 }}>
              {Object.entries(chatColors).map(([key, hex]) => (
                <Pressable
                  key={key}
                  accessibilityLabel={`${key} accent`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: color === key }}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setColor(key as Bot["avatarColor"]);
                  }}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: hex, borderWidth: 3, borderColor: color === key ? p.text : p.surface, alignItems: "center", justifyContent: "center" }}
                >
                  {color === key && <Ionicons name="checkmark" size={15} color="#000" />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>

        <SectionLabel>Instructions</SectionLabel>
        <TextField
          placeholder={`How should ${bot.name} work? Tone, focus, things to avoid…`}
          value={instructions}
          onChangeText={setInstructions}
          multiline
          style={{ minHeight: 130, textAlignVertical: "top", backgroundColor: p.surface, borderColor: p.line }}
        />

        <SectionLabel>Brain</SectionLabel>
        <Group>
          <ListRow
            icon="hardware-chip-outline"
            title="Model & permissions"
            value={providerOptions.find((o) => o.id === (bot.agentProvider ?? "codex"))?.name ?? "ChatGPT"}
            onPress={openModel}
          />
          <ListRow icon="mic-outline" title="Voice" value={bot.voice ? bot.voice[0].toUpperCase() + bot.voice.slice(1) : "Default"} chevron={false} />
        </Group>

        <SectionLabel>Knowledge</SectionLabel>
        <Group>
          <ListRow icon="bulb-outline" title="Memory" value={bundle ? String(bundle.memories.length) : "…"} onPress={() => toggle("memory")} />
          <ListRow icon="repeat-outline" title="Routines" value={bundle ? String(bundle.routines.length) : "…"} onPress={() => toggle("routines")} />
          <ListRow icon="checkbox-outline" title="Tasks" value={bundle ? String(bundle.tasks.length) : "…"} onPress={() => toggle("tasks")} />
          <ListRow icon="extension-puzzle-outline" title="Skills" value={bundle ? String(bundle.skills.length) : "…"} onPress={() => toggle("skills")} />
        </Group>
        {bundle && section && (
          <FadeIn key={section} offset={6} duration={240} style={{ gap: space.sm, marginTop: space.md }}>
            {section === "memory" &&
              (bundle.memories.length ? (
                bundle.memories.map((m) => (
                  <View key={m.id} style={s.card}>
                    <Text selectable style={[type.callout, { color: p.text }]}>
                      {m.text}
                    </Text>
                  </View>
                ))
              ) : (
                <EmptyState icon="bulb-outline" title="Nothing remembered yet" detail={`${bot.name} saves useful facts about you here as you talk.`} />
              ))}
            {section === "routines" &&
              (bundle.routines.length ? (
                bundle.routines.map((r) => (
                  <View key={r.id} style={[s.card, s.row]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.headline, { color: p.text }]}>{r.name}</Text>
                      <Text style={[type.footnote, { color: p.muted }]}>{r.description || r.schedule}</Text>
                    </View>
                    <Switch
                      accessibilityLabel={`Enable ${r.name}`}
                      value={r.enabled}
                      trackColor={{ true: p.green, false: p.elevated }}
                      onValueChange={(enabled) =>
                        void client
                          .request<{ routine: Routine }>("PATCH", `/routines/${r.id}`, { enabled })
                          .then(({ routine }) => setBundle({ ...bundle, routines: bundle.routines.map((x) => (x.id === r.id ? routine : x)) }))
                          .catch((e) => setError(e.message))
                      }
                    />
                  </View>
                ))
              ) : (
                <EmptyState icon="repeat-outline" title="No routines" detail={`Ask ${bot.name} to do something every morning or every week.`} />
              ))}
            {section === "tasks" &&
              (bundle.tasks.length ? (
                bundle.tasks.map((t) => (
                  <View key={t.id} style={s.card}>
                    <Text style={[type.headline, { color: p.text }]}>{t.title}</Text>
                    <Text style={[type.footnote, { color: p.muted }]}>
                      {t.state}
                      {t.note ? ` · ${t.note}` : ""}
                    </Text>
                  </View>
                ))
              ) : (
                <EmptyState icon="checkbox-outline" title="No tasks" detail="Longer jobs show up here while they run." />
              ))}
            {section === "skills" &&
              (bundle.skills.length ? (
                bundle.skills.map((skill) => (
                  <View key={skill.id} style={s.card}>
                    <Text style={[type.headline, { color: p.text }]}>{skill.name}</Text>
                    <Text style={[type.footnote, { color: p.muted }]}>{skill.description}</Text>
                  </View>
                ))
              ) : (
                <EmptyState icon="extension-puzzle-outline" title="No skills yet" detail="Skills teach a bot a repeatable way of doing a job." />
              ))}
          </FadeIn>
        )}
      </ScrollView>
    </KeyboardScreen>
  );
}
