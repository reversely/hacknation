# Sheets schema and API contracts

The Coordinator publishes these contracts so the Website Creator, Search and Social, and Customer
Management agents build against one record format and one set of API routes
(`docs/architecture.md` sections 7 and 11). The zod schemas in `packages/contracts/src` are the
source of truth; this file explains them. The phone app and the Vercel API both import
`@noor/contracts`, so a request that passes validation on one side passes on the other.

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

## Sheets tabs

One spreadsheet holds six tabs. Columns follow the schema's field order (`columns(tab)` in
`packages/contracts/src/rows.ts`). Object and array fields are stored as JSON text in one cell, and
`null` as an empty cell. `toRow` and `fromRow` convert between records and rows and reject a row
that fails validation.

| Tab | Holds | Fields after `id`, `version`, `created_at`, `updated_at` |
| --- | --- | --- |
| Farm | The farm profile; the public website and listings read only an `APPROVED` profile | `status`, `approved_at`, `name`, `description`, `offerings`, `meeting_instructions`, `policies`, `whatsapp_number`, `email`, `timezone` |
| Enquiries | One visitor request and the fields the model extracted from it | `source`, `thread_id`, `customer_name`, `customer_contact`, `language`, `original_text`, `extracted`, `status` |
| Bookings | A requested tour slot and its Calendar event | `enquiry_id`, `offering_id`, `calendar_event_id`, `slot_start`, `slot_end`, `party_size`, `customer_name`, `customer_contact`, `channel`, `status`, `decided_at` |
| Messages | Every inbound and outbound WhatsApp or email message | `channel`, `direction`, `thread_id`, `external_id`, `enquiry_id`, `contact`, `text`, `text_for_operator`, `delivery_status` |
| Feedback | A visitor comment and its analysis | `booking_id`, `source`, `original_text`, `language`, `analysis` |
| Actions | A receipt for every action the backend executed | `type`, `approved_by`, `approved_at`, `status`, `outcome`, `error` |

`description`, `meeting_instructions` and `policies` hold an English and a Kiswahili text. Each
offering in `offerings` has a name, description, duration, price with a currency code, and capacity.

The `extracted` field of an enquiry holds `intent` (`BOOKING`, `QUESTION`, `CHANGE`,
`CANCELLATION`, `REFUND`, `FEEDBACK`, `OTHER`), `offering_id`, `requested_date`, `requested_time`,
`party_size`, and `missing`, the list of details the visitor has not given yet.

### States

- **Booking:** `REQUESTED`, `NEEDS_INFORMATION`, `HELD`, `CONFIRMED`, `DECLINED`, `CANCELLED`.
- **Enquiry:** `NEW`, `EXTRACTED`, `ANSWERED`, `NEEDS_INFORMATION`, `CLOSED`.
- **Outgoing action and message delivery:** `DRAFT`, `AWAITING_APPROVAL`, `APPROVED`, `QUEUED`,
  `PROCESSING`, `COMPLETED`, `FAILED`, `NEEDS_REVIEW`.

A message keeps its delivery status apart from the booking status, so the app can show a confirmed
booking whose confirmation message failed to send.

## API routes

The Next.js backend on Vercel serves these routes. The phone sends
`Authorization: Bearer <device token>` on every route except the public profile and the WhatsApp
webhook. Errors return `{ "error": { "code", "message" } }` with one of the codes `UNAUTHORIZED`,
`INVALID_REQUEST`, `NOT_FOUND`, `VERSION_CONFLICT`, `SLOT_UNAVAILABLE`, `UPSTREAM_FAILED`.

| Route | Caller | Purpose | Schema |
| --- | --- | --- | --- |
| `GET /api/health` | Setup wizard | Reports `OK`, `NOT_CONFIGURED` or `FAILED` for Sheets, Calendar and WhatsApp | `HealthResponse` |
| `GET /api/profile` | Public website | Returns the approved profile's public fields only | `PublicProfileResponse` |
| `GET /api/sync?since=` | Phone | Returns messages, enquiries, bookings and the profile changed after `since`, plus `server_time` for the next call | `SyncResponse` |
| `POST /api/actions` | Phone offline queue | Executes up to 50 approved actions and returns one receipt each | `ActionsRequest`, `ActionsResponse` |
| `GET /api/whatsapp/webhook` | Meta | Answers Meta's verification handshake | Meta's format |
| `POST /api/whatsapp/webhook` | Meta | Checks `X-Hub-Signature-256`, then stores each message as an `INBOUND` Messages row | Meta's format |

Gmail is not behind this API. The phone reads and sends email with the operator's own Google
authorization (`docs/architecture.md` section 6).

### Actions

Each action carries an `id`, `approved_by` and `approved_at`. The `id` is the idempotency key: when
the offline queue sends the same action twice, the backend returns the stored receipt and does not
act again.

| Type | Effect | Approval |
| --- | --- | --- |
| `save_profile` | Writes the farm profile | Operator for an `APPROVED` profile |
| `record_enquiry` | Writes an enquiry with its extracted fields | Policy |
| `send_whatsapp` | Sends a WhatsApp message through the Cloud API and records its delivery status | Policy for an answer from the approved profile or the slot-held notice; operator for any other text |
| `hold_slot` | Creates a tentative Calendar event and a `HELD` booking | Policy |
| `confirm_booking` | Rechecks the Calendar slot and the booking version, then marks the event and the booking `CONFIRMED` | Operator only; the schema rejects `POLICY` |
| `decline_booking` | Releases the Calendar event and marks the booking `DECLINED` | Operator only |

The booking module behind `confirm_booking` is the only code that writes `CONFIRMED`
(`docs/architecture.md` section 7). The schema enforces the operator-only rule for confirming and
declining. The backend enforces the content rule for policy-approved WhatsApp text.

## Changing a contract

Change the zod schema, run `bun test` in `packages/contracts`, and update this file in the same
commit. A nullable field appended at the end of a schema keeps existing rows readable, because
`fromRow` reads a missing cell as `null`. Inserting, renaming or removing a field shifts the
columns, and the spreadsheet then needs migrating.
