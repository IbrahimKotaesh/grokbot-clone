import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useWorkspace } from "../lib/store";
import { Avatar, Button, Chip, EmptyState, ErrorText, Header, IconButton, styles as s } from "../components/UI";
import { FadeIn, PressableScale, TypingDots } from "../components/motion";
import { palette as p, type, space, radius, accentFor } from "../theme";
import { catalog, categories, templateById, type BotTemplate, type CategoryId } from "../lib/catalog";
import { installTemplate, isInstalled } from "../lib/install";
import { handlePlanLimit } from "../lib/billing";
import { TAB_BAR_SPACE } from "../components/FloatingTabBar";
import { t as tr } from "../lib/i18n";

/** Install state shared by the list and the detail sheet. */
export function useInstaller() {
  const bots = useWorkspace((x) => x.bots);
  const [busy, setBusy] = useState<Record<string, string>>({}),
    [error, setError] = useState<string | null>(null);
  const install = async (t: BotTemplate) => {
    if (isInstalled(t, bots) || busy[t.id]) return;
    setError(null);
    setBusy((b) => ({ ...b, [t.id]: tr("Hiring…") }));
    try {
      await installTemplate(t, (n, total) => setBusy((b) => ({ ...b, [t.id]: tr("Skills {n}/{total}", { n, total }) })));
      await useWorkspace.getState().refresh();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      if (!handlePlanLimit(e)) setError((e as Error).message);
    } finally {
      setBusy(({ [t.id]: _, ...rest }) => rest);
    }
  };
  return { bots, busy, error, install, installed: (t: BotTemplate) => isInstalled(t, bots) };
}

export function MarketplaceScreen({ done, openBot }: { done?: () => void; openBot: (id: string) => void }) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<CategoryId | "all">("all");
  const { busy, error, install, installed } = useInstaller();
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(
      (t) =>
        (category === "all" || t.category === category) &&
        (!q || [t.name, t.label, t.tagline, t.description, tr(t.label), tr(t.tagline), tr(t.description), ...t.skills.map((x) => x.name), ...t.skills.map((x) => tr(x.name))].join(" ").toLowerCase().includes(q)),
    );
  }, [query, category]);
  const pack = category !== "all" ? catalog.filter((t) => t.category === category) : null;
  const packLeft = pack?.filter((t) => !installed(t)) ?? [];
  return (
    <View style={s.screen}>
      {done ? <Header large={false} title={tr("Marketplace")} left={<IconButton name="chevron-back" label={tr("Back")} onPress={done} />} /> : <Header title={tr("Marketplace")} />}
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxxl + (done ? 0 : TAB_BAR_SPACE) }} keyboardShouldPersistTaps="handled">
        <FadeIn style={{ paddingHorizontal: space.xl, paddingTop: space.sm, gap: space.xs }}>
          <Text style={[type.largeTitle, { color: p.text }]}>{tr("Hire a bot")}</Text>
          <Text style={[type.body, { color: p.muted }]}>{tr("Ready-made specialists with skills built in. Add one and it starts working right away.")}</Text>
        </FadeIn>
        <View style={[s.row, { gap: space.sm, backgroundColor: p.raised, borderRadius: radius.md, paddingHorizontal: space.md, height: 44, marginHorizontal: space.xl, marginTop: space.lg }]}>
          <Ionicons name="search" size={17} color={p.faint} />
          <TextInput
            accessibilityLabel={tr("Search bots")}
            placeholder={tr("Search bots or skills")}
            placeholderTextColor={p.faint}
            selectionColor={p.text}
            value={query}
            onChangeText={setQuery}
            style={[type.body, { color: p.text, flex: 1 }]}
            autoCorrect={false}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.xl, paddingVertical: space.lg }}>
          <Chip label={tr("All")} selected={category === "all"} onPress={() => setCategory("all")} />
          {categories.map((c) => (
            <Chip key={c.id} label={tr(c.label)} icon={c.icon as never} selected={category === c.id} onPress={() => setCategory(c.id)} />
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <ErrorText error={error} />
          {pack && pack.length > 1 && !query && (
            <FadeIn key={`pack-${category}`}>
              <View style={[s.card, { padding: space.lg, gap: space.md, borderColor: p.lineStrong }]}>
                <View style={s.row}>
                  <View style={{ flexDirection: "row" }}>
                    {pack.map((t, i) => (
                      <View key={t.id} style={{ marginLeft: i ? -12 : 0 }}>
                        <Avatar shape={t.shape} size={38} />
                      </View>
                    ))}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.headline, { color: p.text }]}>{tr("{name} team", { name: tr(categories.find((c) => c.id === category)?.label ?? "") })}</Text>
                    <Text style={[type.footnote, { color: p.muted }]}>{tr(categories.find((c) => c.id === category)?.blurb ?? "")}</Text>
                  </View>
                </View>
                <Button
                  title={packLeft.length ? tr("Add all {n}", { n: packLeft.length }) : tr("Whole team added")}
                  icon={packLeft.length ? "add" : "checkmark"}
                  compact
                  disabled={!packLeft.length || Object.keys(busy).length > 0}
                  onPress={() => void (async () => {
                    for (const t of packLeft) await install(t);
                  })()}
                />
              </View>
            </FadeIn>
          )}
          {list.map((t, i) => (
            <FadeIn key={`${category}-${t.id}`} delay={Math.min(i, 8) * 50}>
              <BotCard t={t} added={installed(t)} progress={busy[t.id]} onOpen={() => openBot(t.id)} onAdd={() => void install(t)} />
            </FadeIn>
          ))}
          {!list.length && <EmptyState icon="search-outline" title={tr("No bots match")} detail={tr("Try another word, or create your own bot from the Bots tab.")} />}
        </View>
      </ScrollView>
    </View>
  );
}

