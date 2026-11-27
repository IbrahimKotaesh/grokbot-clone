import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useWorkspace } from "../lib/store";
import { Avatar, IconButton } from "../components/UI";
import { FadeIn, TypingDots, useLoop, useRipple } from "../components/motion";
import { palette as p, type, space, accentFor, fw } from "../theme";
import { startVoiceCall, type CallPhase, type VoiceCall } from "../lib/voice-call";
import { t } from "../lib/i18n";

export function CallScreen({ done }: { done: () => void }) {
  const bot = useWorkspace((x) => x.bots.find((b) => b.id === x.selected));
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<CallPhase>("connecting"),
    [detail, setDetail] = useState<string | undefined>(),
    [muted, setMuted] = useState(false),
    [speaker, setSpeaker] = useState(true),
    [seconds, setSeconds] = useState(0),
    [caption, setCaption] = useState("");
  const call = useRef<VoiceCall | null>(null);
  const level = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!bot) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    call.current = startVoiceCall(bot.id, {
      onPhase: (next, d) => {
        setPhase(next);
        setDetail(d);
        if (next === "unavailable" || next === "error") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      },
      onLevel: (l) => Animated.timing(level, { toValue: l, duration: 80, useNativeDriver: true }).start(),
      onCaption: (t) => setCaption(t),
    });
    return () => call.current?.end();
  }, [bot?.id]);
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  const active = phase === "connecting" || phase === "live";
  const breathe = useLoop(phase === "live" ? 2200 : 1600, active);
  const r1 = useRipple(2600, 0, active),
    r2 = useRipple(2600, 860, active),
    r3 = useRipple(2600, 1720, active);
  if (!bot) return null;
  const accent = accentFor(bot.avatarColor);
  const hangUp = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    call.current?.end();
    done();
  };
  const statusText =
    phase === "connecting"
      ? t("Connecting…")
      : phase === "live"
        ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
        : phase === "unavailable"
          ? t("Voice calls aren't connected yet")
          : phase === "error"
            ? t("Call failed")
            : t("Call ended");
  const orb = 148;
  return (
    <View style={{ flex: 1, backgroundColor: p.background, paddingTop: insets.top, paddingBottom: insets.bottom + space.lg }}>
      {/* soft accent glow behind the orb */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          alignSelf: "center",
          top: "18%",
          width: 380,
          height: 380,
          borderRadius: 190,
          backgroundColor: accent,
          opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.07, 0.13] }),
          transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.05] }) }],
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, minHeight: 52 }}>
        <IconButton name="chevron-down" label={t("Minimize call")} onPress={done} />
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingRight: space.md }}>
          <Ionicons name="lock-closed" size={11} color={p.faint} />
          <Text style={[type.caption, { color: p.faint, ...fw("500") }]}>{t("Private call")}</Text>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.xxl }}>
        <View style={{ width: orb * 2.2, height: orb * 2.2, alignItems: "center", justifyContent: "center" }}>
          {[r1, r2, r3].map((r, i) => (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={{
                position: "absolute",
                width: orb,
                height: orb,
                borderRadius: orb / 2,
                borderWidth: 1.5,
                borderColor: accent,
                opacity: r.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] }),
                transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
              }}
            />
          ))}
          <Animated.View
            style={{
              width: orb,
              height: orb,
              borderRadius: orb / 2,
              backgroundColor: p.surface,
              borderWidth: 1,
              borderColor: p.lineStrong,
              alignItems: "center",
              justifyContent: "center",
              opacity: phase === "unavailable" || phase === "ended" ? 0.7 : 1,
              transform: [
                {
                  scale: Animated.add(
                    breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }),
                    level.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }),
                  ),
                },
              ],
            }}
          >
            <Avatar shape={bot.avatarShape} size={orb - 28} color={bot.avatarColor} />
          </Animated.View>
        </View>
        <View style={{ alignItems: "center", gap: space.sm, paddingHorizontal: space.xxl }}>
          <Text style={[type.largeTitle, { color: p.text }]}>{bot.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {phase === "connecting" && <TypingDots color={p.muted} size={5} />}
            <Text style={[type.callout, { color: phase === "unavailable" ? p.amber : p.muted, fontVariant: ["tabular-nums"] }]}>{statusText}</Text>
          </View>
          {!!detail && (
            <FadeIn>
              <Text style={[type.footnote, { color: p.faint, textAlign: "center", maxWidth: 290, marginTop: 4 }]}>{detail}</Text>
            </FadeIn>
          )}
          {!!caption && phase === "live" && (
            <Text style={[type.body, { color: p.text, textAlign: "center", marginTop: space.md }]} numberOfLines={3}>
              {caption}
            </Text>
          )}
        </View>
      </View>

      <FadeIn delay={120} style={{ flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-start", paddingHorizontal: space.lg }}>
        <Control
          icon={muted ? "mic-off" : "mic-outline"}
          label={muted ? t("Unmute") : t("Mute")}
          on={muted}
          disabled={phase !== "live"}
          onPress={() => {
            setMuted(!muted);
            call.current?.setMuted(!muted);
          }}
        />
        <Control
          icon={speaker ? "volume-high" : "volume-medium-outline"}
          label={t("Speaker")}
          on={speaker}
          disabled={phase !== "live"}
          onPress={() => {
            setSpeaker(!speaker);
            call.current?.setSpeaker(!speaker);
          }}
        />
        <Control icon="chatbubble-outline" label={t("Chat")} onPress={done} />
        <EndButton onPress={hangUp} />
      </FadeIn>
    </View>
  );
}

function Control({
  icon,
  label,
  onPress,
  on = false,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  on?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={{ alignItems: "center", gap: space.sm, opacity: disabled ? 0.4 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on, disabled }}
        disabled={disabled}
        onPress={() => {
          void Haptics.selectionAsync();
          onPress();
        }}
        style={({ pressed }) => ({
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: on ? p.primary : pressed ? p.elevated : p.raised,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: pressed ? 0.93 : 1 }],
        })}
      >
        <Ionicons name={icon} size={26} color={on ? p.onPrimary : p.text} />
      </Pressable>
      <Text style={[type.caption, { color: p.muted, ...fw("500") }]}>{label}</Text>
    </View>
  );
}

function EndButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 180 }).start();
  }, []);
  return (
    <View style={{ alignItems: "center", gap: space.sm }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("End call")}
          onPress={onPress}
          style={({ pressed }) => ({
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: p.red,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ scale: pressed ? 0.93 : 1 }, { rotate: "135deg" }],
          })}
        >
          <Ionicons name="call" size={26} color="#fff" />
        </Pressable>
      </Animated.View>
      <Text style={[type.caption, { color: p.muted, ...fw("500") }]}>{t("End")}</Text>
    </View>
  );
}

