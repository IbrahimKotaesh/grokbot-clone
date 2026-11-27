import { CHARACTER_KINDS, characterKind, type CharacterKind } from "../../packages/contracts/src/characters";
// Badr design tokens, matched to the website.
// Every screen reads colour, type, spacing and motion from here — no ad-hoc values.

import { Appearance } from "react-native";
import { isArabic } from "./lib/i18n";
import * as SecureStore from "expo-secure-store";

// Badr's look, the same as the website (web/src/styles/phone-look.css): warm cream paper and dark-brown
// ink by day, cocoa grounds and cream ink by night, tomato for links, sticker edges on the main actions.
const dark = {
  background: "#15110e",
  surface: "#1e1915", // cards, grouped lists
  raised: "#28221d", // inputs, chips
  elevated: "#332b25", // pressed state, menus
  line: "#2d2620",
  lineStrong: "#43392f",
  text: "#ffffff",
  muted: "#cfc3b6",
  faint: "#85786b",
  onPrimary: "#15110e",
  primary: "#ffffff",
  blue: "#ff8a6b", // links and the occasional accent (Badr tomato)
  red: "#ff6e63",
  redSoft: "#ff6e631f",
  green: "#74d57d",
  amber: "#ffcf3a",
  scrim: "#000000b3",
  /** Sticker edge: the outline and hard shadow on the composer and main buttons. */
  edge: "#000000",
  /** The composer's outline (softer than the button edge at night, like the website). */
  composerEdge: "#43392f",
  sun: "#ffcf3a",
  onSun: "#211c17",
};

const light: typeof dark = {
  background: "#fff8ee",
  surface: "#ffffff",
  raised: "#f8ecdc",
  elevated: "#f1e1cd",
  line: "#eedfcc",
  lineStrong: "#dcc8b0",
  text: "#211c17",
  muted: "#6c6056",
  faint: "#9a8b7d",
  onPrimary: "#fff8ee",
  primary: "#211c17",
  blue: "#c13f22",
  red: "#d9342a",
  redSoft: "#d9342a1f",
  green: "#2f8a35",
  amber: "#c98a00",
  scrim: "#00000066",
  edge: "#211c17",
  composerEdge: "#211c17",
  sun: "#ffcf3a",
  onSun: "#211c17",
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

/** Nunito like the website (Tajawal for Arabic). Each weight is its own font file, loaded in app/_layout. */
type Weight = "400" | "500" | "600" | "700" | "800";
const FAMILY: Record<Weight, string> = isArabic
  ? { "400": "Tajawal_500Medium", "500": "Tajawal_500Medium", "600": "Tajawal_700Bold", "700": "Tajawal_700Bold", "800": "Tajawal_800ExtraBold" }
  : { "400": "Nunito_500Medium", "500": "Nunito_600SemiBold", "600": "Nunito_700Bold", "700": "Nunito_800ExtraBold", "800": "Nunito_900Black" };
/** The brand font at a weight: spread into a style, e.g. { ...fw("700"), fontSize: 18 }. */
export const fw = (weight: Weight = "400") => ({ fontFamily: FAMILY[weight] });
export const fontAssets = isArabic ? "tajawal" : "nunito";

export const type = {
  largeTitle: { fontSize: 32, lineHeight: 38, ...fw("800"), letterSpacing: -0.6 },
  title: { fontSize: 22, lineHeight: 28, ...fw("700"), letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, ...fw("700"), letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, ...fw("400") },
  callout: { fontSize: 15, lineHeight: 20, ...fw("400") },
  subhead: { fontSize: 14, lineHeight: 19, ...fw("400") },
  footnote: { fontSize: 13, lineHeight: 18, ...fw("400") },
  caption: { fontSize: 12, lineHeight: 16, ...fw("600"), letterSpacing: 0.2 },
} as const;

/** The website's sticker edge: an ink outline and a hard offset shadow (composer, primary buttons). */
export const sticker = () => ({
  borderWidth: 2,
  borderColor: palette.edge,
  shadowColor: palette.edge,
  shadowOffset: { width: 3, height: 3 },
  shadowOpacity: 1,
  shadowRadius: 0,
});

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
