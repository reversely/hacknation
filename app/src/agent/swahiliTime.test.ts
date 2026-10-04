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

test.each([
  ['Tunakutana Jumamosi saa 9:00.', 'Tunakutana Jumamosi saa tatu asubuhi.'],
  ['Ziara inaanza 14:00.', 'Ziara inaanza saa nane mchana.'],
  ['Ziara ya jioni 19:00.', 'Ziara ya jioni saa moja usiku.'],
  ['Tunaanza 09:30.', 'Tunaanza saa tatu na nusu asubuhi.'],
  ['Saa 12:00 mchana.', 'saa sita mchana.'],
])('outgoing %s', (input, expected) => {
  const { formatSwahiliTimes } = require('./swahiliTime');
  expect(formatSwahiliTimes(input)).toBe(expected);
});

test('a time converted in and back out returns to the same Kiswahili clock time', () => {
  const { formatSwahiliTimes } = require('./swahiliTime');
  for (const phrase of ['saa tatu asubuhi', 'saa nane mchana', 'saa kumi jioni']) {
    expect(formatSwahiliTimes(normalizeSwahiliTimes(phrase))).toBe(phrase);
  }
});
