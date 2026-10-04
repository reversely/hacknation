import { z } from 'zod';

// Record schemas (docs/contracts.md). The Farm record is the one row in the business
// spreadsheet; the phone keeps the other records in SQLite, and bookings also live as calendar
// events (calendar.ts). Every record carries a stable string ID and a version. The phone
// generates IDs offline, so an ID is also the deduplication key when a queued write runs twice.

export const Id = z.string().uuid();
export const Timestamp = z.string().datetime({ offset: true });
export const Version = z.number().int().nonnegative();
export const Language = z.enum(['en', 'sw', 'ki', 'other']);
export const Channel = z.enum(['WHATSAPP', 'EMAIL']);

const recordBase = {
  id: Id,
  version: Version,
  created_at: Timestamp,
  updated_at: Timestamp,
};

const Localized = z.object({ en: z.string(), sw: z.string() });

export const Offering = z.object({
  id: Id,
  name: Localized,
  description: Localized,
  duration_minutes: z.number().int().positive(),
  price: z.object({ amount: z.number().nonnegative(), currency: z.string().length(3) }),
  capacity: z.number().int().positive(),
});

// The operator approves the profile before anything public reads it.
export const FarmProfile = z.object({
  ...recordBase,
  status: z.enum(['DRAFT', 'APPROVED']),
  approved_at: Timestamp.nullable(),
  name: z.string().min(1),
  description: Localized,
  offerings: z.array(Offering),
  meeting_instructions: Localized,
  policies: Localized,
  whatsapp_number: z.string().regex(/^\+[1-9]\d{6,14}$/, 'E.164 phone number'),
  email: z.string().email().nullable(),
  timezone: z.string(),
  // The Website Creator's copy and presentation choices (docs/website-creator.md). Appended last
  // so a row written before the field existed still reads, with the missing cell as null.
  page: z.record(z.string(), z.unknown()).nullable().default(null),
});

export const BookingStatus = z.enum([
  'REQUESTED',
  'NEEDS_INFORMATION',
  'HELD',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED',
]);

export const ActionStatus = z.enum([
  'DRAFT',
  'AWAITING_APPROVAL',
  'APPROVED',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'NEEDS_REVIEW',
]);

// Fields the model extracts from a visitor's message. Null means the message did not say;
// the agent asks for missing fields instead of guessing them.
export const ExtractedRequest = z.object({
  intent: z.enum(['BOOKING', 'QUESTION', 'CHANGE', 'CANCELLATION', 'REFUND', 'FEEDBACK', 'OTHER']),
  offering_id: Id.nullable(),
  requested_date: z.string().date().nullable(),
  requested_time: z.string().time().nullable(),
  party_size: z.number().int().positive().nullable(),
  missing: z.array(z.string()),
});

export const Enquiry = z.object({
  ...recordBase,
  source: Channel,
  thread_id: z.string(),
  customer_name: z.string().nullable(),
  customer_contact: z.string(),
  language: Language,
  original_text: z.string(),
  extracted: ExtractedRequest.nullable(),
  status: z.enum(['NEW', 'EXTRACTED', 'ANSWERED', 'NEEDS_INFORMATION', 'CLOSED']),
});

export const Booking = z.object({
  ...recordBase,
  enquiry_id: Id,
  offering_id: Id,
  calendar_event_id: z.string().nullable(),
  slot_start: Timestamp,
  slot_end: Timestamp,
  party_size: z.number().int().positive(),
  customer_name: z.string().nullable(),
  customer_contact: z.string(),
  channel: Channel,
  status: BookingStatus,
  decided_at: Timestamp.nullable(),
});

// Inbound messages are stored on arrival; outbound messages carry approval and delivery status
// separately, because a saved booking does not imply a sent message.
export const Message = z.object({
  ...recordBase,
  channel: Channel,
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  thread_id: z.string(),
  external_id: z.string().nullable(),
  enquiry_id: Id.nullable(),
  contact: z.string(),
  text: z.string(),
  text_for_operator: z.string().nullable(),
  delivery_status: ActionStatus.nullable(),
});

export const Feedback = z.object({
  ...recordBase,
  booking_id: Id.nullable(),
  source: z.enum(['WHATSAPP', 'EMAIL', 'GOOGLE', 'FACEBOOK', 'IN_PERSON']),
  original_text: z.string(),
  language: Language,
  analysis: z.record(z.string(), z.unknown()).nullable(),
});

export const ActionReceipt = z.object({
  ...recordBase,
  type: z.string(),
  approved_by: z.enum(['OPERATOR', 'POLICY']),
  approved_at: Timestamp,
  status: ActionStatus,
  outcome: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
});

// The business spreadsheet's tabs and their row schemas.
export const SHEET_TABS = {
  Farm: FarmProfile,
} as const;

// The record kinds the phone keeps in SQLite.
export const LOCAL_RECORDS = {
  Farm: FarmProfile,
  Enquiries: Enquiry,
  Bookings: Booking,
  Messages: Message,
  Feedback: Feedback,
} as const;

export type SheetTab = keyof typeof SHEET_TABS;
export type RecordKind = keyof typeof LOCAL_RECORDS;
export type FarmProfile = z.infer<typeof FarmProfile>;
export type Offering = z.infer<typeof Offering>;
export type Enquiry = z.infer<typeof Enquiry>;
export type ExtractedRequest = z.infer<typeof ExtractedRequest>;
export type Booking = z.infer<typeof Booking>;
export type BookingStatus = z.infer<typeof BookingStatus>;
export type Message = z.infer<typeof Message>;
export type Feedback = z.infer<typeof Feedback>;
export type ActionReceipt = z.infer<typeof ActionReceipt>;
export type ActionStatus = z.infer<typeof ActionStatus>;
