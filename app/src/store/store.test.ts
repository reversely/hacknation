/// <reference types="bun" />
import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import type { Action, ActionReceipt, Booking } from '@wren/contracts';

import { LocalStore } from './localStore';
import type { SqlDatabase } from './sql';
import { LAST_SYNC_KEY, syncOnce, type Transport } from './sync';

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
    expected_version: 1,
    reason: 'Fully booked',
  };
}

function receipt(action: Action): ActionReceipt {
  return {
    id: action.id,
    version: 0,
    created_at: now,
    updated_at: now,
    type: action.type,
    approved_by: action.approved_by,
    approved_at: action.approved_at,
    status: 'COMPLETED',
    outcome: null,
    error: null,
  };
}

// A backend that runs each action ID once, like /api/actions, and can drop the network
// before or after it acts.
function fakeBackend() {
  const executed = new Map<string, ActionReceipt>();
  const state = { offline: false, loseResponse: false, posts: 0, sinceSeen: [] as (string | null)[] };
  const transport: Transport = {
    postActions: async (actions) => {
      state.posts++;
      if (state.offline) throw new Error('Network request failed');
      for (const action of actions) if (!executed.has(action.id)) executed.set(action.id, receipt(action));
      if (state.loseResponse) {
        state.loseResponse = false;
        throw new Error('Network request failed');
      }
      return { receipts: actions.map((action) => executed.get(action.id)) };
    },
    getChanges: async (since) => {
      state.sinceSeen.push(since);
      if (state.offline) throw new Error('Network request failed');
      return { server_time: '2026-10-03T12:05:00.000Z', messages: [], enquiries: [], bookings: [], profile: null };
    },
  };
  return { executed, state, transport };
}

let store: LocalStore;
beforeEach(() => {
  store = new LocalStore(bunDatabase());
});

describe('outbox', () => {
  test('actions approved offline stay queued, then sync once on reconnect', async () => {
    const backend = fakeBackend();
    store.enqueue(declineAction(1), now);
    store.enqueue(declineAction(2), now);

    backend.state.offline = true;
    const offline = await syncOnce(store, backend.transport);
    expect(offline.error).toBe('Network request failed');
    expect(store.outbox().map((e) => [e.status, e.attempts])).toEqual([
      ['QUEUED', 1],
      ['QUEUED', 1],
    ]);

    backend.state.offline = false;
    const online = await syncOnce(store, backend.transport);
    expect(online).toEqual({ sent: 2, pulled: 0, error: null });
    expect(store.outbox().every((e) => e.status === 'COMPLETED')).toBe(true);
    expect(backend.executed.size).toBe(2);

    await syncOnce(store, backend.transport);
    expect(backend.state.posts).toBe(2);
  });

  test('a response lost after the backend acted causes no duplicate', async () => {
    const backend = fakeBackend();
    store.enqueue(declineAction(1), now);
    backend.state.loseResponse = true;
    await syncOnce(store, backend.transport);
    expect(store.outbox()[0].status).toBe('QUEUED');

    await syncOnce(store, backend.transport);
    expect(store.outbox()[0].status).toBe('COMPLETED');
    expect(backend.executed.size).toBe(1);
  });

  test('queueing the same action twice keeps one entry', () => {
    store.enqueue(declineAction(1), now);
    store.enqueue(declineAction(1), now);
    expect(store.outbox()).toHaveLength(1);
  });

  test('a backend answer that is not a valid receipt list leaves the action queued', async () => {
    store.enqueue(declineAction(1), now);
    const transport: Transport = {
      postActions: async () => ({ ok: true }),
      getChanges: async () => ({}),
    };
    const result = await syncOnce(store, transport);
    expect(result.error).not.toBeNull();
    expect(store.outbox()[0].status).toBe('QUEUED');
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

  test('the last sync time is saved and sent as `since` next time', async () => {
    const backend = fakeBackend();
    await syncOnce(store, backend.transport);
    await syncOnce(store, backend.transport);
    expect(backend.state.sinceSeen).toEqual([null, '2026-10-03T12:05:00.000Z']);
    expect(store.getMeta(LAST_SYNC_KEY)).toBe('2026-10-03T12:05:00.000Z');
  });

  test('reopening the database does not rerun migrations', () => {
    const db = bunDatabase();
    new LocalStore(db).setMeta('k', 'v');
    expect(new LocalStore(db).getMeta('k')).toBe('v');
  });
});
