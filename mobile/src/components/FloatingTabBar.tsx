// A floating pill tab bar: sits above the content with a soft shadow, and the active tab's
// highlight slides between tabs.
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/build/layouts/Tabs";
import { palette as p, fw } from "../theme";
import { isRTL } from "../lib/i18n";

/** Extra bottom padding tab screens add so their last row isn't hidden behind the bar. */
export const TAB_BAR_SPACE = 96;

const ICONS: Record<string, [string, string]> = {
  team: ["sparkles-outline", "sparkles"],
  market: ["storefront-outline", "storefront"],
  updates: ["file-tray-outline", "file-tray"],
  settings: ["settings-outline", "settings"],
};

export function FloatingTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const count = state.routes.length;
  const slot = width / count;
  const x = useRef(new Animated.Value(state.index)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: state.index, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [state.index, x]);
  // In right-to-left layouts the first tab sits on the right.
  const translateX = x.interpolate({ inputRange: [0, Math.max(1, count - 1)], outputRange: isRTL ? [0, -slot * (count - 1)] : [0, slot * (count - 1)] });

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(insets.bottom - 6, 12), alignItems: "center" }}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width - 12)}
        style={{
          flexDirection: "row",
          width: "88%",
          maxWidth: 420,
          padding: 6,
          borderRadius: 32,
          backgroundColor: p.surface,
          borderWidth: 1,
          borderColor: p.line,
          shadowColor: "#000",
          shadowOpacity: 0.45,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }}
      >
        {width > 0 && (
          <Animated.View
            style={{
              position: "absolute",
              top: 6,
              bottom: 6,
              start: 6,
              width: slot,
              borderRadius: 26,
              backgroundColor: p.raised,
              transform: [{ translateX }],
            }}
          />
        )}
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const { options } = descriptors[route.key];
          const label = typeof options.title === "string" ? options.title : route.name;
          const icon = ICONS[route.name] ?? ["ellipse-outline", "ellipse"];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  void Haptics.selectionAsync();
                  navigateToTab(route.key);
                }
              }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, gap: 3 }}
            >
              <Ionicons name={icon[focused ? 1 : 0] as never} size={21} color={focused ? p.text : p.faint} />
              <Text numberOfLines={1} style={{ fontSize: 10.5, ...fw("600"), color: focused ? p.text : p.faint }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
