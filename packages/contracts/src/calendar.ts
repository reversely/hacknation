import { z } from 'zod';

import { Id, type Booking, type BookingStatus } from './records';

// Each booking is one event on the "Wren tours" calendar (docs/bookings.md). The event's status
// carries the booking state, and its private extended properties carry the booking's IDs.

export const BOOKING_CALENDAR_NAME = 'Wren tours';

export type EventStatus = 'tentative' | 'confirmed' | 'cancelled';

// The subset of the Calendar API's Event resource that Wren reads and writes.
export type CalendarEvent = {
  id?: string;
  status: EventStatus;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: { email: string }[];
  extendedProperties?: { private?: Record<string, string> };
};

// Extended property values are strings in the Calendar API, so party_size travels as digits.
export const BookingEventProperties = z.object({
  booking_id: Id,
  enquiry_id: Id,
  offering_id: Id,
  party_size: z.string().regex(/^[1-9]\d*$/),
  channel: z.enum(['email', 'whatsapp']),
  contact: z.string().min(1),
  closed_reason: z.enum(['declined', 'cancelled']).optional(),
});
export type BookingEventProperties = z.infer<typeof BookingEventProperties>;

const EVENT_STATE: Partial<Record<BookingStatus, { status: EventStatus; closed_reason?: 'declined' | 'cancelled' }>> = {
  HELD: { status: 'tentative' },
  CONFIRMED: { status: 'confirmed' },
  DECLINED: { status: 'cancelled', closed_reason: 'declined' },
  CANCELLED: { status: 'cancelled', closed_reason: 'cancelled' },
};

export function bookingProperties(booking: Booking): BookingEventProperties {
  const state = EVENT_STATE[booking.status];
  return BookingEventProperties.parse({
    booking_id: booking.id,
    enquiry_id: booking.enquiry_id,
    offering_id: booking.offering_id,
    party_size: String(booking.party_size),
    channel: booking.channel === 'EMAIL' ? 'email' : 'whatsapp',
    contact: booking.customer_contact,
    ...(state?.closed_reason ? { closed_reason: state.closed_reason } : {}),
  });
}

// REQUESTED and NEEDS_INFORMATION bookings have no event; asking for one is a programming error.
export function bookingToEvent(booking: Booking, offeringName: string, timeZone: string, description = ''): CalendarEvent {
  const state = EVENT_STATE[booking.status];
  if (!state) throw new Error(`A ${booking.status} booking has no calendar event.`);
  const visitor = booking.customer_name ?? booking.customer_contact;
  const inviteVisitor = booking.status === 'CONFIRMED' && booking.channel === 'EMAIL' && booking.customer_contact.includes('@');
  return {
    status: state.status,
    summary: `${offeringName}: ${booking.party_size} (${visitor})`,
    description,
    start: { dateTime: booking.slot_start, timeZone },
    end: { dateTime: booking.slot_end, timeZone },
    ...(inviteVisitor ? { attendees: [{ email: booking.customer_contact }] } : {}),
    extendedProperties: { private: bookingProperties(booking) },
  };
}

// Reads the booking state back from an event, including one Noor edited in Google Calendar.
export function bookingStatusFromEvent(event: CalendarEvent): BookingStatus {
  if (event.status === 'tentative') return 'HELD';
  if (event.status === 'confirmed') return 'CONFIRMED';
  return eventProperties(event).closed_reason === 'declined' ? 'DECLINED' : 'CANCELLED';
}

export function eventProperties(event: CalendarEvent): BookingEventProperties {
  return BookingEventProperties.parse(event.extendedProperties?.private ?? {});
}

export function partySize(event: CalendarEvent): number {
  return Number(eventProperties(event).party_size);
}
