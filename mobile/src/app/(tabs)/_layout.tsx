import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { palette as p } from "../../theme";
const icons = {
  team: ["sparkles-outline", "sparkles"],
  updates: ["file-tray-outline", "file-tray"],
  settings: ["person-circle-outline", "person-circle"],
} as const;
export default function TabLayout() {
  return (
    <Tabs
      backBehavior="initialRoute"
      screenListeners={{ tabPress: () => void Haptics.selectionAsync() }}
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: "shift",
        sceneStyle: { backgroundColor: p.background },
        tabBarActiveTintColor: p.text,
        tabBarInactiveTintColor: p.faint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: p.background,
          borderTopColor: p.line,
          borderTopWidth: 0.5,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const pair = icons[route.name as keyof typeof icons];
          return (
            <Ionicons
              name={pair ? pair[focused ? 1 : 0] : "ellipse-outline"}
              color={typeof color === "string" ? color : p.muted}
              size={size - 1}
            />
          );
        },
      })}
    >
      <Tabs.Screen name="team" options={{ title: "Bots" }} />
      <Tabs.Screen name="updates" options={{ title: "Inbox" }} />
      <Tabs.Screen name="settings" options={{ title: "Account" }} />
    </Tabs>
  );
}

export const unstable_settings = { anchor: "team" };
