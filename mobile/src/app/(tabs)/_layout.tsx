import React from "react";
import { Tabs } from "expo-router";
import { palette as p } from "../../theme";
import { t } from "../../lib/i18n";
import { FloatingTabBar } from "../../components/FloatingTabBar";
export default function TabLayout() {
  return (
    <Tabs
      backBehavior="initialRoute"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: "shift", sceneStyle: { backgroundColor: p.background } }}
    >
      <Tabs.Screen name="team" options={{ title: t("Bots") }} />
      <Tabs.Screen name="market" options={{ title: t("Market") }} />
      <Tabs.Screen name="updates" options={{ title: t("Inbox") }} />
      <Tabs.Screen name="settings" options={{ title: t("Settings") }} />
    </Tabs>
  );
}

export const unstable_settings = { anchor: "team" };
