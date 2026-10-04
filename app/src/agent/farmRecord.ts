import { FarmProfile } from '@wren/contracts';

import type { Translate } from '../inference/translator';
import type { BusinessBasics } from '../setup/steps';

// Turns the approved profile draft (the agent's free-text fields) into the Farm record the
// Website Creator, the listings and the public page read. Numbers are parsed by code, never by the
// model, and a field that cannot be parsed blocks approval with a question instead of a guess.

export type DraftFields = {
  name?: string;
  description?: string;
  duration?: string;
  price?: string;
  capacity?: number;
  meeting_instructions?: string;
  availability?: string;
  policies?: string;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, half: 0.5,
};

function readNumber(token: string): number | null {
  const cleaned = token.replace(/,/g, '').toLowerCase();
  if (/^\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  return NUMBER_WORDS[cleaned] ?? null;
}

// "2 hours", "two hours", "1.5 hrs", "90 minutes", "2 hours 30 minutes", "half an hour".
export function parseDurationMinutes(text: string): number | null {
  const lower = text.toLowerCase();
  if (/\bhalf an? hour\b/.test(lower)) return 30;
  let minutes = 0;
  let found = false;
  for (const match of lower.matchAll(/([\d.,]+|[a-z]+)\s*(hours?|hrs?|h|minutes?|mins?)\b/g)) {
    const value = readNumber(match[1]);
    if (value === null) continue;
    found = true;
    minutes += match[2].startsWith('h') ? value * 60 : value;
  }
  return found && minutes > 0 ? Math.round(minutes) : null;
}

// "1500 KES", "KES 1,500", "2000 shillings", "two thousand shillings" are not all handled by the
// translator alike, so shillings with no code are Kenyan shillings, the demonstration's currency.
export function parsePrice(text: string): { amount: number; currency: string } | null {
  const lower = text.toLowerCase();
  const digits = lower.match(/(\d[\d,]*(?:\.\d+)?)/);
  let amount: number | null = digits ? Number(digits[1].replace(/,/g, '')) : null;
  if (amount === null) {
    const words = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+thousand(?:\s+(one|two|three|four|five|six|seven|eight|nine)\s+hundred)?\b/);
    if (words) amount = NUMBER_WORDS[words[1]] * 1000 + (words[2] ? NUMBER_WORDS[words[2]] * 100 : 0);
  }
  if (amount === null || !Number.isFinite(amount)) return null;
  const code = text.match(/\b([A-Z]{3})\b/)?.[1];
  const currency = code ?? (/\b(shillings?|ksh|kes)\b/.test(lower) ? 'KES' : null);
  return currency ? { amount, currency } : null;
}

export type FarmRecordInput = {
  fields: DraftFields;
  business: BusinessBasics | null;
  existing: FarmProfile | null;
  translate: Translate | null;
  newId: () => string;
  now: string;
};

// What blocks the record, named by draft field, so the agent can ask the operator for it.
export function farmRecordProblems(fields: DraftFields, business: BusinessBasics | null): string[] {
  const problems: string[] = [];
  // The name entered in Setup wins: the model has filled the draft's name with the tour description.
  if (!(business?.name || fields.name)?.trim()) problems.push('name');
  if (!fields.description) problems.push('description');
  if (!fields.duration || parseDurationMinutes(fields.duration) === null) problems.push('duration');
  if (!fields.price || parsePrice(fields.price) === null) problems.push('price');
  if (!fields.capacity) problems.push('capacity');
  if (!fields.meeting_instructions) problems.push('meeting_instructions');
  if (!fields.availability) problems.push('availability');
  if (!business?.whatsappNumber || !/^\+[1-9]\d{6,14}$/.test(business.whatsappNumber)) problems.push('whatsapp_number');
  return problems;
}

export async function buildFarmRecord(input: FarmRecordInput): Promise<FarmProfile> {
  const { fields, business, existing, translate, now } = input;
  const problems = farmRecordProblems(fields, business);
  if (problems.length) throw new Error(`The profile cannot be published yet: ${problems.join(', ')}`);
  // The agent stores English when the translator is in use; Kiswahili comes from the same service.
  // Without one, both languages hold the operator's own words.
  const both = async (en: string) => ({ en, sw: translate && en ? await translate(en, 'en', 'sw') : en });
  const meeting = `${fields.meeting_instructions}. ${fields.availability}.`.replace(/\.\s*\./g, '.');
  const offeringName = fields.description!.length <= 60 ? fields.description! : 'Farm tour';
  const [description, name, meetingInstructions, policies] = await Promise.all([
    both(fields.description!),
    both(offeringName),
    both(meeting),
    both(fields.policies ?? ''),
  ]);
  return FarmProfile.parse({
    id: existing?.id ?? input.newId(),
    version: (existing?.version ?? 0) + 1,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    status: 'APPROVED',
    approved_at: now,
    name: (business?.name || fields.name!).trim(),
    description,
    offerings: [{
      id: existing?.offerings[0]?.id ?? input.newId(),
      name,
      description,
      duration_minutes: parseDurationMinutes(fields.duration!)!,
      price: parsePrice(fields.price!)!,
      capacity: fields.capacity!,
    }],
    meeting_instructions: meetingInstructions,
    policies,
    whatsapp_number: business!.whatsappNumber,
    email: existing?.email ?? null,
    timezone: business!.timezone || 'Africa/Nairobi',
    // A changed profile needs a new page; the Website Creator writes it after its own approval.
    page: null,
  });
}
