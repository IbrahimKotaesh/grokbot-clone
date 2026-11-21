import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { palette as p, fruitAssets, fruitFor } from "../theme";
export function Avatar({
  shape,
  size = 48,
  primary = false,
}: {
  shape: string;
  size?: number;
  primary?: boolean;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={fruitAssets[fruitFor(shape)]}
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={120}
      />
      {primary && (
        <Ionicons
          name="star"
          size={14}
          color="#ffd56d"
          style={{ position: "absolute", top: -3, right: 0 }}
        />
      )}
    </View>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
  color = p.text,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.icon,
        pressed && styles.pressed,
        disabled && { opacity: 0.4 },
      ]}
    >
      <Ionicons name={name} size={23} color={color} />
    </Pressable>
  );
}
export function Button({
  title,
  onPress,
  busy = false,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && { backgroundColor: p.raised },
        pressed && styles.pressed,
        (disabled || busy) && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={p.text} />
      ) : (
        <Text style={[styles.buttonText, secondary && { color: p.text }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {error}
    </Text>
  ) : null;
}
export const styles = StyleSheet.create({
  icon: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  button: {
    backgroundColor: p.blue,
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#091d36", fontSize: 16, fontWeight: "600" },
  error: { color: "#ffaaaa", fontSize: 14, lineHeight: 21, padding: 12 },
  screen: { flex: 1, backgroundColor: p.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    minHeight: 62,
    borderBottomColor: p.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 25, fontWeight: "700", color: p.text },
  text: { color: p.text, fontSize: 16, lineHeight: 24 },
  muted: { color: p.muted, fontSize: 14, lineHeight: 21 },
  input: {
    backgroundColor: p.surface,
    color: p.text,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    minHeight: 50,
  },
  section: { padding: 20, gap: 16 },
  label: { fontSize: 14, fontWeight: "600", color: p.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  card: { backgroundColor: p.surface, padding: 16, borderRadius: 18, gap: 8 },
});

export function ProviderMark({
  provider,
  size = 22,
}: {
  provider: string;
  size?: number;
}) {
  return (
    <Image
      source={
        provider === "claude"
          ? require("../../assets/claude.svg")
          : require("../../assets/chatgpt.svg")
      }
      style={{ width: size, height: size }}
      tintColor={provider === "claude" ? "#df9c78" : p.text}
      contentFit="contain"
    />
  );
}