function BotCard({ t, added, progress, onOpen, onAdd }: { t: BotTemplate; added: boolean; progress?: string; onOpen: () => void; onAdd: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={`${t.name}, ${t.label}`} onPress={onOpen} scaleTo={0.985} style={[s.card, { gap: space.md }]}>
      <View style={s.row}>
        <Avatar shape={t.shape} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { color: p.text }]}>{tr(t.label)}</Text>
          <Text style={[type.footnote, { color: p.muted }]} numberOfLines={1}>
            {t.name} · {tr(t.tagline)}
          </Text>
        </View>
        {added ? (
          <View style={[s.row, { gap: 4 }]}>
            <Ionicons name="checkmark-circle" size={18} color={p.green} />
            <Text style={[type.caption, { color: p.muted }]}>{tr("Added")}</Text>
          </View>
        ) : progress ? (
          <View style={{ alignItems: "center", gap: 4, minWidth: 64 }}>
            <TypingDots color={p.text} size={4} />
            <Text style={[type.caption, { color: p.faint, fontWeight: "400" }]}>{progress}</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("Add {name}", { name: tr(t.label) })}
            onPress={onAdd}
            hitSlop={8}
            style={({ pressed }) => ({ backgroundColor: pressed ? p.elevated : p.raised, borderRadius: radius.full, paddingHorizontal: 16, height: 32, justifyContent: "center" })}
          >
            <Text style={[type.subhead, { color: p.text, fontWeight: "700" }]}>{tr("Get")}</Text>
          </Pressable>
        )}
      </View>
      <Text style={[type.callout, { color: p.muted }]} numberOfLines={2}>
        {tr(t.description)}
      </Text>
      <View style={[s.row, { gap: 6 }]}>
        <Ionicons name="flash" size={12} color={p.amber} />
        <Text style={[type.caption, { color: p.faint, fontWeight: "500" }]}>{tr("{n} skills", { n: t.skills.length })} · {t.skills.map((x) => tr(x.name)).slice(0, 2).join(", ")}{t.skills.length > 2 ? "…" : ""}</Text>
      </View>
    </PressableScale>
  );
}

