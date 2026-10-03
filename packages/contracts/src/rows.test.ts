import { describe, expect, test } from 'bun:test';

import { Action, columns, fromRow, toRow, type Booking, type Message } from './index';

const now = '2026-10-03T12:00:00.000Z';
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

describe('sheet rows', () => {
  test('a booking survives a round trip through a row', () => {
    const row = toRow('Bookings', booking);
    expect(row).toHaveLength(columns('Bookings').length);
    expect(fromRow('Bookings', row)).toEqual(booking);
  });

  test('a text cell that looks like JSON stays text', () => {
    const message: Message = {
      id: '0d1e2f3a-4b5c-4d6e-8f7a-8b9c0d1e2f3a',
      version: 0,
      created_at: now,
      updated_at: now,
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      thread_id: 'wa:+447700900123',
      external_id: 'wamid.X',
      enquiry_id: null,
      contact: '+447700900123',
      text: '[photo] {can we come Saturday?}',
      text_for_operator: null,
      delivery_status: null,
    };
    expect(fromRow('Messages', toRow('Messages', message)).text).toBe(message.text);
  });

  test('a row with an unknown status is rejected', () => {
    const row = toRow('Bookings', booking);
    row[columns('Bookings').indexOf('status')] = 'MAYBE';
    expect(() => fromRow('Bookings', row)).toThrow();
  });
});

describe('actions', () => {
  test('confirming a booking requires operator approval', () => {
    const base = {
      id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
      approved_at: now,
      type: 'confirm_booking',
      booking_id: booking.id,
      expected_version: 1,
    };
    expect(Action.safeParse({ ...base, approved_by: 'OPERATOR' }).success).toBe(true);
    expect(Action.safeParse({ ...base, approved_by: 'POLICY' }).success).toBe(false);
  });
});
