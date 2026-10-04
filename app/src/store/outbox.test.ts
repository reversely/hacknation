/// <reference types="bun" />
import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import type { Action, Booking, CalendarEvent, FarmProfile } from '@wren/contracts';

import { buildReply, type GoogleApi } from './google';
import { LocalStore } from './localStore';
import { CALENDAR_ID_KEY, FARM_ID_KEY, SLOT_UNAVAILABLE, SPREADSHEET_ID_KEY, syncOnce } from './outbox';
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
const clock = () => now;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OFFERING = uuid(900);

const farm: FarmProfile = {
  id: uuid(800),
  version: 1,
  created_at: now,
  updated_at: now,
  status: 'APPROVED',
  approved_at: now,
  name: 'Ondera farm',
  description: { en: 'Coffee walk', sw: 'Matembezi ya kahawa' },
  offerings: [
    {
      id: OFFERING,
      name: { en: 'Coffee walk', sw: 'Matembezi ya kahawa' },
      description: { en: '', sw: '' },
      duration_minutes: 120,
      price: { amount: 1500, currency: 'KES' },
      capacity: 6,
    },
  ],
  meeting_instructions: { en: 'Market gate', sw: 'Lango la soko' },
  policies: { en: '', sw: '' },
  whatsapp_number: '+254712345678',
  email: null,
  timezone: 'Africa/Nairobi',
  page: null,
};

function booking(n: number, partySize: number, extra: Partial<Booking> = {}): Booking {
  return {
    id: uuid(n),
    version: 0,
    created_at: now,
    updated_at: now,
    enquiry_id: uuid(100 + n),
    offering_id: OFFERING,
    calendar_event_id: null,
    slot_start: '2026-10-10T09:00:00+03:00',
    slot_end: '2026-10-10T11:00:00+03:00',
    party_size: partySize,
    customer_name: null,
    customer_contact: '+254700000001',
    channel: 'WHATSAPP',
    status: 'REQUESTED',
    decided_at: null,
    ...extra,
  };
}

const approval = (n: number, by: 'OPERATOR' | 'POLICY' = 'POLICY') => ({ id: uuid(500 + n), approved_by: by, approved_at: now });
const hold = (n: number, b: Booking): Action => ({ ...approval(n), type: 'hold_slot', booking: b });
const confirm = (n: number, bookingId: string): Action => ({ ...approval(n, 'OPERATOR'), type: 'confirm_booking', booking_id: bookingId }) as Action;

// An in-memory calendar, mailbox and spreadsheet with the GoogleApi shape. `offline` makes the
// next call fail like a dropped connection; `loseResponse` lets a call act and then fail.
function fakeGoogle() {
  const events: CalendarEvent[] = [];
  const sent: { threadId: string; raw: string }[] = [];
  const rows: unknown[][] = [];
  const state = { offline: false, loseResponse: false, inserts: 0 };
  const net = () => {
    if (state.offline) throw new Error('Network request failed');
  };
  const lose = () => {
    if (state.loseResponse) {
      state.loseResponse = false;
      throw new Error('Network request failed');
    }
  };
  const api: GoogleApi = {
    findEvent: async (_c, id) => (net(), events.find((e) => e.extendedProperties?.private?.booking_id === id) ?? null),
    listEvents: async () => (net(), events.filter((e) => e.status !== 'cancelled')),
    listChangedEvents: async () => (net(), [...events]),
    insertEvent: async (_c, event) => {
      net();
      state.inserts++;
      const stored = { ...event, id: `evt${events.length + 1}` };
      events.push(stored);
      lose();
      return stored;
    },
    patchEvent: async (_c, id, patch) => {
      net();
      const event = events.find((e) => e.id === id)!;
      Object.assign(event, patch);
      return event;
    },
    sendEmail: async (threadId, raw) => {
      net();
      sent.push({ threadId, raw });
      lose();
      return `msg${sent.length}`;
    },
    sentInThreadSince: async (threadId) => (net(), sent.some((m) => m.threadId === threadId)),
    writeFarmRow: async (_s, row) => {
      net();
      rows.push(row);
    },
  };
  return { api, events, sent, rows, state };
}

let store: LocalStore;
let google: ReturnType<typeof fakeGoogle>;
beforeEach(() => {
  store = new LocalStore(bunDatabase());
  store.setMeta(CALENDAR_ID_KEY, 'cal1');
  store.setMeta(SPREADSHEET_ID_KEY, 'sheet1');
  store.setMeta(FARM_ID_KEY, farm.id);
  store.upsert('Farm', farm);
  google = fakeGoogle();
});

