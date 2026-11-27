// The app follows the phone's language (iPhone Settings → Fino → Language also works), and where the phone is:
// the Netherlands → Dutch, the Arab world → Arabic, elsewhere English. See packages/contracts/src/place.ts.
// English text is the key, so a missing translation simply shows the English.
import { I18nManager } from "react-native";
import { ar } from "./ar";
import { nl } from "../../../packages/contracts/src/nl";
import { languageForPlace } from "../../../packages/contracts/src/place";

function phoneLanguage() {
  try {
    // Missing in app builds made before Arabic support; fall back to the JS engine's locale.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLocales } = require("expo-localization") as typeof import("expo-localization");
    return getLocales()[0]?.languageCode ?? "en";
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2);
  }
}
// The phone's language decides (iPhone Settings → Badr → Language changes it for this app only):
// Arabic → Arabic, Dutch → Dutch, anything else → English. Where the phone is never changes it.
const phoneLang = phoneLanguage().slice(0, 2).toLowerCase();
export const lang: "ar" | "en" | "nl" = languageForPlace(undefined, phoneLang);
export const isArabic = lang === "ar";
/** True when the layout runs right-to-left (mirror arrows and chevrons with this). */
// Arabic keeps the same layout as English (menus, tabs and bubbles don't move); only Arabic text runs right to left.
try {
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
} catch {}
export const isRTL = false;

/** Translate an English UI string. `{name}` placeholders are filled from `vars`. */
export function t(text: string, vars?: Record<string, string | number>) {
  let out = isArabic ? (ar[text] ?? text) : lang === "nl" ? (nl[text] ?? text) : text;
  if (vars) for (const k in vars) out = out.split(`{${k}}`).join(String(vars[k]));
  return out;
}

/** Singular/plural pick: n(3, "{n} bot", "{n} bots"). Arabic has its own forms. */
export function n(count: number, one: string, many: string) {
  if (isArabic) {
    const forms = arPlural[one];
    if (forms) {
      const f = count === 1 ? forms[0] : count === 2 ? forms[1] : count >= 3 && count <= 10 ? forms[2] : forms[3];
      return f.split("{n}").join(String(count));
    }
  }
  return t(count === 1 ? one : many, { n: count });
}

// [one, two, 3–10, 11+]
const arPlural: Record<string, [string, string, string, string]> = {
  "{n} bot": ["بوت واحد", "بوتان", "{n} بوتات", "{n} بوت"],
  "{n} message": ["رسالة واحدة", "رسالتان", "{n} رسائل", "{n} رسالة"],
  "{n} step": ["خطوة واحدة", "خطوتان", "{n} خطوات", "{n} خطوة"],
  "{n} skill ready": ["مهارة واحدة جاهزة", "مهارتان جاهزتان", "{n} مهارات جاهزة", "{n} مهارة جاهزة"],
  "{n} needs you": ["طلب واحد بانتظارك", "طلبان بانتظارك", "{n} طلبات بانتظارك", "{n} طلباً بانتظارك"],
};

/** Short relative time in the app's language. */
export function ago(minutes: number) {
  if (minutes < 1) return t("now");
  if (minutes < 60) return t("{n}m", { n: minutes });
  const h = Math.floor(minutes / 60);
  if (h < 24) return t("{n}h", { n: h });
  return t("{n}d", { n: Math.floor(h / 24) });
}

/** Arrows and chevrons point the reading direction: mirror them in right-to-left layouts. */
export function mirror(icon?: string) {
  return isRTL && icon && /^(chevron|arrow)-(back|forward)/.test(icon) ? { transform: [{ scaleX: -1 }] } : undefined;
}
