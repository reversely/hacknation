# Bookings

Customer Management records each tour booking as one event on a Google calendar that Wren creates
in Noor's account. A visitor's request becomes a tentative hold, and Noor confirms or declines every
hold in the weekly review. This file specifies the calendar, the event format and the calls the
phone makes. `docs/architecture.md` sections 6 and 7 give the design, and `docs/contracts.md` gives
the record schema.

## Conventions

- **Slot:** one start and end time for one offering on one day.
- **Hold:** a `tentative` event that reserves places in a slot until Noor decides.
- **Party size:** the number of visitors in one booking.
- **Capacity:** the most visitors one slot takes, from the offering's `capacity` in the Farm record.
- **Booking ID:** a UUID the phone generates offline. It serves as the idempotency key for every
  call below.
- Times use RFC 3339 with an offset, in the Farm record's `timezone`.
- Every call goes to `https://www.googleapis.com/calendar/v3` with Noor's access token
  (`docs/google-access.md`).

## The calendar

Onboarding step 6 creates the calendar once:

```http
POST /calendars
{ "summary": "Wren tours", "timeZone": "<Farm.timezone>" }
```

The app saves the returned `id` as `calendar_id` in its SQLite meta table. The
`calendar.app.created` scope lets the app read and write this calendar and no other calendar of
Noor's.

## Event format

| Field | Value |
| --- | --- |
| `summary` | `<offering name>: <party size> (<visitor name>)`, for example `Coffee walk: 3 (Amina)` |
| `description` | The visitor's original request and its channel |
| `start`, `end` | The slot, as `dateTime` with `timeZone` |
| `status` | `tentative`, `confirmed` or `cancelled` (table below) |
| `attendees` | Empty until confirmation; then the visitor, when the visitor gave an email address |
| `extendedProperties.private` | `booking_id`, `enquiry_id`, `offering_id`, `party_size`, `channel` (`email` or `whatsapp`), `contact`, and `closed_reason` (`declined` or `cancelled`) once closed |

Extended property values travel as strings, so the phone writes `party_size` as `"3"` and parses it
on read.

| Booking state | Event |
| --- | --- |
| `REQUESTED`, `NEEDS_INFORMATION` | No event; SQLite holds the enquiry |
| `HELD` | `status: tentative` |
| `CONFIRMED` | `status: confirmed`, visitor invited when an email address exists |
| `DECLINED` | `status: cancelled`, `closed_reason: declined` |
| `CANCELLED` | `status: cancelled`, `closed_reason: cancelled` |

## Operations

### Capacity check

```http
GET /calendars/{calendar_id}/events?timeMin=<slot start>&timeMax=<slot end>&singleEvents=true
```

The phone adds up `party_size` over the returned `tentative` and `confirmed` events with the same
`offering_id`, leaving out the booking being checked. The booking fits when that sum plus its own
party size stays within capacity.

### Hold

1. Look for an event that already carries the booking ID:
   `GET /calendars/{calendar_id}/events?privateExtendedProperty=booking_id%3D<id>&showDeleted=true`.
   When one exists, the hold already happened; skip to step 4.
2. Run the capacity check. When the slot is full, the agent drafts a reply offering the next free
   slot instead, and no event is written.
3. `POST /calendars/{calendar_id}/events?sendUpdates=none` with `status: tentative`.
4. Release the queued slot-held reply to the visitor (`docs/messaging.md`).

The slot-held reply waits in the outbox behind its hold, so a visitor never hears "held" for a slot
the calendar refused.

### Confirmation

Only an operator approval from the weekly review starts a confirmation; the contract schema rejects
a policy approval.

1. Rerun the capacity check.
2. `PATCH /calendars/{calendar_id}/events/{eventId}?sendUpdates=all` with `status: confirmed` and,
   for an email booking, `attendees: [{ "email": "<contact>" }]`. Google then emails the visitor an
   invitation from Noor's account.
3. For a WhatsApp booking, use `sendUpdates=none` and have the agent draft the confirmation for
   `wa.me` (`docs/messaging.md`).

### Decline and cancellation

`PATCH /calendars/{calendar_id}/events/{eventId}` with `status: cancelled` and `closed_reason`.
`sendUpdates=all` applies when the visitor was already a guest, so Google tells the visitor;
otherwise `sendUpdates=none`, and the agent drafts the message on the visitor's channel.

### Weekly review queue

```http
GET /calendars/{calendar_id}/events?timeMin=<now>&singleEvents=true
```

Every `tentative` event in the result becomes one review item, shown to Noor in Kiswahili with the
visitor's original request beside it.

## Offline behaviour and manual edits

Each operation above runs as an outbox action (`docs/contracts.md`, Actions) and waits for a
connection. A hold or confirmation recorded offline reserves nothing until the call succeeds; the
interface shows it as pending.

Noor can also edit the calendar in the Google Calendar app. On each sync the phone reads the events
back, and a status set in Google Calendar overrides the phone's copy. The activity log records the
change.
