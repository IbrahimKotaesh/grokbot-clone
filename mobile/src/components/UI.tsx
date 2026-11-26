import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
  TextInput,
  Animated,
  KeyboardAvoidingView,
  Platform,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { SvgXml } from "react-native-svg";
import { characterSvg } from "../../../packages/contracts/src/characters";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { palette as p, fruitColor, fruitFor, type, space, radius, accentFor, onThemeChange } from "../theme";
import { PressableScale, useLoop } from "./motion";
import { mirror } from "../lib/i18n";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function Avatar({
  shape,
  size = 48,
  primary = false,
  status,
  color,
}: {
  shape: string;
  size?: number;
  primary?: boolean;
  /** working = breathing green dot, attention = amber, unread = accent. */
  status?: "working" | "attention" | "unread" | null;
  color?: string;
}) {
  const pulse = useLoop(1600, status === "working");
  const kind = fruitFor(shape);
  const xml = React.useMemo(() => characterSvg(kind, color ?? fruitColor[kind], false), [kind, color]);
  const dot = Math.max(10, size * 0.22);
  return (
    <View style={{ width: size, height: size }}>
      {/* The character itself wears the bot's color, so there is no tinted circle behind it. */}
      <SvgXml xml={xml} width={size} height={size} />
      {!!status && (
        <Animated.View
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: dot,
            height: dot,
            borderRadius: dot,
            borderWidth: 2.5,
            borderColor: p.background,
            backgroundColor:
              status === "working" ? p.green : status === "attention" ? p.amber : accentFor(color),
            opacity: status === "working" ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) : 1,
          }}
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
  variant = "ghost",
  size = 44,
  iconSize,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  variant?: "ghost" | "filled" | "primary" | "danger";
  size?: number;
  iconSize?: number;
}) {
  const bg =
    variant === "filled" ? p.raised : variant === "primary" ? p.primary : variant === "danger" ? p.red : "transparent";
  const fg = variant === "primary" ? p.onPrimary : variant === "danger" ? "#fff" : color;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled}
      hitSlop={6}
      scaleTo={0.9}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Ionicons name={name} size={iconSize ?? Math.round(size * 0.5)} color={fg} style={mirror(name)} />
    </PressableScale>
  );
}

export function Button({
  title,
  onPress,
  busy = false,
  secondary = false,
  variant,
  disabled = false,
  icon,
  compact = false,
  style,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  /** Kept for older call sites; same as variant="secondary". */
  secondary?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  icon?: IconName;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = variant ?? (secondary ? "secondary" : "primary");
  const bg = { primary: p.primary, secondary: p.raised, ghost: "transparent", danger: p.redSoft }[v];
  const fg = { primary: p.onPrimary, secondary: p.text, ghost: p.text, danger: p.red }[v];
  const off = disabled || busy;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[
        styles.button,
        compact && { minHeight: 38, paddingHorizontal: space.lg, paddingVertical: 8 },
        { backgroundColor: bg },
        disabled && !busy && { backgroundColor: v === "primary" ? p.raised : bg },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row8}>
          {icon && <Ionicons name={icon} size={compact ? 16 : 18} color={disabled ? p.faint : fg} style={mirror(icon)} />}
          <Text style={[styles.buttonText, compact && { fontSize: 15 }, { color: disabled ? p.faint : fg }]}>{title}</Text>
        </View>
      )}
    </PressableScale>
  );
}

/** Screen header. "large" for tab roots, "nav" for pushed screens. */
export function Header({
  title,
  subtitle,
  left,
  right,
  large = true,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  large?: boolean;
}) {
  if (!large)
    return (
      <View style={styles.navHeader}>
        <View style={{ width: 88, flexDirection: "row" }}>{left}</View>
        <Text style={[type.headline, { color: p.text, flex: 1, textAlign: "center" }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 88, flexDirection: "row", justifyContent: "flex-end" }}>{right}</View>
      </View>
    );
  return (
    <View style={styles.largeHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.largeTitle, { color: p.text }]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && <Text style={[type.subhead, { color: p.muted }]}>{subtitle}</Text>}
      </View>
      {right && <View style={{ flexDirection: "row", gap: space.xs }}>{right}</View>}
    </View>
  );
}

/** Small uppercase label above a group. */
export function SectionLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View style={[styles.rowBetween, { paddingHorizontal: space.xs, marginTop: space.lg, marginBottom: space.sm }]}>
      <Text style={[type.caption, { color: p.muted, textTransform: "uppercase" }]}>{children}</Text>
      {action}
    </View>
  );
}

/** Rounded container that groups ListRows with hairline separators. */
export function Group({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, style]}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 && <View style={styles.separator} />}
          {child}
        </View>
      ))}
    </View>
  );
}

