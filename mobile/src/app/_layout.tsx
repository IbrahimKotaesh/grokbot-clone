import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Stack, router } from "expo-router";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { IconButton, styles as s } from "../components/UI";
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
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <ActivityIndicator color={p.blue} />
        <Text style={s.muted}>Opening your workspace…</Text>
      </View>
    );
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
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
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
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="connected" options={{ headerShown: false }} />
    </Stack>
  );
}
