import {
  bookingProperties,
  bookingStatusFromEvent,
  bookingToEvent,
  eventProperties,
  partySize,
  toRow,
  type Action,
  type ActionReceipt,
  type Booking,
  type CalendarEvent,
  type FarmProfile,
} from '@wren/contracts';

import { buildReply, GoogleRejected, type GoogleApi } from './google';
import type { LocalStore, OutboxEntry } from './localStore';

// Runs approved actions from the outbox against Google and reads calendar edits back
// (docs/bookings.md, docs/contracts.md "Actions"). Every action checks Google for its own earlier
// result first, so running an entry again after a lost response does not act twice.

export const CALENDAR_ID_KEY = 'calendar_id';
export const SPREADSHEET_ID_KEY = 'spreadsheet_id';
export const FARM_ID_KEY = 'farm_id';
export const LAST_SYNC_KEY = 'last_sync_at';

// A slot that cannot take the party. The agent drafts a reply offering another slot.
export const SLOT_UNAVAILABLE = 'SLOT_UNAVAILABLE';

// An action the local records cannot support, such as a confirmation for a booking with no event.
// Running it again would fail the same way, so it fails instead of staying queued.
class NotRunnable extends Error {}

type Outcome = { status: 'COMPLETED' | 'FAILED'; outcome: Record<string, unknown> | null; error: string | null };
type Context = { store: LocalStore; google: GoogleApi; now: () => string };

export type SyncResult = { sent: number; pulled: number; error: string | null };

export async function syncOnce(store: LocalStore, google: GoogleApi, now: () => string): Promise<SyncResult> {
  const context = { store, google, now };
  let sent = 0;
  try {
    for (const entry of store.queued(Number.MAX_SAFE_INTEGER)) {
      let result: Outcome;
      try {
        result = await run(entry, context);
      } catch (error) {
        if (!(error instanceof GoogleRejected || error instanceof NotRunnable)) {
          // A network failure or a retryable HTTP status: keep the entry queued and stop, so
          // later actions do not overtake it.
          store.recordAttemptFailed([entry.id], message(error));
          throw error;
        }
        result = { status: 'FAILED', outcome: null, error: message(error) };
      }
      store.recordReceipt(receipt(entry.action, result, now()));
      sent++;
    }
    const pulled = await pullBookings(context);
    return { sent, pulled, error: null };
  } catch (error) {
    return { sent, pulled: 0, error: message(error) };
  }
}

async function run(entry: OutboxEntry, context: Context): Promise<Outcome> {
  const { action } = entry;
  switch (action.type) {
    case 'hold_slot':
      return hold(action.booking, context);
    case 'confirm_booking':
      return confirm(action.booking_id, context);
    case 'decline_booking':
      return close(action.booking_id, action.closed_reason, context);
    case 'send_email':
      return sendEmail(action, entry, context);
    case 'save_profile':
      return saveProfile(action.profile, context);
    case 'open_whatsapp_draft':
      return { status: 'FAILED', outcome: null, error: 'A WhatsApp draft opens from the screen, not the outbox.' };
  }
}

async function hold(booking: Booking, { store, google, now }: Context): Promise<Outcome> {
  const calendarId = required(store, CALENDAR_ID_KEY, 'The booking calendar is not set up yet.');
  let event = await google.findEvent(calendarId, booking.id);
  if (!event) {
    const { offering, farm } = offeringOf(store, booking.offering_id);
    if (!(await fits(google, calendarId, booking, offering.capacity))) return { status: 'FAILED', outcome: null, error: SLOT_UNAVAILABLE };
    const held: Booking = { ...booking, status: 'HELD' };
    event = await google.insertEvent(calendarId, bookingToEvent(held, offering.name.en, farm.timezone));
  }
  saveBooking(store, booking, { status: bookingStatusFromEvent(event), calendar_event_id: event.id ?? null }, now());
  return { status: 'COMPLETED', outcome: { event_id: event.id ?? null }, error: null };
}

// The only code that writes `confirmed` (docs/contracts.md).
async function confirm(bookingId: string, { store, google, now }: Context): Promise<Outcome> {
  const calendarId = required(store, CALENDAR_ID_KEY, 'The booking calendar is not set up yet.');
  const booking = heldBooking(store, bookingId);
  const { offering, farm } = offeringOf(store, booking.offering_id);
  if (!(await fits(google, calendarId, booking, offering.capacity))) return { status: 'FAILED', outcome: null, error: SLOT_UNAVAILABLE };
  const confirmed: Booking = { ...booking, status: 'CONFIRMED' };
  const { status, attendees } = bookingToEvent(confirmed, offering.name.en, farm.timezone);
  await google.patchEvent(calendarId, booking.calendar_event_id!, { status, ...(attendees ? { attendees } : {}) }, Boolean(attendees));
  saveBooking(store, booking, { status: 'CONFIRMED', decided_at: now() }, now());
  return { status: 'COMPLETED', outcome: { invited: Boolean(attendees) }, error: null };
}

