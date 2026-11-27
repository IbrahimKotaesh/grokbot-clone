// Which language Badr greets a new visitor in: the language their phone or browser is set to.
// Arabic → Arabic, Dutch → Dutch, everything else → English (the main language). The country never decides.



export type PlaceLang = 'en' | 'ar' | 'nl';

/**
 * The language for a visitor who has not picked one: the device's (or browser's) own language decides.
 * Arabic device → Arabic, Dutch device → Dutch, anything else → English. Where the visitor is never changes it:
 * an English phone in Amsterdam or Dubai stays English. `timeZone` is kept for callers but not used.
 */
export function languageForPlace(_timeZone: string | undefined, deviceLang: string | undefined): PlaceLang {
  const device = (deviceLang ?? '').slice(0, 2).toLowerCase();
  if (device === 'ar') return 'ar';
  if (device === 'nl') return 'nl';
  return 'en';
}

/** The device's own time zone, or undefined when the engine can't tell. */
export function deviceTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}
