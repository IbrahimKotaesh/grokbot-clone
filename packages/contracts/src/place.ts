// Which language Fino greets a new visitor in, from where they are and what their device speaks.
// "Where" is the device's time zone, so nothing is looked up online and no IP address is sent anywhere.
// Netherlands → Dutch, the Arab world → Arabic, everywhere else → English (the main language).
// A device set to Arabic gets Arabic anywhere, and a device set to Dutch gets Dutch anywhere (Flanders, say).

const DUTCH_ZONES = new Set(['Europe/Amsterdam', 'America/Curacao', 'America/Aruba', 'America/Kralendijk', 'America/Lower_Princes']);

const ARAB_ZONES = new Set([
  // Levant, Iraq and the Gulf
  'Asia/Beirut', 'Asia/Damascus', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Gaza', 'Asia/Hebron',
  'Asia/Kuwait', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Dubai', 'Asia/Muscat', 'Asia/Aden',
  // North Africa, Sudan and the Horn
  'Africa/Cairo', 'Africa/Tripoli', 'Africa/Tunis', 'Africa/Algiers', 'Africa/Casablanca', 'Africa/El_Aaiun',
  'Africa/Khartoum', 'Africa/Nouakchott', 'Africa/Djibouti', 'Africa/Mogadishu', 'Indian/Comoro',
]);

export type PlaceLang = 'en' | 'ar' | 'nl';

/** The language for a visitor who has not picked one: `timeZone` like "Europe/Amsterdam", `deviceLang` like "ar" or "en-GB". */
export function languageForPlace(timeZone: string | undefined, deviceLang: string | undefined): PlaceLang {
  const device = (deviceLang ?? '').slice(0, 2).toLowerCase();
  if (device === 'ar') return 'ar';
  if (timeZone && DUTCH_ZONES.has(timeZone)) return 'nl';
  if (timeZone && ARAB_ZONES.has(timeZone)) return 'ar';
  if (device === 'nl') return 'nl';
  return 'en';
}

/** The device's own time zone, or undefined when the engine can't tell. */
export function deviceTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}
