import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Button, ErrorText, Header, IconButton, styles as s } from "../components/UI";
import { FadeIn, TypingDots } from "../components/motion";
import { palette as p, type, space, radius, motion } from "../theme";
import { useBilling, purchase, restore, type Plan, type PlanId } from "../lib/billing";
import * as WebBrowser from "expo-web-browser";
import { client } from "../lib/session";
import { useWorkspace } from "../lib/store";
import { configurePurchases, storePrices } from "../lib/purchases";
import { t } from "../lib/i18n";

/** Legal pages are served by the Fino server (web/public). */
const LEGAL = client.base.replace(/\/$/, "");

const copy = {
  computer: { title: t("Give your bots a computer"), detail: t("With Pro, every bot gets its own screen to browse, fill forms and use apps for you.") },
  bots: { title: t("Grow your team"), detail: t("Your plan's bot limit is reached. Upgrade to hire more specialists.") },
  voice: { title: t("Do more"), detail: t("Upgrade for more bots and computer time.") },
  models: { title: t("Unlock stronger models"), detail: t("Pro and Max include stronger Badr, GPT, Grok and Claude models for your bots.") },
} as const;

export function UpgradeScreen({ done, feature }: { done: () => void; feature?: keyof typeof copy }) {
  const insets = useSafeAreaInsets();
  const summary = useBilling((x) => x.summary);
  const load = useBilling((x) => x.load);
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const current = summary?.plan ?? "free";
  const webBilled = summary?.source === "stripe";
  const [selected, setSelected] = useState<PlanId>(current === "free" || current === "starter" ? "pro" : current === "pro" ? "max" : current);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const userId = useWorkspace((x) => x.user?.id);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    // Show the App Store price in the buyer's own currency when it is available.
    if (userId) void configurePurchases(userId).then((ok) => (ok ? storePrices() : {})).then(setPrices).catch(() => {});
  }, [userId]);
  const price = (plan: Plan) => prices[plan.id] ?? (plan.priceUsd !== null ? "$" + plan.priceUsd : null);
  useEffect(() => {
    if (summary) setSelected((sel) => (sel === summary.plan && (summary.plan === "starter" || summary.plan === "free") ? "pro" : sel));
  }, [summary?.plan]);
  const plans = (summary?.plans ?? []).filter((x) => x.id !== "free");
  const sel = plans.find((x) => x.id === selected);
  const head = feature ? copy[feature] : { title: t("Choose your plan"), detail: t("Bring your own ChatGPT or API key. Badr gives your bots a home, skills and a computer.") };
  const buy = async () => {
    if (!sel) return;
    if (sel.id === "enterprise") {
      Alert.alert(t("Enterprise"), t("Tell us about your team and we'll set up a private workspace, SSO and your own marketplace."), [{ text: t("OK") }]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await purchase(sel.id);
      if (r === "unavailable") Alert.alert(t("Not available yet"), t("Subscriptions aren't set up in this build."));
      else if (r === "pending") {
        Alert.alert(t("Thanks!"), t("Your purchase went through. Your plan will update in a moment."));
        done();
      } else if (r === "done") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        done();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const used = summary?.usage.computerMinutes ?? 0;
  const cur = plans.find((x) => x.id === current);
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <Header large={false} title="" left={<IconButton name="close" label={t("Close")} onPress={done} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md }}>
        <FadeIn style={{ gap: space.sm, paddingHorizontal: space.xs, marginBottom: space.sm }}>
          <View style={[s.row, { gap: 6, alignSelf: "flex-start", backgroundColor: "#ffc04d1f", borderRadius: radius.full, paddingHorizontal: 10, height: 26 }]}>
            <Ionicons name="sparkles" size={13} color={p.amber} />
            <Text style={[type.caption, { color: p.amber }]}>FINO PLANS</Text>
          </View>
          <Text style={[type.largeTitle, { color: p.text }]}>{head.title}</Text>
          <Text style={[type.body, { color: p.muted }]}>{head.detail}</Text>
        </FadeIn>
        {!summary && !error && (
          <View style={{ paddingVertical: space.xxxl, alignItems: "center" }}>
            <TypingDots color={p.muted} />
          </View>
        )}
        <ErrorText error={error} />
        {plans.map((plan, i) => (
          <FadeIn key={plan.id} delay={60 + i * 60}>
            <PlanCard plan={plan} price={price(plan)} selected={selected === plan.id} current={current === plan.id} onPress={() => setSelected(plan.id)} />
          </FadeIn>
        ))}
        {cur?.computer && cur.computerHours !== null && (
          <FadeIn delay={320} style={[s.card, { gap: space.sm }]}>
            <View style={s.rowBetween}>
              <Text style={[type.subhead, { color: p.text }]}>{t("Computer this month")}</Text>
              <Text style={[type.subhead, { color: p.muted }]}>
                {(used / 60).toFixed(1)} / {cur.computerHours} h
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: p.raised, overflow: "hidden" }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: used >= cur.computerHours * 60 ? p.red : p.text, width: `${Math.min(100, (used / (cur.computerHours * 60)) * 100)}%` }} />
            </View>
          </FadeIn>
        )}
        <FadeIn delay={360} style={[s.row, { gap: space.md, paddingHorizontal: space.xs, alignItems: "flex-start", marginTop: space.sm }]}>
          <Ionicons name="key-outline" size={16} color={p.faint} style={{ marginTop: 2 }} />
          <Text style={[type.footnote, { color: p.faint, flex: 1 }]}>
            {t("Plans don't include AI usage. Your bots run on your own ChatGPT account or API key, so you only pay for what you already use.")}
          </Text>
        </FadeIn>
      </ScrollView>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: Math.max(insets.bottom, space.lg), borderTopWidth: 0.5, borderTopColor: p.line, gap: space.sm }}>
        <Button
          title={
            !sel
              ? t("Loading…")
              : webBilled
                ? t("Your plan is billed on the web")
                : sel.id === current
                ? `You're on ${sel.name}`
                : sel.id === "enterprise"
                  ? t("Talk to us")
                  : t(rank(sel.id) > rank(current) ? "Upgrade to {name} · {price}" : "Switch to {name} · {price}", { name: sel.name, price: `${price(sel)}${t("/mo")}` })
          }
          disabled={!sel || sel.id === current || webBilled}
          busy={busy}
          onPress={() => void buy()}
        />
        <Text style={[type.caption, { color: p.faint, textAlign: "center", fontWeight: "400", lineHeight: 16 }]}>
          Monthly subscription, renews automatically until cancelled. Payment is charged to your Apple ID at confirmation. Cancel anytime in your App Store
          settings at least 24 hours before renewal.
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: space.lg }}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() =>
              void restore()
                .then((r) => Alert.alert(r === "restored" ? t("Purchases restored") : r === "none" ? t("Nothing to restore") : t("Not available yet"), r === "restored" ? t("Your plan is back.") : r === "none" ? t("No active subscription was found for this Apple ID.") : t("Subscriptions aren't set up in this build.")))
                .catch((e) => setError(e.message))
            }
          >
            <Text style={[type.caption, { color: p.muted }]}>{t("Restore Purchases")}</Text>
          </Pressable>
          <Pressable accessibilityRole="link" hitSlop={8} onPress={() => void WebBrowser.openBrowserAsync(`${LEGAL}/terms.html`)}>
            <Text style={[type.caption, { color: p.muted }]}>{t("Terms")}</Text>
          </Pressable>
          <Pressable accessibilityRole="link" hitSlop={8} onPress={() => void WebBrowser.openBrowserAsync(`${LEGAL}/privacy.html`)}>
            <Text style={[type.caption, { color: p.muted }]}>{t("Privacy")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
const rank = (id: PlanId) => ["free", "starter", "pro", "max", "ultra", "enterprise"].indexOf(id);

function PlanCard({ plan, price, selected, current, onPress }: { plan: Plan; price: string | null; selected: boolean; current: boolean; onPress: () => void }) {
  const v = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: selected ? 1 : 0, useNativeDriver: false, ...motion.spring }).start();
  }, [selected]);
  const popular = plan.id === "pro";
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${plan.name}${price && plan.priceUsd ? `, ${price}${t("/mo")}` : ""}`}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
    >
      <Animated.View
        style={{
          borderRadius: radius.xl,
          padding: space.lg,
          gap: space.md,
          backgroundColor: p.surface,
          borderWidth: 1.5,
          borderColor: v.interpolate({ inputRange: [0, 1], outputRange: [p.line, p.text] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.01] }) }],
        }}
      >
        <View style={s.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={[s.row, { gap: space.sm }]}>
              <Text style={[type.title, { color: p.text }]}>{plan.name}</Text>
              {popular && (
                <View style={{ backgroundColor: p.text, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: p.onPrimary, fontSize: 11, fontWeight: "700" }}>POPULAR</Text>
                </View>
              )}
              {current && (
                <View style={{ backgroundColor: p.raised, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: p.muted, fontSize: 11, fontWeight: "700" }}>CURRENT</Text>
                </View>
              )}
            </View>
          </View>
          {price !== null ? (
            <Text style={[type.title, { color: p.text }]}>
              {price}
              <Text style={[type.subhead, { color: p.muted, fontWeight: "400" }]}>/mo</Text>
            </Text>
          ) : (
            <Text style={[type.headline, { color: p.muted }]}>{t("Custom")}</Text>
          )}
        </View>
        <View style={{ gap: 8 }}>
          {plan.highlights.map((h) => (
            <View key={h} style={[s.row, { gap: 10 }]}>
              <Ionicons name={/computer/i.test(h) ? "desktop-outline" : /voice-call/i.test(h) ? "call-outline" : /bot/i.test(h) ? "sparkles-outline" : "checkmark"} size={16} color={/computer/i.test(h) ? p.green : p.muted} />
              <Text style={[type.callout, { color: p.text, flex: 1 }]}>{h}</Text>
            </View>
          ))}
          {!plan.computer && (
            <View style={[s.row, { gap: 10 }]}>
              <Ionicons name="lock-closed-outline" size={16} color={p.faint} />
              <Text style={[type.callout, { color: p.faint }]}>{t("No computer use")}</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}
