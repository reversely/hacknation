import { describe, expect, test } from 'bun:test';

import {
  Action,
  bookingStatusFromEvent,
  bookingToEvent,
  columns,
  fromRow,
  partySize,
  toRow,
  type Booking,
  type FarmProfile,
} from './index';

const now = '2026-10-03T12:00:00.000Z';
const farm: FarmProfile = {
  id: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
  version: 1,
  created_at: now,
  updated_at: now,
  status: 'APPROVED',
  approved_at: now,
  name: 'Ondera farm',
  description: { en: 'Coffee walk', sw: 'Matembezi ya kahawa' },
  offerings: [],
  meeting_instructions: { en: 'Market gate', sw: 'Lango la soko' },
  policies: { en: '', sw: '' },
  whatsapp_number: '+254712345678',
  email: null,
  timezone: 'Africa/Nairobi',
  page: null,
};
const booking: Booking = {
  id: '6f1c2a3e-4b5d-4c6e-8f70-819203a4b5c6',
  version: 0,
  created_at: now,
  updated_at: now,
  enquiry_id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  offering_id: '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a',
  calendar_event_id: null,
  slot_start: '2026-10-10T09:00:00+03:00',
  slot_end: '2026-10-10T11:00:00+03:00',
  party_size: 3,
  customer_name: null,
  customer_contact: '+447700900123',
  channel: 'WHATSAPP',
  status: 'HELD',
  decided_at: null,
};

describe('farm row', () => {
  test('the farm profile survives a round trip through a row', () => {
    const withPage = { ...farm, page: { headline: 'Walk the coffee slope' } };
    const row = toRow('Farm', withPage);
    expect(row).toHaveLength(columns('Farm').length);
    expect(fromRow('Farm', row)).toEqual(withPage);
  });

  test('a row written before the page column existed still reads, with page null', () => {
    const row = toRow('Farm', farm).slice(0, -1);
    expect(fromRow('Farm', row).page).toBeNull();
  });

  test('a text cell that looks like JSON stays text', () => {
    const named = { ...farm, name: '{Ondera} [farm]' };
    expect(fromRow('Farm', toRow('Farm', named)).name).toBe(named.name);
  });

  test('a row with an unknown status is rejected', () => {
    const row = toRow('Farm', farm);
    row[columns('Farm').indexOf('status')] = 'MAYBE';
    expect(() => fromRow('Farm', row)).toThrow();
  });
});

describe('bookings on the calendar', () => {
  const event = (b: Booking) => bookingToEvent(b, 'Coffee walk', 'Africa/Nairobi');

  test('each booking state maps to an event and reads back to the same state', () => {
    for (const status of ['HELD', 'CONFIRMED', 'DECLINED', 'CANCELLED'] as const) {
      expect(bookingStatusFromEvent(event({ ...booking, status }))).toBe(status);
    }
    expect(event(booking).status).toBe('tentative');
    expect(event({ ...booking, status: 'DECLINED' }).extendedProperties?.private?.closed_reason).toBe('declined');
  });

  test('the event carries the booking IDs and party size', () => {
    const held = event(booking);
    expect(held.extendedProperties?.private).toMatchObject({ booking_id: booking.id, offering_id: booking.offering_id, channel: 'whatsapp' });
    expect(partySize(held)).toBe(3);
    expect(held.summary).toBe('Coffee walk: 3 (+447700900123)');
  });

  test('only a confirmed email booking invites the visitor', () => {
    const emailBooking = { ...booking, channel: 'EMAIL' as const, customer_contact: 'amina@example.com' };
    expect(event(emailBooking).attendees).toBeUndefined();
    expect(event({ ...emailBooking, status: 'CONFIRMED' }).attendees).toEqual([{ email: 'amina@example.com' }]);
    expect(event({ ...booking, status: 'CONFIRMED' }).attendees).toBeUndefined();
  });

  test('a booking without a slot decision has no event', () => {
    expect(() => event({ ...booking, status: 'REQUESTED' })).toThrow();
  });

  test('an event with a malformed party size is rejected on read', () => {
    const bad = event(booking);
    bad.extendedProperties!.private!.party_size = 'three';
    expect(() => partySize(bad)).toThrow();
  });
});

describe('actions', () => {
  const base = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', approved_at: now };

  test('confirming a booking requires operator approval', () => {
    const confirm = { ...base, type: 'confirm_booking', booking_id: booking.id };
    expect(Action.safeParse({ ...confirm, approved_by: 'OPERATOR' }).success).toBe(true);
    expect(Action.safeParse({ ...confirm, approved_by: 'POLICY' }).success).toBe(false);
  });

  test('an email header value with a line break is rejected', () => {
    const email = {
      ...base,
      approved_by: 'POLICY',
      type: 'send_email',
      enquiry_id: booking.enquiry_id,
      thread_id: 't1',
      to: 'amina@example.com',
      subject: 'Re: Visit',
      in_reply_to: '<a@mail>',
      references: '<a@mail>',
      text: 'Your slot is held.',
    };
    expect(Action.safeParse(email).success).toBe(true);
    expect(Action.safeParse({ ...email, subject: 'Re: Visit\r\nBcc: x@example.com' }).success).toBe(false);
  });
});
