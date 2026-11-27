// Visitors who haven't picked a language get their device's language: Arabic → Arabic, Dutch → Dutch,
// anything else → English. Where they are (the time zone) never changes it.
import assert from 'node:assert/strict';
const { languageForPlace } = await import('../packages/contracts/src/place.ts');
const cases = [
  ['Europe/Amsterdam', 'en-GB', 'en'], ['Europe/Amsterdam', 'en-US', 'en'], ['Europe/Amsterdam', 'nl-NL', 'nl'], ['Europe/Amsterdam', 'ar', 'ar'],
  ['Europe/Berlin', 'de-DE', 'en'], ['Europe/Paris', 'fr', 'en'], ['Europe/London', 'en-GB', 'en'],
  ['Europe/Brussels', 'nl-BE', 'nl'], ['Europe/Berlin', 'ar-SY', 'ar'],
  ['Asia/Beirut', 'en-US', 'en'], ['Asia/Riyadh', 'en', 'en'], ['Africa/Cairo', 'ar-EG', 'ar'], ['Asia/Dubai', 'en-AE', 'en'], ['Africa/Casablanca', 'fr-MA', 'en'],
  ['America/New_York', 'en-US', 'en'], [undefined, undefined, 'en'], [undefined, 'nl', 'nl'], [undefined, 'ar', 'ar'],
];
for (const [tz, dev, want] of cases) assert.equal(languageForPlace(tz, dev), want, `${tz} ${dev}`);
console.log('place: ok', cases.length);
