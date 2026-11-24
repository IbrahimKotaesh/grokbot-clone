import { CHARACTER_KINDS, characterKind, type CharacterKind } from "../../packages/contracts/src/characters";
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
  background: "#faf9f5",
  surface: "#ffffff",
  raised: "#efede5",
  elevated: "#e6e3d9",
  line: "#e6e3d9",
  lineStrong: "#d3d0c4",
  text: "#1f1e1d",
  muted: "#6f6d66",
  faint: "#a6a39a",
  onPrimary: "#ffffff",
  primary: "#1f1e1d",
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
  brown: "#d77930",
  red: "#ff5d48",
  orange: "#ff8936",
  yellow: "#ffc829",
  green: "#5ace4e",
  cyan: "#11c2b0",
  blue: "#2b6eed",
  violet: "#a669fc",
  magenta: "#ff639c",
  gray: "#a3a5ae",
};
// Bot characters (accountant, chef, medic…) drawn in packages/contracts/src/characters.ts and painted
// in the bot's color. The old "fruit" names stay as aliases so screens and saved bots keep working.
export type Fruit = CharacterKind;
export const fruits: Fruit[] = CHARACTER_KINDS;
/** Starting color for each character when a bot is created without one. */
export const fruitColor: Record<Fruit, string> = {
  accountant: "cyan",
  chef: "blue",
  medic: "red",
  architect: "violet",
  engineer: "yellow",
  florist: "magenta",
};
export const fruitFor = (shape: string): Fruit => characterKind(shape);
export const accentFor = (color?: string) =>
  chatColors[color ?? ""] ?? chatColors.blue;
