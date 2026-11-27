import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, TextInput, Pressable, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useWorkspace } from "../lib/store";
import { Avatar, Button, Chip, EmptyState, ErrorText, Header, IconButton, styles as s } from "../components/UI";
import { FadeIn, PressableScale, TypingDots } from "../components/motion";
import { palette as p, type, space, radius, accentFor, fw, sticker } from "../theme";
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
        <View style={[s.row, { gap: space.sm, backgroundColor: p.raised, borderRadius: radius.full, paddingHorizontal: space.lg, height: 44, marginHorizontal: space.xl, marginTop: space.xs }]}>
          <Ionicons name="search" size={17} color={p.faint} />
          <TextInput
            accessibilityLabel={tr("Search bots")}
            placeholder={tr("Search")}
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
            <Chip key={c.id} label={tr(c.label)} selected={category === c.id} onPress={() => setCategory(c.id)} />
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: space.xl, gap: space.md }}>
          <ErrorText error={error} />
          {pack && pack.length > 1 && !query && packLeft.length > 0 && (
            <Pressable
              accessibilityRole="button"
              disabled={Object.keys(busy).length > 0}
              onPress={() => void (async () => {
                for (const t of packLeft) await install(t);
              })()}
              style={({ pressed }) => [s.row, { alignSelf: "flex-start", gap: 6, opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="add-circle" size={18} color={p.text} />
              <Text style={[type.subhead, { color: p.text, ...fw("700") }]}>{tr("Add all {n}", { n: packLeft.length })}</Text>
            </Pressable>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP }}>
            {list.map((t, i) => (
              <FadeIn key={`${category}-${t.id}`} delay={Math.min(i, 8) * 40}>
                <BotTile t={t} added={installed(t)} progress={busy[t.id]} onOpen={() => openBot(t.id)} onAdd={() => void install(t)} />
              </FadeIn>
            ))}
          </View>
          {!list.length && <EmptyState icon="search-outline" title={tr("No bots match")} detail={tr("Try another word.")} />}
        </View>
      </ScrollView>
    </View>
  );
}

const TILE_GAP = 12;

/** One teammate: a big face on its own color, the job, and a round add button. Nothing else. */
function BotTile({ t, added, progress, onOpen, onAdd }: { t: BotTemplate; added: boolean; progress?: string; onOpen: () => void; onAdd: () => void }) {
  const { width } = useWindowDimensions();
  const w = Math.floor((width - space.xl * 2 - TILE_GAP) / 2);
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={`${t.name}, ${tr(t.label)}`} onPress={onOpen} scaleTo={0.97} style={{ width: w, gap: space.sm }}>
      <View style={{ height: w, borderRadius: 26, backgroundColor: accentFor(t.color) + "26", alignItems: "center", justifyContent: "center" }}>
        <Avatar shape={t.shape} size={Math.round(w * 0.5)} color={t.color} />
        <View style={{ position: "absolute", top: 10, right: 10 }}>
          {added ? (
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: p.surface, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="checkmark" size={18} color={p.green} />
            </View>
          ) : progress ? (
            <View style={{ height: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: p.surface, alignItems: "center", justifyContent: "center" }}>
              <TypingDots color={p.text} size={4} />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("Add {name}", { name: tr(t.label) })}
              onPress={onAdd}
              hitSlop={10}
              style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 16, backgroundColor: p.sun, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.92 : 1 }] }, sticker(), { borderWidth: 1.5, shadowOffset: { width: 2, height: 2 } }]}
            >
              <Ionicons name="add" size={20} color={p.onSun} />
            </Pressable>
          )}
        </View>
      </View>
      <View style={{ paddingHorizontal: 4, gap: 1 }}>
        <Text style={[type.headline, { color: p.text }]} numberOfLines={1}>{t.name}</Text>
        <Text style={[type.footnote, { color: p.muted }]} numberOfLines={1}>{tr(t.label)}</Text>
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
            <Avatar shape={t.shape} size={96} color={t.color} />
          </View>
          <Text style={[type.largeTitle, { color: p.text, marginTop: space.sm }]}>{t.name}</Text>
          <Text style={[type.callout, { color: p.muted }]}>{tr(t.label)}</Text>
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
          <Text style={[type.body, { color: p.muted, textAlign: "center" }]}>{tr(t.description)}</Text>
        </FadeIn>
        <FadeIn delay={160} style={{ gap: space.sm }}>
          <Text style={[s.label, { paddingHorizontal: space.xs }]}>{tr("Skills")}</Text>
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
                      <Text style={[type.body, { color: p.text }]}>{tr(sk.name)}</Text>
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
      </ScrollView>
    </View>
  );
}
