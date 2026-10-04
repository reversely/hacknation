import type { CalendarEvent, Cell } from '@wren/contracts';

// The Google calls the outbox makes (docs/bookings.md, docs/messaging.md). Tests swap in a fake
// with the same shape.
export type GoogleApi = {
  findEvent(calendarId: string, bookingId: string): Promise<CalendarEvent | null>;
  listEvents(calendarId: string, timeMin: string, timeMax: string): Promise<CalendarEvent[]>;
  // Events changed after `updatedMin`, including cancelled ones, so edits made in Google Calendar
  // reach the phone.
  listChangedEvents(calendarId: string, updatedMin: string): Promise<CalendarEvent[]>;
  insertEvent(calendarId: string, event: CalendarEvent): Promise<CalendarEvent>;
  patchEvent(calendarId: string, eventId: string, patch: Partial<CalendarEvent>, notifyGuests: boolean): Promise<CalendarEvent>;
  sendEmail(threadId: string, raw: string): Promise<string>;
  sentInThreadSince(threadId: string, since: string): Promise<boolean>;
  writeFarmRow(spreadsheetId: string, row: Cell[]): Promise<void>;
};

// A rejected call that should not be retried as it stands (a 400 or 403 from Google), as opposed to
// a network failure or a 401, 429 or 5xx, which the outbox retries later.
export class GoogleRejected extends Error {}

const CALENDAR = 'https://www.googleapis.com/calendar/v3';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

export function googleApi(accessToken: () => Promise<string>): GoogleApi {
  async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (response.ok) return (await response.json()) as T;
    const detail = `${init.method ?? 'GET'} ${new URL(url).pathname} returned HTTP ${response.status}`;
    if (response.status === 401 || response.status === 429 || response.status >= 500) throw new Error(detail);
    throw new GoogleRejected(detail);
  }
  const events = (calendarId: string) => `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events`;
  const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

  return {
    async findEvent(calendarId, bookingId) {
      const q = query({ privateExtendedProperty: `booking_id=${bookingId}`, showDeleted: 'true', maxResults: '1' });
      const page = await call<{ items?: CalendarEvent[] }>(`${events(calendarId)}?${q}`);
      return page.items?.[0] ?? null;
    },
    async listEvents(calendarId, timeMin, timeMax) {
      const q = query({ timeMin, timeMax, singleEvents: 'true' });
      return (await call<{ items?: CalendarEvent[] }>(`${events(calendarId)}?${q}`)).items ?? [];
    },
    async listChangedEvents(calendarId, updatedMin) {
      const q = query({ updatedMin, showDeleted: 'true', singleEvents: 'true' });
      return (await call<{ items?: CalendarEvent[] }>(`${events(calendarId)}?${q}`)).items ?? [];
    },
    insertEvent: (calendarId, event) =>
      call<CalendarEvent>(`${events(calendarId)}?sendUpdates=none`, { method: 'POST', body: JSON.stringify(event) }),
    patchEvent: (calendarId, eventId, patch, notifyGuests) =>
      call<CalendarEvent>(`${events(calendarId)}/${encodeURIComponent(eventId)}?sendUpdates=${notifyGuests ? 'all' : 'none'}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    async sendEmail(threadId, raw) {
      return (await call<{ id: string }>(`${GMAIL}/messages/send`, { method: 'POST', body: JSON.stringify({ threadId, raw }) })).id;
    },
    async sentInThreadSince(threadId, since) {
      const thread = await call<{ messages?: { labelIds?: string[]; internalDate: string }[] }>(
        `${GMAIL}/threads/${encodeURIComponent(threadId)}?format=minimal`,
      );
      const after = Date.parse(since);
      return (thread.messages ?? []).some((m) => m.labelIds?.includes('SENT') && Number(m.internalDate) >= after);
    },
    async writeFarmRow(spreadsheetId, row) {
      // Row 1 holds the column headers; the one Farm record lives in row 2.
      await call(`${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/Farm!A2?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ values: [row] }),
      });
    },
  };
}

export type ReplyFields = { to: string; subject: string; inReplyTo: string; references: string; text: string };

// Builds the RFC 2822 reply that Gmail threads with the visitor's message, base64url-encoded for
// the API's `raw` field. The contract schema already rejects line breaks in header values.
export function buildReply({ to, subject, inReplyTo, references, text }: ReplyFields): string {
  const reSubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const message = [
    `To: ${to}`,
    `Subject: ${encodeHeader(reSubject)}`,
    `In-Reply-To: ${inReplyTo}`,
    `References: ${[references, inReplyTo].filter(Boolean).join(' ')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64(new TextEncoder().encode(text)),
  ].join('\r\n');
  return base64(new TextEncoder().encode(message)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 2047 encoded word, so a Kiswahili or accented subject survives.
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${base64(new TextEncoder().encode(value))}?=`;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Hermes has no Buffer, so bytes are encoded by hand.
function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '=';
  }
  return out;
}
