/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { normalizeSwahiliTimes } from './swahiliTime';

test.each([
  ['Ziara zinafanyika Jumamosi saa tatu asubuhi.', 'Ziara zinafanyika Jumamosi 09:00.'],
  ['Tunaanza saa nane mchana.', 'Tunaanza 14:00.'],
  ['Ziara ya jioni inaanza saa moja jioni.', 'Ziara ya jioni inaanza 19:00.'],
  ['Tunafunga saa sita usiku.', 'Tunafunga 00:00.'],
  ['Saa kumi na mbili asubuhi tunakamua ng\'ombe.', '06:00 tunakamua ng\'ombe.'],
  ['Saa kumi na moja alasiri.', '17:00.'],
  ['Tunaanza saa 3:30 asubuhi.', 'Tunaanza 09:30.'],
  ['Saa nane usiku.', '02:00.'],
])('%s', (input, expected) => {
  expect(normalizeSwahiliTimes(input)).toBe(expected);
});

test('a duration without a time-of-day word is left alone', () => {
  const text = 'Tunaendesha matembezi ya saa mbili kwa KES 1500.';
  expect(normalizeSwahiliTimes(text)).toBe(text);
});
