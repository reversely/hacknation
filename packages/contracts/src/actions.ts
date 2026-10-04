import { z } from 'zod';

import { Booking, FarmProfile, Id, Timestamp } from './records';

// Approved actions in the phone's outbox (docs/contracts.md, "Actions"). The phone runs each one
// against Google when connected. `id` is the idempotency key.

const actionBase = {
  id: Id,
  approved_by: z.enum(['OPERATOR', 'POLICY']),
  approved_at: Timestamp,
};

// Header values go into a raw RFC 2822 message, so a line break would let a value add headers.
const HeaderValue = z.string().regex(/^[^\r\n]*$/, 'no line breaks in a header value');

export const Action = z.discriminatedUnion('type', [
  z.object({
    ...actionBase,
    type: z.literal('save_profile'),
    profile: FarmProfile,
  }),
  // Interim replies (POLICY) may only answer from the approved profile or give the slot-held
  // notice; every other text needs OPERATOR approval.
  z.object({
    ...actionBase,
    type: z.literal('send_email'),
    enquiry_id: Id,
    thread_id: z.string().min(1),
    to: z.string().email(),
    subject: HeaderValue,
    in_reply_to: HeaderValue,
    references: HeaderValue,
    text: z.string().min(1),
  }),
  // Runs from the screen: the app opens wa.me and Noor presses Send. The outbox never holds it.
  z.object({
    ...actionBase,
    type: z.literal('open_whatsapp_draft'),
    enquiry_id: Id,
    phone_digits: z.string().regex(/^[1-9]\d{6,14}$/).nullable(),
    text: z.string().min(1),
  }),
  // Creates a tentative event. A hold is not a confirmation.
  z.object({
    ...actionBase,
    type: z.literal('hold_slot'),
    booking: Booking,
  }),
  // The booking module is the only code that writes `confirmed`, after rechecking capacity.
  z.object({
    ...actionBase,
    approved_by: z.literal('OPERATOR'),
    type: z.literal('confirm_booking'),
    booking_id: Id,
  }),
  z.object({
    ...actionBase,
    approved_by: z.literal('OPERATOR'),
    type: z.literal('decline_booking'),
    booking_id: Id,
    closed_reason: z.enum(['declined', 'cancelled']),
  }),
]);

export type Action = z.infer<typeof Action>;
