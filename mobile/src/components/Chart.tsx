import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import Svg, {
  Line,
  Rect,
  Circle,
  Polyline,
  Text as SvgText,
  G,
} from "react-native-svg";
import { parseChart } from "../../../packages/client/src/chart";
import { palette as p, fw } from "../theme";
import { styles as s } from "./UI";
import { t } from "../lib/i18n";
const colors = [
  "#64a7ff",
  "#ff6c9f",
  "#ffad49",
  "#64d49a",
  "#bb99ff",
  "#ff7d71",
];
export function Chart({ raw }: { raw: string }) {
  const c = useMemo(() => parseChart(raw), [raw]),
    [selected, setSelected] = useState(""),
    [data, setData] = useState(false);
  if (!c) return <Text style={s.muted}>{t("The chart data is incomplete.")}</Text>;
  const values = c.series.flatMap((s) => s.values),
    low = Math.min(0, ...values),
    high = Math.max(0, ...values),
    range = high - low || 1,
    y = (v: number) => 210 - ((v - low) / range) * 170,
    x = (i: number) => 50 + ((i + 0.5) * 500) / c.labels.length,
    zero = y(0),
    total = c.series[0].values.reduce((a, b) => a + b, 0);
  const hit = (series: number, i: number) => () =>
    setSelected(
      `${c.labels[i]} · ${c.series[series].name}: ${c.series[series].values[i]} ${c.unit ?? ""}`,
    );
  return (
    <View style={{ gap: 14, paddingVertical: 8 }}>
      <Text style={[s.text, { ...fw("600") }]}>{c.title}</Text>
      {c.type === "pie" ? (
        <Svg width="100%" height={220} viewBox="0 0 280 220">
          {c.series[0].values.map((v, i) => {
            const length = (v / total) * 2 * Math.PI * 72,
              start =
                (c.series[0].values
                  .slice(0, i)
                  .reduce((sum, value) => sum + value, 0) /
                  total) *
                2 *
                Math.PI *
                72;
            return (
              <Circle
                key={i}
                cx={140}
                cy={110}
                r={72}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth={32}
                strokeDasharray={`${length} ${2 * Math.PI * 72 - length}`}
                strokeDashoffset={-start}
                rotation={-90}
                origin="140,110"
                onPress={hit(0, i)}
              />
            );
          })}
          <SvgText
            x={140}
            y={115}
            fill={p.text}
            fontSize={20}
            textAnchor="middle"
          >
            {total}
          </SvgText>
        </Svg>
      ) : (
        <Svg width="100%" height={220} viewBox="0 0 580 250">
          {Array.from({ length: 5 }, (_, i) => low + (range * i) / 4).map(
            (v, i) => (
              <G key={i}>
                <Line x1={50} x2={550} y1={y(v)} y2={y(v)} stroke={p.line} />
                <SvgText
                  x={42}
                  y={y(v) + 4}
                  fill={p.muted}
                  fontSize={12}
                  textAnchor="end"
                >
                  {Intl.NumberFormat(undefined, {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(v)}
                </SvgText>
              </G>
            ),
          )}
          {c.labels.map(
            (label, i) =>
              i % Math.ceil(c.labels.length / 5) === 0 && (
                <SvgText
                  key={i}
                  x={x(i)}
                  y={238}
                  textAnchor="middle"
                  fill={p.muted}
                  fontSize={12}
                >
                  {label.slice(0, 8)}
                </SvgText>
              ),
          )}
          {c.series.map((series, j) =>
            c.type === "line" ? (
              <G key={j}>
                <Polyline
                  points={series.values
                    .map((v, i) => `${x(i)},${y(v)}`)
                    .join(" ")}
                  stroke={colors[j]}
                  strokeWidth={3}
                  fill="none"
                />
                {series.values.map((v, i) => (
                  <Circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r={6}
                    fill={colors[j]}
                    onPress={hit(j, i)}
                  />
                ))}
              </G>
            ) : (
              <G key={j}>
                {series.values.map((v, i) => {
                  const w = ((500 / c.labels.length) * 0.7) / c.series.length;
                  return (
                    <Rect
                      key={i}
                      x={x(i) - (500 / c.labels.length) * 0.35 + j * w}
                      y={Math.min(zero, y(v))}
                      width={Math.max(1, w - 2)}
                      height={Math.max(1, Math.abs(zero - y(v)))}
                      rx={3}
                      fill={colors[j]}
                      onPress={hit(j, i)}
                    />
                  );
                })}
              </G>
            ),
          )}
        </Svg>
      )}
      <View style={[s.row, { flexWrap: "wrap" }]}>
        {(c.type === "pie" ? c.labels : c.series.map((s) => s.name)).map(
          (label, i) => (
            <Text
              key={i}
              style={[s.muted, { color: colors[i % colors.length] }]}
            >
              ● {label}
            </Text>
          ),
        )}
      </View>
      <Text accessibilityLiveRegion="polite" style={s.muted}>
        {selected || t("Tap a point to see its value")}
      </Text>
      <Pressable accessibilityRole="button" onPress={() => setData(!data)}>
        <Text style={{ color: p.blue }}>
          {data ? t("Hide data") : t("View data")}
        </Text>
      </Pressable>
      {data && (
        <ScrollView horizontal>
          <View>
            {c.labels.map((label, i) => (
              <View
                key={i}
                style={[
                  s.row,
                  {
                    paddingVertical: 8,
                    borderBottomWidth: 0.5,
                    borderColor: p.line,
                  },
                ]}
              >
                <Text style={[s.text, { width: 140 }]}>{label}</Text>
                {c.series.map((series, j) => (
                  <Text
                    key={j}
                    style={[s.text, { width: 110, textAlign: "right" }]}
                  >
                    {series.values[i]}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
