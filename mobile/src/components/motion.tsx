// Small motion kit on React Native's Animated API (native driver, no extra native module).
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
  AccessibilityInfo,
} from "react-native";
import * as Haptics from "expo-haptics";
import { motion } from "../theme";

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduceMotion = v));
AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => (reduceMotion = v));

/** Fades and lifts its children into place once, on mount. */
export function FadeIn({
  children,
  delay = 0,
  offset = 10,
  duration = motion.slow,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  offset?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Pressable that springs down slightly while held. */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  haptic = false,
  onPress,
  ...rest
}: PressableProps & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number) =>
    Animated.spring(scale, { toValue: value, useNativeDriver: true, ...motion.spring }).start();
  // Layout props belong on the outer Pressable so `flex: 1` etc. behave as expected.
  const { flex, flexGrow, flexShrink, flexBasis, alignSelf, width, margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical, position, top, left, right, bottom, zIndex, ...inner } =
    StyleSheet.flatten(style) ?? {};
  const outer = { flex, flexGrow, flexShrink, flexBasis, alignSelf, width, margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical, position, top, left, right, bottom, zIndex };
  const grows = flex !== undefined || flexGrow !== undefined;
  return (
    <Pressable
      {...rest}
      style={outer}
      onPress={(e) => {
        if (haptic) void Haptics.selectionAsync();
        onPress?.(e);
      }}
      onPressIn={(e) => {
        to(scaleTo);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        rest.onPressOut?.(e);
      }}
    >
      {({ pressed }) => (
        <Animated.View style={[inner, grows && { flexGrow: 1 }, { transform: [{ scale }], opacity: pressed ? 0.85 : 1 }]}>
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}

/** A looping 0→1→0 value, for breathing dots, rings and orbs. */
export function useLoop(duration = 1400, active = true) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduceMotion) {
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, duration]);
  return v;
}

/** A value that runs 0→1 repeatedly (for expanding ripples). */
export function useRipple(duration = 2400, delay = 0, active = true) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduceMotion) {
      // Let a ring that was mid-flight finish fading instead of freezing on screen.
      Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active]);
  return v;
}

/** Three dots that bounce in turn — the "thinking" indicator. */
export function TypingDots({ color, size = 7 }: { color: string; size?: number }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.loop(
      Animated.stagger(
        160,
        dots.map((d) =>
          Animated.sequence([
            Animated.timing(d, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(d, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.delay(240),
          ]),
        ),
      ),
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View style={{ flexDirection: "row", gap: size * 0.7, alignItems: "center", height: size * 3 }}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: color,
            opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.6] }) }],
          }}
        />
      ))}
    </Animated.View>
  );
}