async function close(bookingId: string, reason: 'declined' | 'cancelled', { store, google, now }: Context): Promise<Outcome> {
  const calendarId = required(store, CALENDAR_ID_KEY, 'The booking calendar is not set up yet.');
  const booking = heldBooking(store, bookingId);
  const status = reason === 'declined' ? 'DECLINED' : 'CANCELLED';
  // Google tells a visitor who was already a guest; everyone else hears through the agent's reply.
  const wasGuest = booking.status === 'CONFIRMED' && booking.channel === 'EMAIL';
  const properties = bookingProperties({ ...booking, status });
  await google.patchEvent(calendarId, booking.calendar_event_id!, { status: 'cancelled', extendedProperties: { private: properties } }, wasGuest);
  saveBooking(store, booking, { status, decided_at: now() }, now());
  return { status: 'COMPLETED', outcome: null, error: null };
}

async function sendEmail(action: Extract<Action, { type: 'send_email' }>, entry: OutboxEntry, { google }: Context): Promise<Outcome> {
  // An earlier attempt may have sent the message before its response was lost.
  if (entry.attempts > 0 && (await google.sentInThreadSince(action.thread_id, entry.queuedAt))) {
    return { status: 'COMPLETED', outcome: { found_in_thread: true }, error: null };
  }
  const raw = buildReply({ to: action.to, subject: action.subject, inReplyTo: action.in_reply_to, references: action.references, text: action.text });
  const messageId = await google.sendEmail(action.thread_id, raw);
  return { status: 'COMPLETED', outcome: { message_id: messageId }, error: null };
}

async function saveProfile(profile: FarmProfile, { store, google }: Context): Promise<Outcome> {
  const spreadsheetId = required(store, SPREADSHEET_ID_KEY, 'The business spreadsheet is not set up yet.');
  await google.writeFarmRow(spreadsheetId, toRow('Farm', profile));
  store.upsert('Farm', profile);
  store.setMeta(FARM_ID_KEY, profile.id);
  return { status: 'COMPLETED', outcome: null, error: null };
}

// Reads events changed since the last sync, so a status Noor sets in Google Calendar wins.
async function pullBookings({ store, google, now }: Context): Promise<number> {
  const calendarId = store.getMeta(CALENDAR_ID_KEY);
  if (!calendarId) return 0;
  const startedAt = now();
  const since = store.getMeta(LAST_SYNC_KEY) ?? new Date(Date.parse(startedAt) - 86_400_000).toISOString();
  let pulled = 0;
  for (const event of await google.listChangedEvents(calendarId, since)) {
    const parsed = safeProperties(event);
    if (!parsed) continue;
    const booking = store.get<Booking>('Bookings', parsed.booking_id);
    const status = bookingStatusFromEvent(event);
    if (booking && booking.status !== status) {
      saveBooking(store, booking, { status, calendar_event_id: event.id ?? booking.calendar_event_id }, startedAt);
      pulled++;
    }
  }
  store.setMeta(LAST_SYNC_KEY, startedAt);
  return pulled;
}

async function fits(google: GoogleApi, calendarId: string, booking: Booking, capacity: number): Promise<boolean> {
  const taken = (await google.listEvents(calendarId, booking.slot_start, booking.slot_end))
    .filter((event) => event.status !== 'cancelled')
    .filter((event) => {
      const properties = safeProperties(event);
      return properties && properties.offering_id === booking.offering_id && properties.booking_id !== booking.id;
    })
    .reduce((sum, event) => sum + partySize(event), 0);
  return taken + booking.party_size <= capacity;
}

function offeringOf(store: LocalStore, offeringId: string) {
  const farmId = store.getMeta(FARM_ID_KEY);
  const farm = farmId ? store.get<FarmProfile>('Farm', farmId) : null;
  const offering = farm?.offerings.find((o) => o.id === offeringId);
  if (!farm || !offering) throw new NotRunnable(`No offering ${offeringId} in the approved farm profile.`);
  return { farm, offering };
}

function heldBooking(store: LocalStore, bookingId: string): Booking {
  const booking = store.get<Booking>('Bookings', bookingId);
  if (!booking?.calendar_event_id) throw new NotRunnable(`Booking ${bookingId} has no calendar event to change.`);
  return booking;
}

function saveBooking(store: LocalStore, booking: Booking, change: Partial<Booking>, at: string): void {
  store.upsert('Bookings', { ...booking, ...change, version: booking.version + 1, updated_at: at });
}

function safeProperties(event: CalendarEvent) {
  try {
    return eventProperties(event);
  } catch {
    return null;
  }
}

function required(store: LocalStore, key: string, missing: string): string {
  const value = store.getMeta(key);
  if (!value) throw new Error(missing);
  return value;
}

function receipt(action: Action, result: Outcome, at: string): ActionReceipt {
  return {
    id: action.id,
    version: 0,
    created_at: at,
    updated_at: at,
    type: action.type,
    approved_by: action.approved_by,
    approved_at: action.approved_at,
    ...result,
  };
}

// Retries on a timer instead of watching network state: a failed attempt costs one request,
// and the queue drains within one interval of the phone getting a signal.
export function startSyncLoop(
  store: LocalStore,
  google: GoogleApi,
  onResult: (result: SyncResult) => void,
  intervalMs = 30_000,
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      onResult(await syncOnce(store, google, () => new Date().toISOString()));
    } finally {
      running = false;
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
