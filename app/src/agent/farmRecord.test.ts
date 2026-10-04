/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { buildFarmRecord, farmRecordProblems, parseDurationMinutes, parsePrice } from './farmRecord';

test.each([
  ['2 hours', 120], ['two hours', 120], ['1.5 hrs', 90], ['90 minutes', 90], ['2 hours 30 minutes', 150], ['half an hour', 30], ['all day', null],
])('duration %s', (text, minutes) => expect(parseDurationMinutes(text)).toBe(minutes));

test.each([
  ['1500 KES', { amount: 1500, currency: 'KES' }],
  ['KES 1,500 per person', { amount: 1500, currency: 'KES' }],
  ['2000 shillings per adult', { amount: 2000, currency: 'KES' }],
  ['two thousand shillings', { amount: 2000, currency: 'KES' }],
  ['one thousand five hundred shillings', { amount: 1500, currency: 'KES' }],
  ['20 USD', { amount: 20, currency: 'USD' }],
  ['cheap', null],
  ['1500', null],
])('price %s', (text, price) => expect(parsePrice(text)).toEqual(price));

const fields = {
  description: 'Two-hour coffee farm tour',
  duration: '2 hours',
  price: '1500 KES',
  capacity: 8,
  meeting_instructions: 'Ondera market gate',
  availability: 'Saturdays and Sundays at 09:00',
  policies: 'Children under five are free.',
};
const business = { name: 'Ondera Coffee Farm', whatsappNumber: '+254712345678', timezone: 'Africa/Nairobi' };
let ids = 0;
const newId = () => `00000000-0000-4000-8000-00000000000${++ids}`;

test('an approved draft becomes a valid, approved Farm record with Kiswahili from the translator', async () => {
  const record = await buildFarmRecord({ fields, business, existing: null, translate: async (text) => `SW ${text}`, newId, now: '2026-10-03T12:00:00Z' });
  expect(record).toMatchObject({
    status: 'APPROVED',
    version: 1,
    name: 'Ondera Coffee Farm',
    description: { en: 'Two-hour coffee farm tour', sw: 'SW Two-hour coffee farm tour' },
    meeting_instructions: { en: 'Ondera market gate. Saturdays and Sundays at 09:00.' },
    whatsapp_number: '+254712345678',
    page: null,
  });
  expect(record.offerings[0]).toMatchObject({ duration_minutes: 120, price: { amount: 1500, currency: 'KES' }, capacity: 8 });
});

test('a later approval keeps the record and offering IDs and raises the version', async () => {
  const first = await buildFarmRecord({ fields, business, existing: null, translate: null, newId, now: '2026-10-03T12:00:00Z' });
  const second = await buildFarmRecord({ fields: { ...fields, price: '2000 KES' }, business, existing: first, translate: null, newId, now: '2026-10-03T13:00:00Z' });
  expect(second.id).toBe(first.id);
  expect(second.offerings[0].id).toBe(first.offerings[0].id);
  expect(second.version).toBe(2);
  expect(second.offerings[0].price.amount).toBe(2000);
});

test('fields that cannot be parsed, and a missing WhatsApp number, block the record', () => {
  expect(farmRecordProblems({ ...fields, duration: 'all day', price: 'cheap' }, business)).toEqual(['duration', 'price']);
  expect(farmRecordProblems(fields, { ...business, whatsappNumber: '' })).toEqual(['whatsapp_number']);
  expect(farmRecordProblems(fields, null)).toEqual(['name', 'whatsapp_number']);
});
