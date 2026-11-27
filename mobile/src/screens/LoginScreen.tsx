import React, { useEffect, useState } from "react";
import { View, Text, Animated, Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Button, ErrorText, TextField, KeyboardScreen } from "../components/UI";
import { FadeIn, useLoop } from "../components/motion";
import { appleLogin, client, googleLogin, qaEnabled, qaLogin, unlock } from "../lib/session";
import { palette as p, type, space, fruits } from "../theme";
import { t } from "../lib/i18n";
export function LoginScreen({ onLogin, initialError = null }: { onLogin: () => Promise<void>; initialError?: string | null }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(initialError),
    [code, setCode] = useState(""),
    [locked, setLocked] = useState(false);
  const insets = useSafeAreaInsets();
  const fail = (e: unknown) => {
    console.warn("[login]", (e as Error)?.message);
    setError((e as Error)?.message ?? String(e));
  };
  const float = useLoop(3600);
  // Dev builds on a local server skip Google and sign straight in.
  useEffect(() => {
    if (!qaEnabled() || initialError) return;
    setBusy(true);
    void qaLogin()
      .then(onLogin)
      .catch(fail)
      .finally(() => setBusy(false));
  }, []);
  async function start() {
    setBusy(true);
    setError(null);
    try {
      const status = await client.request<{ required: boolean; unlocked: boolean }>("GET", "/access/status");
      if (status.required && !status.unlocked) {
        if (!code) {
          setLocked(true);
          return;
        }
        await unlock(code);
      }
      if (await googleLogin()) await onLogin();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <KeyboardScreen>
      <View style={{ flex: 1, paddingHorizontal: space.xxl, paddingBottom: insets.bottom + space.lg }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.xl }}>
          <FadeIn>
            <View style={{ flexDirection: "row" }}>
              {fruits.slice(0, 4).map((f, i) => (
                <Animated.View
                  key={f}
                  style={{
                    marginLeft: i ? -14 : 0,
                    zIndex: i === 1 || i === 2 ? 2 : 1,
                    transform: [
                      { translateY: float.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [0, -8] : [-8, 0] }) },
                      { scale: i === 1 || i === 2 ? 1.12 : 0.92 },
                    ],
                  }}
                >
                  <Avatar shape={f} size={78} />
                </Animated.View>
              ))}
            </View>
          </FadeIn>
          <FadeIn delay={120} style={{ alignItems: "center", gap: space.sm }}>
            <Text style={[type.largeTitle, { color: p.text, fontSize: 40, lineHeight: 46 }]}>Badr</Text>
            <Text style={[type.body, { color: p.muted, textAlign: "center", maxWidth: 280 }]}>
              {t("A team of AI bots that browse, use their own computers, and get real work done.")}
            </Text>
          </FadeIn>
        </View>
        <FadeIn delay={240} style={{ gap: space.md }}>
          {locked && <TextField placeholder={t("Access code")} secureTextEntry keyboardType="number-pad" maxLength={12} value={code} onChangeText={setCode} autoFocus />}
          <ErrorText error={error} />
          {Platform.OS === "ios" && !locked && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={25}
              style={{ height: 50, width: "100%", opacity: busy ? 0.5 : 1 }}
              onPress={() => {
                if (busy) return;
                setBusy(true);
                setError(null);
                void appleLogin()
                  .then((ok) => (ok ? onLogin() : undefined))
                  .catch(fail)
                  .finally(() => setBusy(false));
              }}
            />
          )}
          <Button
            title={locked ? t("Unlock and continue") : t("Continue with Google")}
            icon={locked ? "lock-open" : "logo-google"}
            variant={Platform.OS === "ios" && !locked ? "secondary" : "primary"}
            busy={busy}
            onPress={() => void start()}
          />
          {qaEnabled() && (
            <Button
              title={t("Open local workspace")}
              variant="secondary"
              onPress={() => {
                setBusy(true);
                void qaLogin()
                  .then(onLogin)
                  .catch(fail)
                  .finally(() => setBusy(false));
              }}
            />
          )}
          <Text style={[type.caption, { color: p.faint, textAlign: "center", fontWeight: "400" }]}>{t("Your bots and conversations stay in your private workspace.")}</Text>
        </FadeIn>
      </View>
    </KeyboardScreen>
  );
}
