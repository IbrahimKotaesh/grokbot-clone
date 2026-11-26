// Visitors who haven't picked a language get one by place: NL → Dutch, the Arab world → Arabic, elsewhere English.
import assert from 'node:assert/strict';
const { languageForPlace } = await import('../packages/contracts/src/place.ts');
const cases = [
  ['Europe/Amsterdam', 'en-GB', 'nl'], ['Europe/Amsterdam', 'nl-NL', 'nl'], ['Europe/Amsterdam', 'ar', 'ar'],
  ['Europe/Berlin', 'de-DE', 'en'], ['Europe/Paris', 'fr', 'en'], ['Europe/London', 'en-GB', 'en'],
  ['Europe/Brussels', 'nl-BE', 'nl'], ['Europe/Berlin', 'ar-SY', 'ar'],
  ['Asia/Beirut', 'en-US', 'ar'], ['Asia/Riyadh', 'en', 'ar'], ['Africa/Cairo', 'en', 'ar'], ['Asia/Dubai', 'en-AE', 'ar'], ['Africa/Casablanca', 'fr-MA', 'ar'],
  ['America/New_York', 'en-US', 'en'], [undefined, undefined, 'en'], [undefined, 'nl', 'nl'],
];
for (const [tz, dev, want] of cases) assert.equal(languageForPlace(tz, dev), want, `${tz} ${dev}`);
console.log('place: ok', cases.length);
