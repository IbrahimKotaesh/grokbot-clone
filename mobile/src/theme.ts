// Fino design tokens. Near-black canvas, neutral greys, white primary actions.
// Every screen reads colour, type, spacing and motion from here — no ad-hoc values.

import { Appearance } from "react-native";
import * as SecureStore from "expo-secure-store";

const dark = {
  background: "#000000",
  surface: "#0f0f10", // cards, grouped lists
  raised: "#1b1b1d", // inputs, user bubble, chips
  elevated: "#262629", // pressed state, menus
  line: "#232326",
  lineStrong: "#323236",
  text: "#f5f5f7",
  muted: "#8e8e93",
  faint: "#5c5c61",
  onPrimary: "#000000",
  primary: "#f5f5f7",
  blue: "#7aa7ff", // links and the occasional accent only
  red: "#ff5c5c",
  redSoft: "#ff5c5c1f",
  green: "#3ddc97",
  amber: "#ffc04d",
  scrim: "#000000b3",
};

const light: typeof dark = {
  background: "#f7f7f5",
  surface: "#ffffff",
  raised: "#ececea",
  elevated: "#e2e2df",
  line: "#e2e2de",
  lineStrong: "#cfcfca",
  text: "#141416",
  muted: "#6b6b70",
  faint: "#a3a3a8",
  onPrimary: "#ffffff",
  primary: "#141416",
  blue: "#2f6fe0",
  red: "#e5484d",
  redSoft: "#e5484d1f",
  green: "#1f9d6a",
  amber: "#d99a00",
  scrim: "#00000066",
};

/** Light, dark, or follow the phone. Saved on the device; applied live without a restart. */
export type ThemeChoice = "system" | "light" | "dark";
const KEY = "fino.theme";
function readChoice(): ThemeChoice {
  try {
    const v = SecureStore.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
const resolve = (c: ThemeChoice): "light" | "dark" => (c === "system" ? (Appearance.getColorScheme() === "light" ? "light" : "dark") : c);
export let themeChoice: ThemeChoice = readChoice();
export let scheme = resolve(themeChoice);
if (themeChoice !== "system") Appearance.setColorScheme(themeChoice);

// One shared object: screens read palette.x while rendering, so swapping its values and
// re-rendering the app is enough to change the whole look.
export const palette = { ...(scheme === "light" ? light : dark) };

const listeners = new Set<() => void>();
export function onThemeChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
function apply() {
  const next = resolve(themeChoice);
  if (next === scheme && palette.background === (next === "light" ? light : dark).background) return;
  scheme = next;
  Object.assign(palette, scheme === "light" ? light : dark);
  listeners.forEach((fn) => fn());
}
export function setThemeChoice(choice: ThemeChoice) {
  themeChoice = choice;
  try {
    SecureStore.setItem(KEY, choice);
  } catch {}
  Appearance.setColorScheme(choice === "system" ? "unspecified" : choice);
  apply();
}
// Following the phone: react when it switches between light and dark.
Appearance.addChangeListener(() => {
  if (themeChoice === "system") apply();
});

export const type = {
  largeTitle: { fontSize: 32, lineHeight: 38, fontWeight: "700", letterSpacing: -0.6 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: "400" },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  subhead: { fontSize: 14, lineHeight: 19, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 0.2 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, full: 999 } as const;
export const motion = {
  fast: 140,
  base: 220,
  slow: 360,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
} as const;

// Per-bot accent, used sparingly (status ring, call orb glow).
export const chatColors: Record<string, string> = {
  black: "#8e9bb0",
  brown: "#c08a5a",
  red: "#ff6b6b",
  orange: "#ff9f43",
  yellow: "#f5c84c",
  green: "#3ddc97",
  cyan: "#3cc8e0",
  blue: "#5b9bff",
  violet: "#a78bfa",
  magenta: "#f472b6",
  gray: "#a1a1aa",
};
export type Fruit = "watermelon" | "orange" | "olive" | "fig";
export const fruits: Fruit[] = ["watermelon", "orange", "olive", "fig"];
export const fruitColor = {
  watermelon: "red",
  orange: "orange",
  olive: "green",
  fig: "violet",
} as const;
export const fruitAssets = {
  watermelon: require("../assets/fruits/watermelon.webp"),
  orange: require("../assets/fruits/orange.webp"),
  olive: require("../assets/fruits/olive.webp"),
  fig: require("../assets/fruits/fig.webp"),
};
export function fruitFor(shape: string): Fruit {
  if (fruits.includes(shape as Fruit)) return shape as Fruit;
  if (
    ["arch", "tablet", "capsule", "cylinder", "bean", "teardrop"].includes(
      shape,
    )
  )
    return "orange";
  if (["ghost", "cloud", "dome", "flower", "star", "sparkle"].includes(shape))
    return "olive";
  if (["dino", "leaf", "clover", "house", "shield"].includes(shape))
    return "fig";
  return "watermelon";
}
export const accentFor = (color?: string) =>
  chatColors[color ?? ""] ?? chatColors.blue;