export function MarketplaceBotScreen({ id, done, openChat }: { id: string; done: () => void; openChat: (botId: string) => void }) {
  const t = templateById(id);
  const { bots, busy, error, install, installed } = useInstaller();
  const [open, setOpen] = useState<string | null>(null);
  if (!t) return null;
  const added = installed(t);
  const bot = bots.find((b) => b.label === t.label);
  const accent = accentFor(t.color);
  return (
    <View style={s.screen}>
      <Header large={false} title="" right={<IconButton name="close" label={tr("Close")} variant="filled" size={34} iconSize={16} onPress={done} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.lg }}>
        <FadeIn style={{ alignItems: "center", gap: space.sm }}>
          <View style={{ width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center", backgroundColor: accent + "22" }}>
            <Avatar shape={t.shape} size={96} />
          </View>
          <Text style={[type.largeTitle, { color: p.text, marginTop: space.sm }]}>{tr(t.label)}</Text>
          <Text style={[type.callout, { color: p.muted }]}>
            {tr("Meet {name}", { name: t.name })} · {tr(categories.find((c) => c.id === t.category)?.label ?? "")}
          </Text>
        </FadeIn>
        <FadeIn delay={60}>
          {added ? (
            <Button title={tr("Message {name}", { name: t.name })} icon="chatbubble-ellipses" onPress={() => bot && openChat(bot.id)} />
          ) : (
            <Button title={busy[t.id] ?? tr("Add to my team")} icon={busy[t.id] ? undefined : "add"} busy={!!busy[t.id]} onPress={() => void install(t)} />
          )}
        </FadeIn>
        <ErrorText error={error} />
        <FadeIn delay={120} style={{ gap: space.sm }}>
          <Text style={[type.body, { color: p.text }]}>{tr(t.description)}</Text>
        </FadeIn>
        <FadeIn delay={160} style={{ gap: space.sm }}>
          <Text style={[s.label, { paddingHorizontal: space.xs }]}>{tr("Skills included")} · {t.skills.length}</Text>
          <View style={s.group}>
            {t.skills.map((sk, i) => {
              const expanded = open === sk.name;
              return (
                <View key={sk.name}>
                  {i > 0 && <View style={s.separator} />}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setOpen(expanded ? null : sk.name);
                    }}
                    style={({ pressed }) => [s.listRow, pressed && { backgroundColor: p.elevated }]}
                  >
                    <View style={[s.rowIcon, { backgroundColor: "#ffc04d1f" }]}>
                      <Ionicons name="flash" size={16} color={p.amber} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.body, { color: p.text }]}>{sk.name}</Text>
                      <Text style={[type.footnote, { color: p.muted }]}>{tr(sk.description)}</Text>
                    </View>
                    <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={15} color={p.faint} />
                  </Pressable>
                  {expanded && (
                    <FadeIn offset={4} duration={220} style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, paddingLeft: 58 }}>
                      <Text style={[type.footnote, { color: p.muted, lineHeight: 20 }]}>{sk.body}</Text>
                    </FadeIn>
                  )}
                </View>
              );
            })}
          </View>
        </FadeIn>
        <FadeIn delay={200} style={[s.card, { gap: space.md }]}>
          {[
            ["desktop-outline", "Its own computer screen"],
            ["shield-checkmark-outline", "Asks before sending, paying or deleting"],
          ].map(([icon, label]) => (
            <View key={label} style={[s.row, { gap: space.md }]}>
              <Ionicons name={icon as never} size={18} color={p.muted} />
              <Text style={[type.callout, { color: p.text }]}>{tr(label)}</Text>
            </View>
          ))}
        </FadeIn>
      </ScrollView>
    </View>
  );
}
