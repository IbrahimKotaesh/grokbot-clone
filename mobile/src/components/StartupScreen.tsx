import React from "react";
import { Animated, Text, View } from "react-native";
import { Avatar } from "./UI";
import { useLoop } from "./motion";
import { palette as p, type } from "../theme";
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
        <Avatar shape="watermelon" size={72} />
      </Animated.View>
      <Text style={[type.footnote, { color: p.faint }]}>Opening your workspace…</Text>
    </View>
  );
}