describe('holds', () => {
  test('a hold creates one tentative event and marks the booking held', async () => {
    store.enqueue(hold(1, booking(1, 2)), now);
    expect(await syncOnce(store, google.api, clock)).toMatchObject({ sent: 1, error: null });
    expect(google.events).toHaveLength(1);
    expect(google.events[0].status).toBe('tentative');
    expect(store.get<Booking>('Bookings', uuid(1))).toMatchObject({ status: 'HELD', calendar_event_id: 'evt1' });
  });

  test('a hold replayed after a lost response, or queued twice, creates one event', async () => {
    store.enqueue(hold(1, booking(1, 2)), now);
    google.state.loseResponse = true;
    const first = await syncOnce(store, google.api, clock);
    expect(first.error).toBe('Network request failed');
    expect(store.outbox()[0]).toMatchObject({ status: 'QUEUED', attempts: 1 });

    store.enqueue(hold(2, booking(1, 2)), now);
    await syncOnce(store, google.api, clock);
    expect(google.state.inserts).toBe(1);
    expect(store.outbox().every((e) => e.status === 'COMPLETED')).toBe(true);
  });

  test('a hold that would pass capacity fails with SLOT_UNAVAILABLE and writes nothing', async () => {
    store.enqueue(hold(1, booking(1, 5)), now);
    store.enqueue(hold(2, booking(2, 2)), now);
    await syncOnce(store, google.api, clock);
    expect(google.events).toHaveLength(1);
    expect(store.outbox()[1]).toMatchObject({ status: 'FAILED', lastError: SLOT_UNAVAILABLE });
  });

  test('actions approved offline stay queued in order until a connection returns', async () => {
    store.enqueue(hold(1, booking(1, 2)), now);
    store.enqueue(hold(2, booking(2, 2)), now);
    google.state.offline = true;
    await syncOnce(store, google.api, clock);
    expect(store.outbox().map((e) => [e.status, e.attempts])).toEqual([
      ['QUEUED', 1],
      ['QUEUED', 0],
    ]);
    google.state.offline = false;
    await syncOnce(store, google.api, clock);
    expect(google.events).toHaveLength(2);
  });
});

describe('confirmation', () => {
  test('a confirmed email booking invites the visitor; a WhatsApp booking sends no invitation', async () => {
    store.enqueue(hold(1, booking(1, 2, { channel: 'EMAIL', customer_contact: 'amina@example.com' })), now);
    store.enqueue(hold(2, booking(2, 2)), now);
    store.enqueue(confirm(3, uuid(1)), now);
    store.enqueue(confirm(4, uuid(2)), now);
    await syncOnce(store, google.api, clock);
    expect(google.events.map((e) => [e.status, e.attendees])).toEqual([
      ['confirmed', [{ email: 'amina@example.com' }]],
      ['confirmed', undefined],
    ]);
    expect(store.get<Booking>('Bookings', uuid(1))?.status).toBe('CONFIRMED');
  });

  test('a booking with no calendar event cannot be confirmed and does not block the queue', async () => {
    store.enqueue(confirm(1, uuid(7)), now);
    store.enqueue(hold(2, booking(2, 2)), now);
    await syncOnce(store, google.api, clock);
    expect(store.outbox().map((e) => e.status)).toEqual(['FAILED', 'COMPLETED']);
  });

  test('a status changed in Google Calendar reaches the phone on the next sync', async () => {
    store.enqueue(hold(1, booking(1, 2)), now);
    await syncOnce(store, google.api, clock);
    google.events[0].status = 'cancelled';
    google.events[0].extendedProperties!.private!.closed_reason = 'declined';
    const result = await syncOnce(store, google.api, clock);
    expect(result.pulled).toBe(1);
    expect(store.get<Booking>('Bookings', uuid(1))?.status).toBe('DECLINED');
  });
});

describe('email and profile', () => {
  const email = (n: number): Action => ({
    ...approval(n),
    type: 'send_email',
    enquiry_id: uuid(200),
    thread_id: 'thread1',
    to: 'amina@example.com',
    subject: 'Visit on Saturday',
    in_reply_to: '<a1@mail.example>',
    references: '',
    text: 'Karibu! Your slot is held.',
  });

  test('a send whose response was lost is not sent again', async () => {
    store.enqueue(email(1), now);
    google.state.loseResponse = true;
    await syncOnce(store, google.api, clock);
    await syncOnce(store, google.api, clock);
    expect(google.sent).toHaveLength(1);
    expect(store.outbox()[0].status).toBe('COMPLETED');
  });

  test('the reply threads with the visitor message and keeps non-ASCII text intact', () => {
    const raw = buildReply({ to: 'a@example.com', subject: 'Ziara ya shambani ☕', inReplyTo: '<a1@mail>', references: '<a0@mail>', text: 'Karibu ☕' });
    const utf8 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const decoded = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    const subject = decoded.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m)?.[1];
    expect(subject && utf8(subject)).toBe('Re: Ziara ya shambani ☕');
    expect(decoded).toContain('In-Reply-To: <a1@mail>');
    expect(decoded).toContain('References: <a0@mail> <a1@mail>');
    expect(utf8(decoded.split('\r\n\r\n')[1])).toBe('Karibu ☕');
  });

  test('saving the approved profile writes the Farm row', async () => {
    store.enqueue({ ...approval(1, 'OPERATOR'), type: 'save_profile', profile: { ...farm, version: 2 } }, now);
    await syncOnce(store, google.api, clock);
    expect(google.rows).toHaveLength(1);
    expect(store.get<FarmProfile>('Farm', farm.id)?.version).toBe(2);
  });

  test('an outbox flush of 10 actions finishes within the budget', async () => {
    for (let n = 1; n <= 10; n++) store.enqueue(email(n), now);
    const started = performance.now();
    await syncOnce(store, google.api, clock);
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(store.outbox().every((e) => e.status === 'COMPLETED')).toBe(true);
  });
});
