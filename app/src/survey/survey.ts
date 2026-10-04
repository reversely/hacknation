import { z } from 'zod';

// The setup survey (the onboarding mockup: business, services, availability, review). Every answer
// is a structured field except a few free-text ones, which the translation model renders into the
// site's other language. Labels for fixed choices come from the tables below, never from a model.
// Kiswahili wording needs review by a native speaker.

export const LANGUAGES = ['en', 'sw'] as const;
export type Language = (typeof LANGUAGES)[number];
export type Bilingual = Record<Language, string>;

export const SERVICE_TYPES = {
  guided_tour: { en: 'Guided tour', sw: 'Ziara ya kuongozwa' },
  hands_on_workshop: { en: 'Hands-on workshop', sw: 'Warsha ya vitendo' },
  outdoor_recreation: { en: 'Outdoor recreation', sw: 'Burudani ya nje' },
  introductory_consultation: { en: 'Introductory consultation', sw: 'Ushauri wa awali' },
  appointment_treatment: { en: 'Appointment or treatment', sw: 'Miadi au matibabu' },
} as const satisfies Record<string, Bilingual>;
export type ServiceType = keyof typeof SERVICE_TYPES | 'custom';

export const DAYS = {
  monday: { en: 'Monday', sw: 'Jumatatu' },
  tuesday: { en: 'Tuesday', sw: 'Jumanne' },
  wednesday: { en: 'Wednesday', sw: 'Jumatano' },
  thursday: { en: 'Thursday', sw: 'Alhamisi' },
  friday: { en: 'Friday', sw: 'Ijumaa' },
  saturday: { en: 'Saturday', sw: 'Jumamosi' },
  sunday: { en: 'Sunday', sw: 'Jumapili' },
} as const satisfies Record<string, Bilingual>;
export type Day = keyof typeof DAYS;

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
const FreeText = z.string().trim().min(1).max(300);

export const Service = z
  .object({
    type: z.enum([...(Object.keys(SERVICE_TYPES) as [keyof typeof SERVICE_TYPES]), 'custom']),
    // Free text, in the operator's language: the name when the type is "custom", and an optional
    // sentence about the service.
    custom_name: FreeText.max(60).optional(),
    description: FreeText.optional(),
    duration_minutes: z.number().int().min(10).max(24 * 60),
    price: z.object({ amount: z.number().nonnegative().max(1_000_000), currency: z.string().length(3) }),
    capacity: z.number().int().min(1).max(500),
  })
  .refine((s) => s.type !== 'custom' || Boolean(s.custom_name), { message: 'A custom service needs a name', path: ['custom_name'] });
export type Service = z.infer<typeof Service>;

export const Survey = z.object({
  // The language the operator answered in; the site shows it and English.
  language: z.enum(LANGUAGES),
  business: z.object({
    name: z.string().trim().min(1).max(80),
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'E.164 phone number'),
    location: FreeText.max(120).optional(),
    description: FreeText.optional(),
  }),
  photos: z.array(z.string()).max(8).default([]),
  services: z.array(Service).min(1).max(5),
  availability: z.object({
    days: z.array(z.enum(Object.keys(DAYS) as [Day, ...Day[]])).min(1),
    slots: z
      .array(z.object({ start: Clock, end: Clock }).refine((s) => s.start < s.end, 'A time slot ends after it starts'))
      .min(1),
  }),
});
export type Survey = z.infer<typeof Survey>;
