/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { buildSite, copyProblems } from './pipeline';
import { formatDuration, formatSlot } from './render';

const survey = {
  language: 'sw',
  business: { name: 'Ondera Coffee Farm', phone: '+254712345678', location: 'Ondera, Nyeri', description: 'Shamba la kahawa la familia.' },
  services: [
    { type: 'guided_tour', description: 'Tembea kwenye mistari ya kahawa na uonje kahawa safi.', duration_minutes: 120, price: { amount: 1500, currency: 'KES' }, capacity: 8 },
    { type: 'custom', custom_name: 'Warsha ya kuchoma kahawa', duration_minutes: 90, price: { amount: 2500, currency: 'KES' }, capacity: 6 },
  ],
  availability: { days: ['saturday', 'sunday'], slots: [{ start: '09:00', end: '11:00' }, { start: '14:00', end: '15:30' }] },
};
const translate = async (text: string, from: string, to: string) => `[${from}>${to}] ${text}`;
const good = JSON.stringify({ headline: 'Walk the coffee rows', introduction: 'A family coffee farm.', services: ['See the rows and taste fresh coffee.', 'Roast your own beans.'] });

test('a Kiswahili survey makes a Kiswahili-only site with every number from the survey', async () => {
  const result = await buildSite(survey, { translate, generate: async () => good });
  expect(result.fellBack).toBe(false);
  expect(result.html).toContain('KES 1,500');
  expect(result.html).toContain('KES 2,500');
  expect(result.html).toContain('saa tatu asubuhi – saa tano asubuhi');
  expect(result.html).not.toContain('09:00');
  expect(result.html).not.toContain('Guided tour');
  expect(result.html).not.toContain('Services');
  // The coder's English is translated into Kiswahili; her own sentences and names appear as written.
  expect(result.site.headline).toBe('[en>sw] Walk the coffee rows');
  expect(result.site.services[0]).toMatchObject({ name: 'Ziara ya kuongozwa', blurb: 'Tembea kwenye mistari ya kahawa na uonje kahawa safi.' });
  expect(result.site.services[1]).toMatchObject({ name: 'Warsha ya kuchoma kahawa', blurb: '[en>sw] Roast your own beans.' });
});

test('an English survey makes an English-only site without translation', async () => {
  let translations = 0;
  const counting = async (text: string) => (translations++, text);
  const english = { ...survey, language: 'en', business: { ...survey.business, description: 'A family coffee farm.' }, services: [{ ...survey.services[0], description: 'Walk the rows.' }] };
  const result = await buildSite(english, { translate: counting, generate: async () => JSON.stringify({ headline: 'Walk the coffee rows', introduction: 'A family coffee farm.', services: ['See the rows.'] }) });
  expect(translations).toBe(0);
  expect(result.html).toContain('09:00 – 11:00');
  expect(result.html).toContain('Guided tour');
  expect(result.html).not.toContain('Huduma');
});

test('copy that invents places, numbers or markup is retried, then built from the survey', async () => {
  let calls = 0;
  const inventive = async () => (calls++, JSON.stringify({ headline: 'The best tour in Nairobi', introduction: 'Since 1990.', services: ['<b>Great</b>', 'Fun.'] }));
  const result = await buildSite(survey, { translate, generate: inventive });
  expect(calls).toBe(3);
  expect(result.fellBack).toBe(true);
  expect(result.site.headline).toBe('Ondera Coffee Farm');
  expect(result.site.introduction).toBe('Shamba la kahawa la familia.');
  expect(result.html).not.toContain('Nairobi');
});

test('copy checks', () => {
  const known = 'ondera coffee farm guided tour';
  expect(copyProblems({ headline: 'Walk at Ondera', introduction: 'Taste coffee.', services: ['A tour.'] }, known, 1)).toEqual([]);
  expect(copyProblems({ headline: 'Walk in Kenya', introduction: 'Open 9 to 5.', services: [] }, known, 1)).toEqual([
    'wrong number of service sentences',
    '"Kenya" is not in the survey',
    'a number (the page shows numbers from the survey)',
  ]);
});

test('durations and times read naturally in each language', () => {
  expect([formatDuration(120, 'en'), formatDuration(90, 'sw'), formatDuration(45, 'en')]).toEqual(['2 h', 'saa 1 na dakika 30', '45 min']);
  expect(formatSlot({ start: '14:00', end: '15:30' }, 'sw')).toBe('saa nane mchana – saa tisa na nusu mchana');
});
