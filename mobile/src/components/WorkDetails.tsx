import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Row, Bot } from "../../../packages/contracts/src/types";
import { MessageRow } from "./MessageRow";
import { FadeIn, TypingDots } from "./motion";
import { palette as p, type, space, radius } from "../theme";
import { t, n } from "../lib/i18n";
export function WorkDetails({ rows, bot }: { rows: Row[]; bot: Bot }) {
  const [open, setOpen] = useState(false);
  const failed = rows.some((r) => r.body.type === "tool-call" && ["error", "denied"].includes(r.body.status));
  const waiting = rows.some((r) => r.body.type === "tool-call" && r.body.status === "awaiting-approval");
  const running = rows.some((r) => r.body.type === "tool-call" && r.body.status === "running");
  // A clean chat: work that finished fine leaves no trace; only live, waiting or failed work shows.
  if (!failed && !waiting && !running) return null;
  const title = failed ? t("Some steps need attention") : waiting ? t("Waiting for your permission") : running ? t("Working") : t("Completed {n}", { n: n(rows.length, "{n} step", "{n} steps") });
  return (
    <View style={{ marginHorizontal: space.lg, marginVertical: space.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: space.sm,
          minHeight: 34,
          paddingHorizontal: space.md,
          borderRadius: radius.full,
          backgroundColor: pressed ? p.raised : p.surface,
          borderWidth: 1,
          borderColor: p.line,
        })}
      >
        {running ? (
          <TypingDots color={p.muted} size={4} />
        ) : (
          <Ionicons name={failed ? "alert-circle" : waiting ? "hand-left-outline" : "checkmark-done"} color={failed ? p.red : waiting ? p.amber : p.muted} size={15} />
        )}
        <Text style={[type.footnote, { color: failed ? p.red : p.muted }]}>{title}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} color={p.faint} size={13} />
      </Pressable>
      {open && (
        <FadeIn offset={4} duration={220} style={{ marginTop: space.xs, marginLeft: space.sm, borderLeftWidth: 1, borderLeftColor: p.line }}>
          {rows.map((row) => (
            <MessageRow key={`${row.generation}:${row.seq}`} row={row} bot={bot} />
          ))}
        </FadeIn>
      )}
    </View>
  );
}
