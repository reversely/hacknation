import { expect, test } from 'bun:test';
import { decodeBooking, encodeBooking } from './booking-code';

test('a code reads back as the booking it encodes', () => {
  const booking = { date: '2026-10-10', slot: 1, service: 2, people: 4 };
  const code = encodeBooking(booking);
  expect(code).toMatch(/^WR-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{3}$/);
  expect(decodeBooking(code)).toEqual(booking);
  expect(decodeBooking(code.toLowerCase().replace(/-/g, ' '))).toEqual(booking);
});

test('a mistyped character fails the check', () => {
  const code = encodeBooking({ date: '2026-12-31', slot: 0, service: 0, people: 1 });
  const last = code.at(-1)!;
  expect(decodeBooking(code.slice(0, -1) + (last === '0' ? '1' : '0'))).toBeNull();
  expect(decodeBooking('WR-1234')).toBeNull();
});

test('every single-character substitution fails the check', () => {
  const code = encodeBooking({ date: '2027-03-14', slot: 5, service: 3, people: 17 });
  const chars = code.replace(/-/g, '').slice(2);
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // pragma: allowlist secret (the base-32 alphabet)
  for (let i = 0; i < chars.length; i++)
    for (const c of alphabet) if (c !== chars[i]) expect(decodeBooking(chars.slice(0, i) + c + chars.slice(i + 1))).toBeNull();
});
