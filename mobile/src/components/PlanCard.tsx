// The bot's live checklist for a multi-step request: finished steps get a green check, the current
// step spins and shows what the bot is doing right now, the rest wait in grey.
import React, { useEffect, useRef } from "react";
import { Animated, Easing, LayoutAnimation, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Bot, PlanBody } from "../../../packages/contracts/src/types";
import { useWorkspace } from "../lib/store";
import { statusLine } from "../lib/format";
import { palette as p, type, space, radius, fw } from "../theme";
import { t } from "../lib/i18n";

function Spinner() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View
      style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: p.line, borderTopColor: p.text, transform: [{ rotate }] }}
    />
  );
}

/** A check that pops in when a step finishes. */
function Check() {
  const pop = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start();
  }, [pop]);
  return (
    <Animated.View style={{ transform: [{ scale: pop }] }}>
      <Ionicons name="checkmark-circle" size={19} color={p.green} />
    </Animated.View>
  );
}

export function PlanCard({ body, bot }: { body: PlanBody; bot: Bot }) {
  const live = useWorkspace((x) => x.live[bot.id]);
  const running = !!live?.isRunning;
  const done = body.steps.filter((s) => s.status === "done").length;
  const key = body.steps.map((s) => s.status).join();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.create(220, "easeInEaseOut", "opacity"));
  }, [key]);

  return (
    <View style={{ paddingHorizontal: space.lg, paddingVertical: space.xs }}>
      <View style={{ backgroundColor: p.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: p.line, padding: space.md, gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
          <Text style={[type.footnote, { color: p.muted, ...fw("600"), flex: 1 }]} numberOfLines={1}>
            {body.title || t("Plan")}
          </Text>
          <Text style={[type.caption, { color: p.faint }]}>{t("{done} of {total}", { done, total: body.steps.length })}</Text>
        </View>
        {body.steps.map((step, i) => {
          const current = step.status === "in_progress";
          return (
            <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
              <View style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
                {step.status === "done" ? (
                  <Check />
                ) : current && running ? (
                  <Spinner />
                ) : (
                  <Ionicons name={current ? "ellipse" : "ellipse-outline"} size={current ? 10 : 15} color={current ? p.text : p.faint} />
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={[
                    type.callout,
                    {
                      color: step.status === "done" ? p.muted : current ? p.text : p.faint,
                      ...fw(current ? "600" : "400"),
                    },
                  ]}
                >
                  {step.text}
                </Text>
                {current && running && (
                  <Text style={[type.caption, { color: p.faint }]} numberOfLines={1}>
                    {statusLine(bot, live)}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
