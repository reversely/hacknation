// Booking reference codes that need no backend: the code itself carries the booking. 27 bits of
// payload (days since 1 January 2026, slot, service, party size) and a 5-bit check, written as
// seven Crockford base-32 characters, for example WR-4K7Q-M2X. A visitor can type the code back
// and the site reads the booking from it; a mistyped character fails the check.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // pragma: allowlist secret (the base-32 alphabet)
const EPOCH = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;

export type CodedBooking = { date: string; slot: number; service: number; people: number };

const check = (payload: number) => {
  let sum = 0;
  for (let i = 0, p = payload; i < 6; i++, p = Math.floor(p / 32)) sum += (p % 32) * (2 * i + 1); // odd weights: any one changed digit changes the sum
  return sum % 32;
};

export function encodeBooking(b: CodedBooking): string {
  const days = Math.round((Date.parse(`${b.date}T00:00:00Z`) - EPOCH) / DAY);
  if (days < 0 || days > 4095 || b.slot > 7 || b.service > 7 || b.people < 1 || b.people > 32) throw new Error('booking out of range');
  const payload = ((days * 8 + b.slot) * 8 + b.service) * 32 + (b.people - 1);
  let value = payload * 32 + check(payload);
  let out = '';
  for (let i = 0; i < 7; i++, value = Math.floor(value / 32)) out = ALPHABET[value % 32] + out;
  return `WR-${out.slice(0, 4)}-${out.slice(4)}`;
}

export function decodeBooking(code: string): CodedBooking | null {
  const clean = code.toUpperCase().replace(/^WR/, '').replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (clean.length !== 7) return null;
  let value = 0;
  for (const c of clean) {
    const digit = ALPHABET.indexOf(c);
    if (digit < 0) return null;
    value = value * 32 + digit;
  }
  const payload = Math.floor(value / 32);
  if (value % 32 !== check(payload)) return null;
  const people = (payload % 32) + 1;
  const service = Math.floor(payload / 32) % 8;
  const slot = Math.floor(payload / 256) % 8;
  const days = Math.floor(payload / 2048);
  return { date: new Date(EPOCH + days * DAY).toISOString().slice(0, 10), slot, service, people };
}
