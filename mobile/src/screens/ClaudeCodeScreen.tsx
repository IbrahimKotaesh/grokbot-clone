import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TextInput, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { client } from "../lib/session";
import { handlePlanLimit } from "../lib/billing";
import { Button, ErrorText, Header, IconButton, KeyboardScreen, ProviderMark, styles as s } from "../components/UI";
import { FadeIn, TypingDots } from "../components/motion";
import { palette as p, type, space, radius, fw } from "../theme";
import { t } from "../lib/i18n";

const KEYS: { key: string; label: string }[] = [
  { key: "Escape", label: "Esc" },
  { key: "Up", label: "↑" },
  { key: "Down", label: "↓" },
  { key: "Tab", label: "Tab" },
  { key: "Enter", label: "Enter" },
  { key: "C-c", label: "Ctrl-C" },
];

/** Anthropic's real Claude Code, running on the user's own computer and driven like a remote terminal. */
export function ClaudeCodeScreen({ done }: { done: () => void }) {
  const insets = useSafeAreaInsets();
  const [running, setRunning] = useState<boolean | null>(null),
    [text, setText] = useState(""),
    [input, setInput] = useState(""),
    [starting, setStarting] = useState(false),
    [error, setError] = useState<string | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const poll = async () => {
    try {
      const r = await client.request<{ running: boolean; text: string }>("GET", "/claude-code/screen");
      setRunning(r.running);
      setText(r.text);
    } catch {
      /* keep the last screen */
    }
  };
  useEffect(() => {
    void poll();
  }, []);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void poll(), 1000);
    return () => clearInterval(t);
  }, [running]);
  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      await client.request("POST", "/claude-code/start");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await poll();
    } catch (e) {
      if ((e as { code?: string }).code === "plan_limit") {
        done();
        setTimeout(() => handlePlanLimit(e), 400);
      } else setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };
  const send = async (body: { text?: string; key?: string }) => {
    try {
      await client.request("POST", "/claude-code/input", body);
      void Haptics.selectionAsync();
      setTimeout(() => void poll(), 250);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  // The newest link on screen (Claude's sign-in URL, mostly) gets a one-tap button.
  const links = text.match(/https:\/\/[^\s'"]+/g) ?? [];
  const link = links[links.length - 1];

  return (
    <KeyboardScreen style={{ paddingTop: insets.top }}>
      <Header
        large={false}
        title={t("Claude Code")}
        left={<IconButton name="chevron-down" label={t("Close")} onPress={done} />}
        right={
          running ? (
            <IconButton
              name="power"
              label={t("Stop Claude Code")}
              color={p.muted}
              onPress={() =>
                Alert.alert(t("Stop Claude Code?"), t("The session on your computer will close."), [
                  { text: t("Cancel"), style: "cancel" },
                  {
                    text: t("Stop"),
                    style: "destructive",
                    onPress: () =>
                      void client
                        .request("POST", "/claude-code/stop")
                        .then(() => {
                          setRunning(false);
                          setText("");
                        })
                        .catch((e) => setError(e.message)),
                  },
                ])
              }
            />
          ) : undefined
        }
      />
      {running === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <TypingDots color={p.muted} />
        </View>
      ) : !running ? (
        <View style={{ flex: 1, paddingHorizontal: space.xl, paddingBottom: Math.max(insets.bottom, space.lg) }}>
          <View style={{ flex: 1, justifyContent: "center", gap: space.lg }}>
            <FadeIn style={{ alignItems: "center" }}>
              <View style={{ width: 96, height: 96, borderRadius: 28, backgroundColor: p.surface, borderWidth: 1, borderColor: p.lineStrong, alignItems: "center", justifyContent: "center" }}>
                <ProviderMark provider="claude" size={48} />
              </View>
            </FadeIn>
            <FadeIn delay={80} style={{ alignItems: "center", gap: space.sm }}>
              <Text style={[type.largeTitle, { color: p.text, textAlign: "center" }]}>{t("Claude Code")}</Text>
              <Text style={[type.body, { color: p.muted, textAlign: "center", maxWidth: 320 }]}>
                {t("Anthropic's Claude Code running on your own cloud computer. Sign in with your Claude Pro or Max subscription and use it from your phone.")}
              </Text>
            </FadeIn>
            <FadeIn delay={140} style={[s.card, { gap: space.md }]}>
              {[
                ["download-outline", "Installed on your computer the first time"],
                ["log-in-outline", "You sign in on Anthropic's own page"],
                ["lock-closed-outline", "Your Claude sign-in stays on your computer"],
              ].map(([icon, label]) => (
                <View key={label} style={[s.row, { gap: space.md }]}>
                  <Ionicons name={icon as never} size={18} color={p.muted} />
                  <Text style={[type.callout, { color: p.text, flex: 1 }]}>{t(label)}</Text>
                </View>
              ))}
            </FadeIn>
            <ErrorText error={error} />
          </View>
          <FadeIn delay={200} style={{ gap: space.sm }}>
            <Button title={starting ? t("Starting… the first time takes a minute") : t("Start Claude Code")} icon={starting ? undefined : "play"} busy={starting} onPress={() => void start()} />
            {starting && (
              <Text style={[type.caption, { color: p.faint, textAlign: "center", ...fw("400"), opacity: 0.9 }]}>{t("Waking your computer and installing Claude Code")}</Text>
            )}
          </FadeIn>
        </View>
      ) : (
        <>
          <ScrollView
            ref={scroll}
            style={{ flex: 1, backgroundColor: "#0a0a0b", marginHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: p.line }}
            contentContainerStyle={{ padding: space.md }}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          >
            <Text selectable style={{ color: "#e6e6e6", fontFamily: "Menlo", fontSize: 11.5, lineHeight: 16 }}>
              {text || " "}
            </Text>
          </ScrollView>
          <View style={{ paddingHorizontal: space.md, paddingTop: space.sm, gap: space.sm, paddingBottom: Math.max(insets.bottom, space.md) }}>
            <ErrorText error={error} />
            {!!link && (
              <FadeIn offset={4}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void WebBrowser.openBrowserAsync(link)}
                  style={({ pressed }) => [s.row, { gap: space.sm, backgroundColor: pressed ? p.elevated : p.raised, borderRadius: radius.md, paddingHorizontal: space.md, height: 42 }]}
                >
                  <Ionicons name="open-outline" size={16} color={p.text} />
                  <Text style={[type.subhead, { color: p.text, flex: 1 }]} numberOfLines={1}>
                    Open link · {link.replace(/^https:\/\//, "")}
                  </Text>
                </Pressable>
              </FadeIn>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
              {KEYS.map((k) => (
                <Pressable
                  key={k.key}
                  accessibilityRole="button"
                  accessibilityLabel={t("Press {name}", { name: k.label })}
                  onPress={() => void send({ key: k.key })}
                  style={({ pressed }) => ({ paddingHorizontal: 12, height: 32, borderRadius: 8, justifyContent: "center", backgroundColor: pressed ? p.elevated : p.surface, borderWidth: 1, borderColor: p.line })}
                >
                  <Text style={{ color: p.text, fontFamily: "Menlo", fontSize: 12 }}>{k.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={[s.row, { gap: space.sm, backgroundColor: p.raised, borderRadius: radius.xl, paddingLeft: space.lg, paddingRight: 5, minHeight: 46 }]}>
              <TextInput
                accessibilityLabel={t("Type to Claude Code")}
                placeholder={t("Type to Claude Code, or paste a sign-in code")}
                placeholderTextColor={p.faint}
                selectionColor={p.text}
                value={input}
                onChangeText={setInput}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                style={[type.callout, { color: p.text, flex: 1, paddingVertical: 10, maxHeight: 110 }]}
              />
              <IconButton
                name="arrow-up"
                label={t("Send")}
                variant="primary"
                size={36}
                iconSize={19}
                disabled={!input.trim()}
                onPress={() => {
                  const t = input;
                  setInput("");
                  void send({ text: t, key: "Enter" });
                }}
              />
            </View>
          </View>
        </>
      )}
    </KeyboardScreen>
  );
}
