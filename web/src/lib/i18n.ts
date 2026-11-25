// Fino on the web and the Mac app speaks the same languages as the phone app.
// English text is the key, so a missing translation simply shows the English.
// Shared dictionaries live in packages/contracts/src (ar.ts, nl.ts); web-only words in ar-web.ts / nl-web.ts.
// English is the main language; Arabic and Dutch are supporting languages.
import { ar as phone } from '../../../packages/contracts/src/ar';
import { nl as phoneNl } from '../../../packages/contracts/src/nl';
import { arWeb } from './ar-web';
import { nlWeb } from './nl-web';

export type LangChoice = 'system' | 'en' | 'ar' | 'nl';
const KEY = 'fino.lang';

export function langChoice(): LangChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'ar' || v === 'nl' || v === 'system' ? v : 'en';
  } catch {
    return 'en';
  }
}

/** Saves the choice and reloads, so every screen redraws in the new language and direction. */
export function setLangChoice(v: LangChoice) {
  try { localStorage.setItem(KEY, v); } catch { /* private window: keep the current language */ }
  location.reload();
}

const browserLang = () => (typeof navigator !== 'undefined' ? navigator.languages?.[0] ?? navigator.language ?? 'en' : 'en').slice(0, 2).toLowerCase();
const choice = langChoice();
// English unless the user picks Arabic or Dutch (or picks "System" on an Arabic or Dutch device) in Settings > General.
const sys = browserLang();
export const lang: 'ar' | 'en' | 'nl' = choice === 'system' ? (sys === 'ar' || sys === 'nl' ? sys : 'en') : choice;
export const isArabic = lang === 'ar';
/** The locale for dates and times in the chosen language. */
export const locale = lang === 'ar' ? 'ar' : lang === 'nl' ? 'nl-NL' : 'en-GB';
const dict: Record<string, string> = isArabic ? { ...phone, ...arWeb } : lang === 'nl' ? { ...phoneNl, ...nlWeb } : {};

if (typeof document !== 'undefined') {
  document.documentElement.lang = lang;
  document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
}

/** Translate an English UI string. `{name}` placeholders are filled from `vars`. */
export function t(text: string, vars?: Record<string, string | number>) {
  let out = dict[text] ?? text;
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
