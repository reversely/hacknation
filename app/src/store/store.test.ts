/// <reference types="bun" />
import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import type { Action, Booking } from '@wren/contracts';

import { LocalStore } from './localStore';
import type { SqlDatabase } from './sql';

function bunDatabase(db = new Database(':memory:')): SqlDatabase {
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.query(sql).run(...params);
    },
    all: <T,>(sql: string, params: (string | number | null)[] = []) => db.query(sql).all(...params) as T[],
    transaction: (task) => db.transaction(task)(),
  };
}

const now = '2026-10-03T12:00:00.000Z';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function declineAction(n: number): Action {
  return {
    id: uuid(n),
    type: 'decline_booking',
    approved_by: 'OPERATOR',
    approved_at: now,
    booking_id: uuid(100 + n),
    closed_reason: 'declined',
  };
}

let store: LocalStore;
beforeEach(() => {
  store = new LocalStore(bunDatabase());
});

describe('outbox table', () => {
  test('queueing the same action twice keeps one entry', () => {
    store.enqueue(declineAction(1), now);
    store.enqueue(declineAction(1), now);
    expect(store.outbox()).toHaveLength(1);
    expect(store.outbox()[0].queuedAt).toBe(now);
  });
});

describe('records', () => {
  const booking: Booking = {
    id: uuid(7),
    version: 2,
    created_at: now,
    updated_at: now,
    enquiry_id: uuid(8),
    offering_id: uuid(9),
    calendar_event_id: 'evt1',
    slot_start: '2026-10-10T09:00:00+03:00',
    slot_end: '2026-10-10T11:00:00+03:00',
    party_size: 2,
    customer_name: null,
    customer_contact: '+447700900123',
    channel: 'WHATSAPP',
    status: 'HELD',
    decided_at: null,
  };

  test('an older version never overwrites a newer one', () => {
    store.upsert('Bookings', booking);
    store.upsert('Bookings', { ...booking, version: 1, status: 'REQUESTED' as const });
    expect(store.get<Booking>('Bookings', booking.id)?.status).toBe('HELD');
    store.upsert('Bookings', { ...booking, version: 3, status: 'CONFIRMED' as const });
    expect(store.get<Booking>('Bookings', booking.id)?.status).toBe('CONFIRMED');
  });

  test('reopening the database does not rerun migrations', () => {
    const db = bunDatabase();
    new LocalStore(db).setMeta('k', 'v');
    expect(new LocalStore(db).getMeta('k')).toBe('v');
  });
});