export function ListRow({
  icon,
  iconColor = p.text,
  leading,
  title,
  subtitle,
  value,
  onPress,
  chevron = !!onPress,
  destructive = false,
  trailing,
}: {
  icon?: IconName;
  iconColor?: string;
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  trailing?: React.ReactNode;
}) {
  const body = (
    <View style={styles.listRow}>
      {leading}
      {icon && (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={18} color={destructive ? p.red : iconColor} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: destructive ? p.red : p.text }]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={[type.footnote, { color: p.muted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!value && <Text style={[type.callout, { color: p.muted }]}>{value}</Text>}
      {trailing}
      {chevron && <Ionicons name="chevron-forward" size={16} color={p.faint} style={mirror("chevron-forward")} />}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => pressed && { backgroundColor: p.elevated }}
    >
      {body}
    </Pressable>
  );
}

export function TextField({ label, style, ...props }: TextInputProps & { label?: string }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ gap: space.sm }}>
      {!!label && <Text style={[type.caption, { color: p.muted, textTransform: "uppercase", paddingHorizontal: space.xs }]}>{label}</Text>}
      <TextInput
        placeholderTextColor={p.faint}
        selectionColor={p.text}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.input, focused && { borderColor: p.lineStrong, backgroundColor: p.elevated }, style]}
      />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 56, paddingHorizontal: space.xxl, gap: space.md }}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={p.muted} />
      </View>
      <Text style={[type.headline, { color: p.text, textAlign: "center" }]}>{title}</Text>
      {!!detail && <Text style={[type.subhead, { color: p.muted, textAlign: "center", maxWidth: 280 }]}>{detail}</Text>}
      {action && <View style={{ marginTop: space.sm }}>{action}</View>}
    </View>
  );
}

export function Chip({
  label,
  icon,
  onPress,
  selected = false,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      haptic
      style={[styles.chip, selected && { backgroundColor: p.primary, borderColor: p.primary }]}
    >
      {icon && <Ionicons name={icon} size={15} color={selected ? p.onPrimary : p.muted} />}
      <Text style={[type.subhead, { color: selected ? p.onPrimary : p.text }]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * KeyboardAvoidingView that knows where it sits on screen. The stock one measures its frame relative
 * to its parent, so under the root safe-area padding (or inside a modal sheet) it lifts too little and
 * the keyboard covers the bottom of the screen.
 */
export function KeyboardScreen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = React.useRef<React.ComponentRef<typeof View>>(null);
  const [offset, setOffset] = React.useState(0);
  return (
    <View ref={ref} style={[styles.screen, style]} onLayout={() => ref.current?.measureInWindow((_x: number, y: number) => setOffset(y))}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={offset}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <View accessibilityRole="alert" style={styles.errorBox}>
      <Ionicons name="alert-circle" size={16} color={p.red} />
      <Text style={[type.footnote, { color: p.red, flex: 1 }]}>{error}</Text>
    </View>
  ) : null;
}

const makeStyles = () => StyleSheet.create({
  icon: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  pressed: { opacity: 0.7 },
  badge: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: p.background,
  },
  button: {
    backgroundColor: p.primary,
    minHeight: 50,
    paddingHorizontal: space.xl,
    paddingVertical: 13,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: p.onPrimary, fontSize: 16, fontWeight: "600", letterSpacing: -0.1 },
  error: { color: p.red, fontSize: 14, lineHeight: 20, padding: 12 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: p.redSoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  screen: { flex: 1, backgroundColor: p.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    minHeight: 56,
  },
  largeHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.md,
    minHeight: 64,
  },
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    minHeight: 52,
  },
  title: { ...type.title, color: p.text },
  text: { ...type.body, color: p.text },
  muted: { ...type.subhead, color: p.muted },
  input: {
    backgroundColor: p.raised,
    color: p.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 50,
  },
  section: { paddingHorizontal: space.xl, paddingVertical: space.lg, gap: space.md },
  label: { ...type.caption, color: p.muted, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  row8: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  card: { backgroundColor: p.surface, padding: space.lg, borderRadius: radius.lg, gap: space.sm, borderWidth: 1, borderColor: p.line },
  group: { backgroundColor: p.surface, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: p.line },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: p.lineStrong, marginLeft: space.lg },
  listRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 54, paddingVertical: space.md },
  rowIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: p.raised, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: p.raised, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.line,
  },
});
export const styles = makeStyles();
onThemeChange(() => Object.assign(styles, makeStyles()));

export function ProviderMark({ provider, size = 22 }: { provider: string; size?: number }) {
  return (
    <Image
      source={provider === "claude" ? require("../../assets/claude.svg") : require("../../assets/chatgpt.svg")}
      style={{ width: size, height: size }}
      tintColor={provider === "claude" ? "#df9c78" : p.text}
      contentFit="contain"
    />
  );
}

/** The logo of the company behind a model id like "deepseek/deepseek-v4.1-flash". */
const MODEL_LOGOS: { prefix: string; source: number; tint?: string }[] = [
  // Fino's included models (Badr 1, 2, 3) carry Badr's face.
  { prefix: "deepseek/", source: require("../../assets/models/bart.png") },
  { prefix: "z-ai/", source: require("../../assets/models/bart.png") },
  { prefix: "qwen/", source: require("../../assets/models/bart.png") },
  { prefix: "x-ai/", source: require("../../assets/models/grok.svg"), tint: p.text },
  { prefix: "openai/", source: require("../../assets/chatgpt.svg"), tint: p.text },
  { prefix: "anthropic/", source: require("../../assets/claude.svg"), tint: "#df9c78" },
];
export function ModelMark({ model, size = 20, dim = false }: { model: string; size?: number; dim?: boolean }) {
  const logo = MODEL_LOGOS.find((l) => model.startsWith(l.prefix));
  if (!logo) return <Ionicons name="sparkles" size={size - 4} color={dim ? p.faint : "#a78bfa"} />;
  return <Image source={logo.source} style={{ width: size, height: size, opacity: dim ? 0.4 : 1 }} tintColor={logo.tint} contentFit="contain" />;
}

/** Small lock that sits on a feature the current plan doesn't include. */
export function LockBadge() {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", right: 2, bottom: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: p.amber, borderWidth: 2, borderColor: p.background, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name="lock-closed" size={9} color="#000" />
    </View>
  );
}
