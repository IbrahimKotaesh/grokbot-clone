import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, TextInput, Animated } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { client } from "../lib/session";
import { Button, ErrorText, Header, IconButton, ProviderMark, KeyboardScreen, SectionLabel, styles as s } from "../components/UI";
import { FadeIn, TypingDots } from "../components/motion";
import { palette as p, type, space, radius } from "../theme";

type Provider = "chatgpt" | "openai" | "anthropic" | "xai" | "openrouter" | "groq";
interface Credential {
  provider: Provider;
  connected: boolean;
  hint: string;
}
type KeyId = "openai" | "anthropic" | "openrouter" | "groq" | "xai";
const keyInfo: Record<KeyId, { name: string; mark?: string; icon?: React.ComponentProps<typeof Ionicons>["name"]; color?: string; prefix: string; where: string }> = {
  openai: { name: "OpenAI API key", mark: "codex", prefix: "sk-…", where: "platform.openai.com → API keys" },
  anthropic: { name: "Anthropic API key", mark: "claude", prefix: "sk-ant-…", where: "console.anthropic.com → API keys" },
  openrouter: { name: "OpenRouter", icon: "git-network-outline", color: "#a78bfa", prefix: "sk-or-…", where: "Gemini, DeepSeek, Llama… some free · openrouter.ai/keys" },
  groq: { name: "Groq", icon: "flash-outline", color: "#ff9f43", prefix: "gsk_…", where: "Very fast, free tier · console.groq.com/keys" },
  xai: { name: "xAI Grok", icon: "planet-outline", color: "#f5f5f7", prefix: "xai-…", where: "Fast Grok models · console.x.ai" },
};

export function ModelsScreen({ done }: { done: () => void }) {
  const [creds, setCreds] = useState<Credential[] | null>(null),
    [shared, setShared] = useState(false),
    [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await client.request<{ credentials: Credential[]; sharedLogin: boolean }>("GET", "/credentials");
      setCreds(r.credentials);
      setShared(r.sharedLogin);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, []);
  const get = (id: Provider) => creds?.find((c) => c.provider === id);
  const remove = (id: Provider, label: string) =>
    Alert.alert(`Disconnect ${label}?`, "Bots using it will stop until you connect another model.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () =>
          void client
            .request("DELETE", `/credentials/${id}`)
            .then(load)
            .catch((e) => setError(e.message)),
      },
    ]);
  return (
    <KeyboardScreen>
      <Header large={false} title="AI models" left={<IconButton name="chevron-back" label="Back" onPress={done} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled">
        <FadeIn style={{ gap: space.sm, paddingHorizontal: space.xs, paddingTop: space.sm }}>
          <Text style={[type.largeTitle, { color: p.text }]}>Bring your model</Text>
          <Text style={[type.body, { color: p.muted }]}>Your bots think with your own AI account. Connect ChatGPT, or add an API key. You can switch any time.</Text>
        </FadeIn>
        <ErrorText error={error} />
        {!creds && !error && (
          <View style={{ paddingVertical: space.xxxl, alignItems: "center" }}>
            <TypingDots color={p.muted} />
          </View>
        )}
        {creds && (
          <>
            <FadeIn delay={60}>
              <SectionLabel>Subscription</SectionLabel>
              <ChatGPTCard connected={!!get("chatgpt")?.connected} onConnected={load} onDisconnect={() => remove("chatgpt", "ChatGPT")} />
            </FadeIn>
            <FadeIn delay={120}>
              <SectionLabel>API keys</SectionLabel>
              <View style={{ gap: space.md }}>
                {(["anthropic", "openai"] as const).map((id) => (
                  <KeyCard key={id} id={id} cred={get(id)} onSaved={load} onRemove={() => remove(id, keyInfo[id].name)} />
                ))}
              </View>
            </FadeIn>
            <FadeIn delay={150}>
              <SectionLabel>Cheap & free models</SectionLabel>
              <View style={{ gap: space.md }}>
                {(["openrouter", "groq", "xai"] as const).map((id) => (
                  <KeyCard key={id} id={id} cred={get(id)} onSaved={load} onRemove={() => remove(id, keyInfo[id].name)} />
                ))}
              </View>
            </FadeIn>
            <FadeIn delay={180} style={{ gap: space.md, marginTop: space.xl }}>
              <Note icon="information-circle-outline">
                Claude Pro and Max subscriptions only work inside Anthropic&apos;s own apps. To use Claude here, add an Anthropic API key.
              </Note>
              <Note icon="lock-closed-outline">Keys are encrypted on the server and only used by your bots. Fino never sees your ChatGPT password.</Note>
              {shared && <Note icon="desktop-outline">Until you connect one, bots use this server&apos;s own sign-in (development mode).</Note>}
            </FadeIn>
          </>
        )}
      </ScrollView>
    </KeyboardScreen>
  );
}

