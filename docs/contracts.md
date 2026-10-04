# Record contracts

The Coordinator publishes these contracts so the Website Creator, Search and Social, and Customer
Management agents build against one record format (`docs/architecture.md` sections 7 and 11). The
zod schemas in `packages/contracts/src` are the source of truth; this file explains them. The phone
validates every record with `@noor/contracts` before writing it to Google.

Records live in Noor's Google account: the farm profile in the Farm tab of the business
spreadsheet, bookings in the "Wren tours" calendar, and email in Gmail. No API server sits between
the phone and Google. `packages/contracts` still defines six tabs and the former Vercel API schemas
until #34 trims it to this file.

## Conventions

- **IDs:** every record has a UUID `id`. The phone generates IDs offline, and the backend treats a
  repeated ID as the same record. Row numbers are never identifiers.
- **Versions:** every record has an integer `version`, starting at 0 and increased by one on each
  write. A write that names an `expected_version` fails with `VERSION_CONFLICT` when the stored
  version differs.
- **Timestamps:** ISO 8601 with an offset, for example `2026-10-10T09:00:00+03:00`.
- **Languages:** `en` English, `sw` Kiswahili, `ki` Kikuyu, `other`.
- **Phone numbers:** E.164, for example `+254712345678`.
- **Null:** a field that is unknown is `null`. The agent asks for a missing booking detail
  instead of filling it in.

## Farm tab

The business spreadsheet holds one tab, Farm. Columns follow the schema's field order
(`columns(tab)` in `packages/contracts/src/rows.ts`). Object and array fields are stored as JSON
text in one cell, and `null` as an empty cell. `toRow` and `fromRow` convert between records and
rows and reject a row that fails validation.

Fields after `id`, `version`, `created_at`, `updated_at`: `status`, `approved_at`, `name`,
`description`, `offerings`, `meeting_instructions`, `policies`, `whatsapp_number`, `email`,
`timezone`. The Apps Script web app and the listings read only an `APPROVED` row.

`description`, `meeting_instructions` and `policies` hold an English and a Kiswahili text. Each
offering in `offerings` has a name, description, duration, price with a currency code, and capacity.

## Bookings on the calendar

Each booking is one event on the "Wren tours" calendar. The event's private extended properties
carry `booking_id`, `enquiry_id`, `offering_id`, `party_size`, `channel` (`email` or `whatsapp`)
and `contact`. The event's start and end are the slot.

| Booking state | Event status | Guests |
| --- | --- | --- |
| `HELD` | `tentative` | None |
| `CONFIRMED` | `confirmed` | The visitor, when the visitor gave an email address, invited with `sendUpdates=all` |
| `DECLINED`, `CANCELLED` | `cancelled` | Unchanged |

`REQUESTED` and `NEEDS_INFORMATION` have no event; the phone keeps them in SQLite.

## Records on the phone

SQLite keeps enquiries, shared WhatsApp messages, drafts and the activity log. The `extracted`
field of an enquiry holds `intent` (`BOOKING`, `QUESTION`, `CHANGE`,
`CANCELLATION`, `REFUND`, `FEEDBACK`, `OTHER`), `offering_id`, `requested_date`, `requested_time`,
`party_size`, and `missing`, the list of details the visitor has not given yet.

### States

- **Booking:** `REQUESTED`, `NEEDS_INFORMATION`, `HELD`, `CONFIRMED`, `DECLINED`, `CANCELLED`.
- **Enquiry:** `NEW`, `EXTRACTED`, `ANSWERED`, `NEEDS_INFORMATION`, `CLOSED`.
- **Outgoing action and message delivery:** `DRAFT`, `AWAITING_APPROVAL`, `APPROVED`, `QUEUED`,
  `PROCESSING`, `COMPLETED`, `FAILED`, `NEEDS_REVIEW`.

A message keeps its delivery status apart from the booking status, so the app can show a confirmed
booking whose confirmation message failed to send.

## Actions

The phone's outbox holds approved actions and runs each one against Google when connected. Each
action carries an `id`, `approved_by` and `approved_at`. The `id` is the idempotency key: before
writing, the phone looks for an event or sent message carrying that ID and skips the action when
one exists.

| Type | Effect | Approval |
| --- | --- | --- |
| `save_profile` | Writes the Farm row | Operator for an `APPROVED` profile |
| `send_email` | Sends a Gmail reply in the visitor's thread | Policy for an answer from the approved profile or the slot-held notice; operator for any other text |
| `open_whatsapp_draft` | Opens `wa.me` with the approved text; Noor sends it | Policy for an answer from the approved profile or the slot-held notice; operator for any other text |
| `hold_slot` | Checks capacity, then creates a `tentative` event | Policy |
| `confirm_booking` | Rechecks capacity, sets the event to `confirmed`, invites the visitor by email | Operator only; the schema rejects `POLICY` |
| `decline_booking` | Sets the event to `cancelled` | Operator only |

The booking module behind `confirm_booking` is the only code that writes `confirmed`
(`docs/architecture.md` section 7). The schema enforces the operator-only rule for confirming and
declining.

## Changing a contract

Change the zod schema, run `bun test` in `packages/contracts`, and update this file in the same
commit. A nullable field appended at the end of the Farm schema keeps existing rows readable,
because `fromRow` reads a missing cell as `null`. Inserting, renaming or removing a field shifts the
columns, and the Farm tab then needs migrating.
