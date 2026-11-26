// Fino on the web and the Mac app speaks the same languages as the phone app.
// English text is the key, so a missing translation simply shows the English.
// Shared dictionaries live in packages/contracts/src (ar.ts, nl.ts); web-only words in ar-web.ts / nl-web.ts.
// English is the main language; Arabic and Dutch are supporting languages.
import { ar as phone } from '../../../packages/contracts/src/ar';
import { nl as phoneNl } from '../../../packages/contracts/src/nl';
import { arWeb } from './ar-web';
import { nlWeb } from './nl-web';
import { deviceTimeZone, languageForPlace } from '../../../packages/contracts/src/place';

export type LangChoice = 'system' | 'en' | 'ar' | 'nl';
const KEY = 'fino.lang';

export function langChoice(): LangChoice {
  // Outside a browser (tests, tools) there is no visitor to place: plain English.
  if (typeof localStorage === 'undefined') return 'en';
  try {
    const v = localStorage.getItem(KEY);
    // Nothing saved yet means "Automatic": the language follows where the visitor is.
    return v === 'ar' || v === 'nl' || v === 'en' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Saves the choice and reloads, so every screen redraws in the new language and direction. */
export function setLangChoice(v: LangChoice) {
  try { localStorage.setItem(KEY, v); } catch { /* private window: keep the current language */ }
  location.reload();
}

const browserLang = () => (typeof navigator !== 'undefined' ? navigator.languages?.[0] ?? navigator.language ?? 'en' : 'en');
const choice = langChoice();
// "Automatic" (the default) picks by place: the Netherlands → Dutch, the Arab world → Arabic, elsewhere English.
// A language picked on the landing page or in Settings > General always wins.
export const lang: 'ar' | 'en' | 'nl' = choice === 'system' ? languageForPlace(deviceTimeZone(), browserLang()) : choice;
export const isArabic = lang === 'ar';
/** The locale for dates and times in the chosen language. */
export const locale = lang === 'ar' ? 'ar' : lang === 'nl' ? 'nl-NL' : 'en-GB';
const dict: Record<string, string> = isArabic ? { ...phone, ...arWeb } : lang === 'nl' ? { ...phoneNl, ...nlWeb } : {};

// In Arabic the layout stays exactly like English (left to right): menus, sidebar, bubbles and buttons don't move.
// Only Arabic text itself runs right to left (see the :lang(ar) rule in styles/polish.css).
if (typeof document !== 'undefined') {
  document.documentElement.lang = lang;
  document.documentElement.dir = 'ltr';
}

/** Translate an English UI string. `{name}` placeholders are filled from `vars`. */
// The product is called Badr in every language (بدر in Arabic); older source strings still say "Fino".
const BRAND = isArabic ? 'بدر' : 'Badr';
export function t(text: string, vars?: Record<string, string | number>) {
  let out = (dict[text] ?? text).replace(/\bFino\b/g, BRAND);
  if (vars) for (const k in vars) out = out.split(`{${k}}`).join(String(vars[k]));
  return out;
}

// Arabic plural forms: [one, two, 3–10, 11+].
const arPlural: Record<string, [string, string, string, string]> = {
  '{n} step': ['خطوة واحدة', 'خطوتان', '{n} خطوات', '{n} خطوة'],
};
/** Singular/plural pick: plural(3, "{n} step", "{n} steps"). Arabic has its own forms. */
export function plural(count: number, one: string, many: string) {
  const forms = isArabic ? arPlural[one] : undefined;
  if (forms) return (count === 1 ? forms[0] : count === 2 ? forms[1] : count <= 10 ? forms[2] : forms[3]).split('{n}').join(String(count));
  return t(count === 1 ? one : many, { n: count });
}