function Note({ icon, children }: { icon: React.ComponentProps<typeof Ionicons>["name"]; children: React.ReactNode }) {
  return (
    <View style={[s.row, { gap: space.md, alignItems: "flex-start", paddingHorizontal: space.xs }]}>
      <Ionicons name={icon} size={16} color={p.faint} style={{ marginTop: 2 }} />
      <Text style={[type.footnote, { color: p.faint, flex: 1 }]}>{children}</Text>
    </View>
  );
}

function Connected({ label }: { label: string }) {
  return (
    <View style={[s.row, { gap: 5 }]}>
      <Ionicons name="checkmark-circle" size={16} color={p.green} />
      <Text style={[type.caption, { color: p.green }]}>{label}</Text>
    </View>
  );
}

function ChatGPTCard({ connected, onConnected, onDisconnect }: { connected: boolean; onConnected: () => void; onDisconnect: () => void }) {
  const [login, setLogin] = useState<{ id: string; url: string; code: string } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!login) return;
    const t = setInterval(async () => {
      try {
        const r = await client.request<{ state: string; error: string | null }>("GET", `/credentials/chatgpt/status/${login.id}`);
        if (r.state === "connected") {
          clearInterval(t);
          setLogin(null);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onConnected();
        } else if (r.state !== "pending") {
          clearInterval(t);
          setLogin(null);
          setError(r.error ?? "Sign-in didn't finish. Try again.");
        }
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => clearInterval(t);
  }, [login?.id]);
  useEffect(() => {
    if (login) Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 180 }).start();
    else pop.setValue(0);
  }, [login?.id]);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await client.request<{ loginId: string; url: string; code: string }>("POST", "/credentials/chatgpt/start");
      setLogin({ id: r.loginId, url: r.url, code: r.code });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[s.card, { gap: space.md }]}>
      <View style={s.row}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: p.raised, alignItems: "center", justifyContent: "center" }}>
          <ProviderMark provider="codex" size={24} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { color: p.text }]}>ChatGPT</Text>
          <Text style={[type.footnote, { color: p.muted }]}>Use your Plus or Pro subscription</Text>
        </View>
        {connected && <Connected label="Connected" />}
      </View>
      {login ? (
        <Animated.View style={{ gap: space.md, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
          <Text style={[type.subhead, { color: p.muted }]}>1. Open the sign-in page and log in to ChatGPT.{"\n"}2. Enter this code:</Text>
          <View style={{ backgroundColor: p.background, borderRadius: radius.md, paddingVertical: space.lg, alignItems: "center", borderWidth: 1, borderColor: p.lineStrong }}>
            <Text selectable style={{ color: p.text, fontSize: 30, fontWeight: "700", letterSpacing: 4, fontFamily: "Menlo" }}>
              {login.code}
            </Text>
          </View>
          <Button title="Open sign-in page" icon="open-outline" onPress={() => void WebBrowser.openBrowserAsync(login.url)} />
          <View style={[s.row, { justifyContent: "center", gap: space.sm }]}>
            <TypingDots color={p.muted} size={4} />
            <Text style={[type.footnote, { color: p.muted }]}>Waiting for you to finish… The code expires in 15 minutes.</Text>
          </View>
        </Animated.View>
      ) : connected ? (
        <Button title="Disconnect" variant="secondary" compact onPress={onDisconnect} />
      ) : (
        <Button title="Sign in with ChatGPT" busy={busy} onPress={() => void start()} />
      )}
      <ErrorText error={error} />
    </View>
  );
}

function KeyCard({ id, cred, onSaved, onRemove }: { id: KeyId; cred?: Credential; onSaved: () => void; onRemove: () => void }) {
  const info = keyInfo[id];
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.request("PUT", `/credentials/${id}`, { apiKey: value.trim() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
      setValue("");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[s.card, { gap: space.md }]}>
      <Pressable style={s.row} onPress={() => !cred?.connected && setEditing(!editing)} accessibilityRole="button">
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: p.raised, alignItems: "center", justifyContent: "center" }}>
          {info.mark ? <ProviderMark provider={info.mark} size={24} /> : <Ionicons name={info.icon ?? "key-outline"} size={22} color={info.color ?? p.text} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { color: p.text }]}>{info.name}</Text>
          <Text style={[type.footnote, { color: p.muted }]}>{cred?.connected ? cred.hint : info.where}</Text>
        </View>
        {cred?.connected ? <Connected label="Added" /> : <Ionicons name={editing ? "chevron-up" : "add-circle-outline"} size={22} color={p.muted} />}
      </Pressable>
      {editing && !cred?.connected && (
        <FadeIn offset={4} duration={200} style={{ gap: space.sm }}>
          <TextInput
            accessibilityLabel={info.name}
            placeholder={info.prefix}
            placeholderTextColor={p.faint}
            selectionColor={p.text}
            value={value}
            onChangeText={setValue}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[s.input, { fontFamily: "Menlo", fontSize: 14 }]}
          />
          <Button title="Save key" compact busy={busy} disabled={value.trim().length < 20} onPress={() => void save()} />
        </FadeIn>
      )}
      {cred?.connected && <Button title="Remove" variant="secondary" compact onPress={onRemove} />}
      <ErrorText error={error} />
    </View>
  );
}
