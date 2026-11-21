import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Button, ErrorText, styles as s } from "../components/UI";
import { client, googleLogin, qaLogin, unlock } from "../lib/session";
import { palette as p } from "../theme";
export function LoginScreen({ onLogin,initialError=null }: { onLogin: () => Promise<void>;initialError?:string|null }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(initialError),
    [code, setCode] = useState(""),
    [locked, setLocked] = useState(false);
  const insets = useSafeAreaInsets();
  async function start() {
    setBusy(true);
    setError(null);
    try {
      const status = await client.request<{
        required: boolean;
        unlocked: boolean;
      }>("GET", "/access/status");
      if (status.required && !status.unlocked) {
        if (!code) {
          setLocked(true);
          return;
        }
        await unlock(code);
      }
      if (await googleLogin()) await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 32,
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 32,
          gap: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", gap: 20 }}>
          <Avatar shape="watermelon" size={140} />
          <Text style={[s.title, { fontSize: 38 }]}>Fino</Text>
          <Text style={[s.muted, { textAlign: "center", fontSize: 17 }]}>
            Your team, wherever you are.
          </Text>
        </View>
        {locked && (
          <TextInput
            accessibilityLabel="Access code"
            placeholder="Your access code"
            placeholderTextColor={p.muted}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={12}
            value={code}
            onChangeText={setCode}
            style={s.input}
          />
        )}
        <ErrorText error={error} />
        <Button
          title="Continue with Google"
          busy={busy}
          onPress={() => void start()}
        />
        {process.env.EXPO_PUBLIC_MOBILE_QA === "1" &&
          ["127.0.0.1", "localhost", "10.0.2.2"].includes(
            new URL(client.base).hostname,
          ) && (
            <Button
              title="Open isolated QA workspace"
              secondary
              onPress={() => {
                setBusy(true);
                void qaLogin()
                  .then(onLogin)
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            />
          )}
        <Text style={[s.muted, { textAlign: "center" }]}>
          Your existing bots and conversations will be here.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
