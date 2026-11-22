import React from "react";
import { View, Text, LogBox } from "react-native";
// Clean frames for App Store screenshots (dev only).
if (__DEV__ && process.env.EXPO_PUBLIC_SCREENSHOTS === "1") LogBox.ignoreAllLogs(true);
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { Button, styles as s } from "../components/UI";
import { palette as p, type } from "../theme";
import { t } from "../lib/i18n";
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: p.text,
    background: p.background,
    card: p.background,
    text: p.text,
    border: p.line,
  },
};
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <AuthProvider>
          <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
            <Routes />
          </SafeAreaView>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
// Every screen draws its own header from components/UI so they all match.
const sheet = (detents: number[]) =>
  ({
    presentation: "formSheet",
    sheetAllowedDetents: detents,
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
  }) as const;
function Routes() {
  const { ready, signedIn } = useAuth();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: p.background },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" options={{ animation: "fade" }} />
      <Stack.Protected guard={ready && signedIn} redirectTo="/login">
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
        <Stack.Screen name="chat" />
        <Stack.Screen name="apps" />
        <Stack.Screen name="create-bot" options={{ presentation: "modal" }} />
        <Stack.Screen name="conversations" options={sheet([0.6, 1])} />
        <Stack.Screen name="model" options={sheet([0.75, 1])} />
        <Stack.Screen name="bot-settings" options={{ presentation: "modal" }} />
        <Stack.Screen name="computer" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="call" options={{ presentation: "fullScreenModal", animation: "fade" }} />
        <Stack.Screen name="onboarding" options={{ presentation: "fullScreenModal", animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="marketplace" />
        <Stack.Screen name="marketplace-bot" options={sheet([0.92])} />
        <Stack.Screen name="upgrade" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="models" />
        <Stack.Screen name="claude-code" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/(tabs)/team">
        <Stack.Screen name="login" options={{ animation: "fade" }} />
      </Stack.Protected>
      <Stack.Screen name="auth" />
      <Stack.Screen name="connected" />
    </Stack>
  );
}

// Keep a stable navigator during session hydration. The public index route owns
// the loading screen, and every failed guard has an explicit non-cyclic target.
export const unstable_settings = { anchor: "index" };
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 28, gap: 16, backgroundColor: p.background }}>
      <Text style={[type.title, { color: p.text }]}>{t("Let's reopen Fino")}</Text>
      <Text style={[type.body, { color: p.muted }]}>
        {t("This screen could not open. Your conversations are saved on the server.")}
      </Text>
      <Button title={t("Try again")} onPress={() => void retry()} />
    </View>
  );
}
