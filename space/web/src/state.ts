// The survey draft the screens fill in. It becomes a `Survey` (app/src/survey/survey.ts) when the
// operator creates the site; every value comes from a form control (docs/space.md, Phone panel).

import type { Day, Language, ServiceType } from '../../../app/src/survey/survey';

export type DraftService = { type: ServiceType | ''; customName: string; description: string; hours: number; minutes: number; price: string; capacity: string };
export type DraftSlot = { start: string; end: string };

export type State = {
  language: Language;
  name: string;
  phone: string;
  location: string;
  about: string;
  photos: string[];
  services: DraftService[];
  days: Day[];
  slots: DraftSlot[];
  currency: string;
};

export const newService = (): DraftService => ({ type: '', customName: '', description: '', hours: 1, minutes: 0, price: '', capacity: '' });

export const initialState = (): State => ({
  language: 'sw',
  name: '',
  phone: '',
  location: '',
  about: '',
  photos: [],
  services: [newService()],
  days: [],
  slots: [{ start: '09:00', end: '10:30' }],
  currency: 'KES',
});

// Kenyan numbers written locally (07..., 01...) gain the country code; the survey needs E.164.
export function e164(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  if (/^\+[1-9]\d{6,14}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

export const serviceComplete = (s: DraftService) =>
  Boolean(s.type) && (s.type !== 'custom' || Boolean(s.customName.trim())) && s.hours * 60 + s.minutes >= 10 && Number(s.price) >= 0 && s.price !== '' && Number(s.capacity) >= 1;
export const businessComplete = (s: State) => Boolean(s.name.trim()) && e164(s.phone) !== null;
export const scheduleComplete = (s: State) => s.days.length > 0 && s.slots.length > 0 && s.slots.every((slot) => slot.start < slot.end);

// The draft as a survey, ready for buildSite; optional free text is left out when empty.
export function toSurvey(s: State) {
  const optional = (text: string) => (text.trim() ? text.trim() : undefined);
  return {
    language: s.language,
    business: { name: s.name.trim(), phone: e164(s.phone)!, location: optional(s.location), description: optional(s.about) },
    photos: [],
    services: s.services.map((service) => ({
      type: service.type as ServiceType,
      custom_name: service.type === 'custom' ? optional(service.customName) : undefined,
      description: optional(service.description),
      duration_minutes: service.hours * 60 + service.minutes,
      price: { amount: Number(service.price), currency: s.currency },
      capacity: Number(service.capacity),
    })),
    availability: { days: s.days, slots: s.slots },
  };
}

// The site's address on the demonstration Space, derived from the business name.
export function siteSlug(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-business';
}

type Survey = ReturnType<typeof toSurvey>;

// The twin's English survey: the same facts with the operator's free text in English. The page and
// scripts/warm-cache.ts both use it, so their translate and coder calls share cache keys.
export async function englishSurvey(survey: Survey, toEnglish: (text: string) => Promise<string>): Promise<Survey> {
  const en = async (value: string | undefined) => (value ? toEnglish(value) : undefined);
  return {
    ...survey,
    language: 'en',
    business: { ...survey.business, location: await en(survey.business.location), description: await en(survey.business.description) },
    services: await Promise.all(survey.services.map(async (s) => ({ ...s, custom_name: await en(s.custom_name), description: await en(s.description) }))),
  };
}
