import type { Routine } from '@shared/types';
import { lang, t } from './i18n';

// Times follow the app's clock (lib/time.ts: Dutch 24-hour, English and Arabic as 8:00 AM); day names are in the app's language.
const timeOf = (h: number, m: number) => new Date(2000, 0, 1, h, m).toLocaleTimeString(lang === 'nl' ? 'nl-NL' : lang === 'ar' ? 'ar-u-nu-latn' : 'en-US', { hour: 'numeric', minute: '2-digit' });
const dayName = (d: number) => new Date(2023, 0, 1 + d).toLocaleDateString(lang === 'nl' ? 'nl-NL' : lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { weekday: 'long' }); // 2023-01-01 was a Sunday

/** A routine's schedule in the app's language ("Weekdays at 08:00", "كل يوم الساعة 9:00"). App triggers keep the server's words. */
export function scheduleText(r: Pick<Routine, 'schedule' | 'description'>): string {
  const out = scheduleTextRaw(r);
  return lang === 'ar' ? out.replace(/كل ال(?=\S)/, 'كل ') : out; // "كل جمعة", not "كل الجمعة"
}
function scheduleTextRaw(r: Pick<Routine, 'schedule' | 'description'>): string {
  if (r.schedule.startsWith('event:')) return r.description;
  const p = r.schedule.trim().split(/\s+/);
  if (p.length !== 5) return r.description;
  const [m, h, dom, mon, dow] = p;
  const at = /^\d+$/.test(m) && /^\d+$/.test(h) ? timeOf(+h, +m) : null;
  if (at && mon === '*') {
    if (dom === '*' && dow === '*') return t('Every day at {time}', { time: at });
    if (dom === '*' && dow === '1-5') return t('Weekdays at {time}', { time: at });
    if (dom === '*' && (dow === '0,6' || dow === '6,0')) return t('Weekends at {time}', { time: at });
    if (dom === '*' && /^[0-6]$/.test(dow)) return t('Every {day} at {time}', { day: dayName(+dow), time: at });
    if (dom === '*' && /^[0-6](,[0-6])+$/.test(dow)) return t('{days} at {time}', { days: dow.split(',').map((d) => dayName(+d)).join(lang === 'ar' ? '، ' : ', '), time: at });
    if (/^\d+$/.test(dom) && dow === '*') return t('Monthly on day {d} at {time}', { d: dom, time: at });
  }
  if (m === '0' && h === '*' && dom === '*' && dow === '*') return t('Every hour');
  if (/^\*\/\d+$/.test(m) && h === '*' && dom === '*' && dow === '*') return t('Every {n} minutes', { n: m.slice(2) });
  if (m === '0' && /^\*\/\d+$/.test(h) && dom === '*' && dow === '*') return t('Every {n} hours', { n: h.slice(2) });
  return r.description;
}
