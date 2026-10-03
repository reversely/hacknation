import { z } from 'zod';

import {
  ActionReceipt,
  Booking,
  Enquiry,
  FarmProfile,
  Id,
  Message,
  Timestamp,
  Version,
} from './records';

// API route contracts for the Next.js backend on Vercel (docs/contracts.md, "API routes").
// The phone authenticates with `Authorization: Bearer <device token>`; WhatsApp webhooks
// authenticate with Meta's X-Hub-Signature-256 header instead.

export const ErrorResponse = z.object({
  error: z.object({
    code: z.enum([
      'UNAUTHORIZED',
      'INVALID_REQUEST',
      'NOT_FOUND',
      'VERSION_CONFLICT',
      'SLOT_UNAVAILABLE',
      'UPSTREAM_FAILED',
    ]),
    message: z.string(),
  }),
});

// GET /api/health: the setup wizard's connection check for each hosted service.
export const HealthResponse = z.object({
  server_time: Timestamp,
  services: z.object({
    sheets: z.enum(['OK', 'NOT_CONFIGURED', 'FAILED']),
    calendar: z.enum(['OK', 'NOT_CONFIGURED', 'FAILED']),
    whatsapp: z.enum(['OK', 'NOT_CONFIGURED', 'FAILED']),
  }),
});

// GET /api/profile: public, unauthenticated. Only approved public fields; never contacts
// of visitors, spreadsheet IDs or credentials.
export const PublicProfileResponse = FarmProfile.pick({
  name: true,
  description: true,
  offerings: true,
  meeting_instructions: true,
  policies: true,
  whatsapp_number: true,
  version: true,
});

// GET /api/sync?since=<timestamp>: records changed on the server after `since`.
// The phone stores `server_time` and sends it as `since` next time.
export const SyncQuery = z.object({ since: Timestamp.optional() });
export const SyncResponse = z.object({
  server_time: Timestamp,
  messages: z.array(Message),
  enquiries: z.array(Enquiry),
  bookings: z.array(Booking),
  profile: FarmProfile.nullable(),
});

// POST /api/actions: the phone's offline queue replays approved actions here.
// `id` is the idempotency key: a repeated id returns the stored receipt without acting again.
// `approved_at` records the operator's approval on the phone; the server refuses actions
// that need operator approval and arrive without it.
const actionBase = {
  id: Id,
  approved_by: z.enum(['OPERATOR', 'POLICY']),
  approved_at: Timestamp,
};

export const Action = z.discriminatedUnion('type', [
  z.object({
    ...actionBase,
    type: z.literal('save_profile'),
    profile: FarmProfile,
  }),
  z.object({
    ...actionBase,
    type: z.literal('record_enquiry'),
    enquiry: Enquiry,
  }),
  // Interim replies (POLICY) may only answer from the approved profile or give the
  // slot-held notice; every other outbound text needs OPERATOR approval.
  z.object({
    ...actionBase,
    type: z.literal('send_whatsapp'),
    message: Message,
  }),
  // Creates a tentative Calendar event and a HELD booking. A hold is not a confirmation.
  z.object({
    ...actionBase,
    type: z.literal('hold_slot'),
    booking: Booking,
  }),
  // The booking module is the only code that writes CONFIRMED. It rechecks the Calendar
  // slot and the expected version before writing.
  z.object({
    ...actionBase,
    approved_by: z.literal('OPERATOR'),
    type: z.literal('confirm_booking'),
    booking_id: Id,
    expected_version: Version,
  }),
  z.object({
    ...actionBase,
    approved_by: z.literal('OPERATOR'),
    type: z.literal('decline_booking'),
    booking_id: Id,
    expected_version: Version,
    reason: z.string(),
  }),
]);

export const ActionsRequest = z.object({ actions: z.array(Action).min(1).max(50) });
export const ActionsResponse = z.object({ receipts: z.array(ActionReceipt) });

// GET /api/whatsapp/webhook: Meta's verification handshake (hub.mode, hub.verify_token,
// hub.challenge). POST /api/whatsapp/webhook: Meta's message payload, signature-checked and
// stored as INBOUND Message rows; its schema is Meta's, not ours.

export type ErrorResponse = z.infer<typeof ErrorResponse>;
export type HealthResponse = z.infer<typeof HealthResponse>;
export type PublicProfileResponse = z.infer<typeof PublicProfileResponse>;
export type SyncResponse = z.infer<typeof SyncResponse>;
export type Action = z.infer<typeof Action>;
export type ActionsRequest = z.infer<typeof ActionsRequest>;
export type ActionsResponse = z.infer<typeof ActionsResponse>;
