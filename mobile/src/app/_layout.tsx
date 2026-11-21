import React from "react";
import { View, Text } from "react-native";
import { Stack, router, type ErrorBoundaryProps } from "expo-router";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { IconButton, Button, styles as s } from "../components/UI";
import { palette as p } from "../theme";
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: p.blue,
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
function Routes() {
  const { ready, signedIn } = useAuth();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: p.background },
        headerTintColor: p.text,
        contentStyle: { backgroundColor: p.background },
        animation: "slide_from_right",
        headerRight: () => (
          <IconButton
            name="close"
            label="Close"
            onPress={() => router.back()}
          />
        ),
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Protected guard={ready && signedIn} redirectTo="/login">
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="create-bot"
          options={{ title: "New teammate", presentation: "modal" }}
        />
        <Stack.Screen
          name="conversations"
          options={{
            title: "Conversations",
            presentation: "formSheet",
            sheetAllowedDetents: [0.6, 1],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="model"
          options={{
            title: "Model & permissions",
            presentation: "formSheet",
            sheetAllowedDetents: [0.7, 1],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="bot-settings"
          options={{ title: "Teammate settings", presentation: "modal" }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/(tabs)/team">
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="connected" options={{ headerShown: false }} />
    </Stack>
  );
}

// Keep a stable navigator during session hydration. The public index route owns
// the loading screen, and every failed guard has an explicit non-cyclic target.
export const unstable_settings = { initialRouteName: "index" };
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 28,
        gap: 18,
        backgroundColor: p.background,
      }}
    >
      <Text style={{ fontSize: 25, fontWeight: "600", color: p.text }}>
        Let&apos;s reopen Fino
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 24, color: p.muted }}>
        This screen could not open. Your conversations are saved on the server.
      </Text>
      <Button title="Try again" onPress={() => void retry()} />
    </View>
  );
}
