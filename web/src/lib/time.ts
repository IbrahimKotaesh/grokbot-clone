import { lang, t } from './i18n';
// Dutch shows Dutch dates and the 24-hour clock; English and Arabic keep the English formats.
const loc = (english: string) => (lang === 'nl' ? 'nl-NL' : english);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const clock = (ts: number) => new Date(ts).toLocaleTimeString(loc('en-US'), { hour: 'numeric', minute: '2-digit' });

/** Keep each message's timestamp visible; older messages include their date. */
export function messageTimestamp(ts: number): string {
  const date = new Date(ts), today = new Date();
  if (sameDay(date, today)) return clock(ts);
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== today.getFullYear()) options.year = 'numeric';
  return `${date.toLocaleDateString(loc('en-GB'), options)} · ${clock(ts)}`;
}

/** "Fri, Nov 6 3:56 PM" / "Yesterday 11:24 PM" / "Today 9:02 AM" dividers, like screen 01. */
export function dividerLabel(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const today = new Date(now);
  const y = new Date(now - 86_400_000);
  if (sameDay(d, today)) return `${t('Today')} ${clock(ts)}`;
  if (sameDay(d, y)) return `${t('Yesterday')} ${clock(ts)}`;
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
  return `${d.toLocaleDateString(loc('en-US'), opts)} ${clock(ts)}`;
}

/** Compact elapsed: "12s", "3m", "1h 4m". */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function relativeShort(ts: number, now = Date.now()): string {
  const s = (now - ts) / 1000;
  if (s < 60) return t('now');
  if (s < 3600) return t('{n}m', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{n}h', { n: Math.floor(s / 3600) });
  if (s < 172800) return t('Yesterday');
  return t('{n}d', { n: Math.floor(s / 86400) });
}
