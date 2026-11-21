import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { palette as p } from "../../theme";
const icons = {
  team: "people-outline",
  chat: "chatbubble-outline",
  apps: "grid-outline",
  updates: "notifications-outline",
  settings: "settings-outline",
} as const;
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: p.blue,
        tabBarInactiveTintColor: p.muted,
        tabBarStyle: { backgroundColor: p.background, borderTopColor: p.line },
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={icons[route.name as keyof typeof icons] ?? "ellipse-outline"}
            color={typeof color === "string" ? color : p.muted}
            size={size}
          />
        ),
      })}
    >
      <Tabs.Screen name="team" options={{ title: "Team" }} />
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="apps" options={{ title: "Apps" }} />
      <Tabs.Screen name="updates" options={{ title: "Updates" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}

export const unstable_settings = { initialRouteName: "team" };
