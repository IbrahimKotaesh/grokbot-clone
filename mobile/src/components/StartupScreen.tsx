import React from "react";
import { Animated, Text, View } from "react-native";
import { Avatar } from "./UI";
import { useLoop } from "./motion";
import { palette as p, type } from "../theme";
import { t } from "../lib/i18n";
export function StartupScreen() {
  const v = useLoop(1600);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: p.background, gap: 18 }}>
      <Animated.View
        style={{
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.04] }) }],
        }}
      >
        <Avatar shape="accountant" size={72} primary />
      </Animated.View>
      <Text style={[type.footnote, { color: p.faint }]}>{t("Opening your workspace…")}</Text>
    </View>
  );
}
