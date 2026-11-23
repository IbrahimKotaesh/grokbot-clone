// Fino on the web and the Mac app speaks the same languages as the phone app.
// English text is the key, so a missing translation simply shows the English.
// The shared dictionary is packages/contracts/src/ar.ts; web-only words live in ar-web.ts.
import { ar as phone } from '../../../packages/contracts/src/ar';
import { arWeb } from './ar-web';

export type LangChoice = 'system' | 'en' | 'ar';
const KEY = 'fino.lang';

export function langChoice(): LangChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'ar' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Saves the choice and reloads, so every screen redraws in the new language and direction. */
export function setLangChoice(v: LangChoice) {
  try { localStorage.setItem(KEY, v); } catch { /* private window: keep the current language */ }
  location.reload();
}

const browserLang = () => (typeof navigator !== 'undefined' ? navigator.languages?.[0] ?? navigator.language ?? 'en' : 'en').slice(0, 2).toLowerCase();
const choice = langChoice();
export const lang: 'ar' | 'en' = choice === 'system' ? (browserLang() === 'ar' ? 'ar' : 'en') : choice;
export const isArabic = lang === 'ar';
const dict: Record<string, string> = isArabic ? { ...phone, ...arWeb } : {};

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
