import { z } from 'zod';

import type { ChatModel, ToolSpec } from '../agent/agentLoop';
import { normalizeSwahiliTimes } from '../agent/swahiliTime';
import type { Kind, Question } from './questions';

// One answer in, one value out. The model fills a schema-constrained tool call for the question's
// kind; code then checks the value, so a number outside a sane range or a malformed time counts as
// unread and the interview asks again instead of saving a guess.

const DAY = z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
export type Day = z.infer<typeof DAY>;
export type Slot = { day: Day; time: string };
export type ServiceType = 'tour' | 'personal_service' | 'workshop' | 'other';
export type Correction = { field: string };

const SCHEMAS: Record<Kind, z.ZodObject> = {
  text: z.object({ value: z.string().nullable().describe('The stated value in English, or null if the answer does not state it') }),
  service_type: z.object({ type: z.enum(['tour', 'personal_service', 'workshop', 'other']).nullable() }),
  minutes: z.object({ minutes: z.number().nullable().describe('Total length in minutes, for example 90 for "an hour and a half"') }),
  kes: z.object({ amount: z.number().nullable().describe('Price per person in Kenyan shillings, as a number') }),
  count: z.object({ count: z.number().int().nullable().describe('Most visitors at one time') }),
  schedule: z.object({
    slots: z
      .array(z.object({ day: DAY, time: z.string().describe('Start time as HH:MM in 24-hour time') }))
      .nullable()
      .describe('One entry per day; null if the answer gives no clock time'),
  }),
  yes_no: z.object({ answer: z.boolean().nullable() }),
  phone: z.object({ digits: z.string().nullable().describe('The phone number as digits only, for example 0712345678') }),
  email: z.object({ email: z.string().nullable().describe('The email address, or null'), declined: z.boolean().describe('True if the operator has no email or does not want to give one') }),
  photos: z.object({ wants_now: z.boolean().nullable() }),
  confirm: z.object({
    confirmed: z.boolean().describe('True if the operator says everything is correct'),
    correction_field: z.string().nullable().describe('The field key the operator corrects, from the list given, or null'),
  }),
};

export type Extracted =
  | { kind: 'text'; value: string }
  | { kind: 'service_type'; value: ServiceType }
  | { kind: 'minutes' | 'kes' | 'count'; value: number }
  | { kind: 'schedule'; value: Slot[] }
  | { kind: 'yes_no' | 'photos'; value: boolean }
  | { kind: 'phone'; value: string }
  | { kind: 'email'; value: string | null }
  | { kind: 'confirm'; value: { confirmed: boolean; correction: string | null } };

export function toolFor(kind: Kind, fieldKeys: string[] = []): ToolSpec {
  // The correction field is limited to the real field keys: left as free text, the model wrote the
  // label "Field keys" itself. Schema-constrained decoding then cannot produce anything else.
  const schema = kind === 'confirm' && fieldKeys.length
    ? z.object({ confirmed: z.boolean(), correction_field: z.enum(fieldKeys as [string, ...string[]]).nullable() })
    : SCHEMAS[kind];
  const { $schema: _s, additionalProperties: _a, ...parameters } = z.toJSONSchema(schema) as Record<string, unknown>;
  return { type: 'function', function: { name: 'record_answer', description: 'Record what the operator answered.', parameters } };
}

const PROMPT = `You read one answer from a small tour operator in an onboarding interview and record it with record_answer. You get the Kiswahili transcript of the spoken answer and its English translation; either may contain recognition errors, so use both. Use only what the answer states. When the answer does not state the value, use null; never guess. Numbers said in words become digits. A walk or visit around a farm or field counts as a tour.`;

export async function extract(model: ChatModel, question: Question, answer: string, fieldKeys: string[] = [], rawTranscript = ''): Promise<Extracted | null> {
  // Code reads what it can read reliably; the model is asked only for the rest.
  const read = readInCode(question.kind, answer, rawTranscript);
  if (read) return read;
  // The model reads "saa tatu asubuhi" literally as 03:00, so it sees the clock times in digits.
  const transcript = normalizeSwahiliTimes(rawTranscript);
  const context = question.kind === 'confirm' ? `\nField keys: ${fieldKeys.join(', ')}` : '';
  const turn = await model(
    [
      { role: 'system', content: PROMPT },
      { role: 'user', content: `Question: ${question.en}${context}\nKiswahili transcript: ${transcript || '(none)'}\nEnglish translation: ${answer}` },
    ],
    [toolFor(question.kind, question.kind === 'confirm' ? fieldKeys : [])],
  );
  const call = turn.toolCalls.find((c) => c.function.name === 'record_answer');
  if (!call) return null;
  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    return null;
  }
  const parsed = SCHEMAS[question.kind].safeParse(args);
  return parsed.success ? check(question.kind, parsed.data as Record<string, unknown>) : null;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10,
};

// Durations: "two hours", "an hour and a half", "90 minutes", "saa mbili", "saa moja na nusu".
export function durationMinutes(english: string, kiswahili: string): number | null {
  const en = english.toLowerCase();
  const sw = kiswahili.toLowerCase();
  const swMatch = /\bsaa\s+(moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi|\d+)(\s+na\s+nusu)?\b/.exec(sw);
  // A Kiswahili hour count with a time-of-day word is a clock time, not a duration.
  if (swMatch && !/asubuhi|mchana|alasiri|jioni|usiku/.test(sw)) {
    const hours = NUMBER_WORDS[swMatch[1]] ?? Number(swMatch[1]);
    return hours * 60 + (swMatch[2] ? 30 : 0);
  }
  if (/\b(an|one) hour and a half\b/.test(en)) return 90;
  let minutes = 0;
  for (const m of en.matchAll(/(\d+(?:\.\d+)?|[a-z]+)\s*(hours?|hrs?|minutes?|mins?)\b/g)) {
    const n = Number.isNaN(Number(m[1])) ? (m[1] === 'an' || m[1] === 'a' ? 1 : NUMBER_WORDS[m[1]]) : Number(m[1]);
    if (n) minutes += m[2].startsWith('h') ? n * 60 : n;
  }
  if (/\band a half\b/.test(en) && minutes) minutes += 30;
  return minutes >= 10 ? Math.round(minutes) : null;
}

// Yes and no in either language. "Sina" ("I do not have") answers no to "do you have".
export function yesNo(english: string, kiswahili: string): boolean | null {
  const text = `${kiswahili} ${english}`.toLowerCase();
  const yes = /\b(ndiyo|ndio|naam|yes|yeah|sure)\b/.test(text);
  const no = /\b(hapana|sina|siyo|la hasha|no|not now|later|baadaye)\b/.test(text);
  return yes === no ? null : yes;
}

export function readInCode(kind: Kind, english: string, kiswahili: string): Extracted | null {
  if (kind === 'minutes') {
    const minutes = durationMinutes(english, kiswahili);
    return minutes ? { kind, value: minutes } : null;
  }
  if (kind === 'yes_no' || kind === 'photos') {
    const answer = yesNo(english, kiswahili);
    return answer === null ? null : { kind, value: answer };
  }
  return null;
}

// Range and format checks: a value that fails reads as unread.
export function check(kind: Kind, data: Record<string, unknown>): Extracted | null {
  switch (kind) {
    case 'text': {
      const value = (data.value as string | null)?.trim();
      return value ? { kind, value } : null;
    }
    case 'service_type':
      return data.type ? { kind, value: data.type as ServiceType } : null;
    case 'minutes': {
      const v = data.minutes as number | null;
      return v !== null && v >= 10 && v <= 24 * 60 ? { kind, value: Math.round(v) } : null;
    }
    case 'kes': {
      const v = data.amount as number | null;
      return v !== null && v > 0 && v <= 1_000_000 ? { kind, value: Math.round(v) } : null;
    }
    case 'count': {
      const v = data.count as number | null;
      return v !== null && v >= 1 && v <= 500 ? { kind, value: v } : null;
    }
    case 'schedule': {
      const slots = (data.slots as Slot[] | null)?.map((s) => ({ day: String(s.day).toLowerCase() as Day, time: normalizeTime(s.time) }));
      if (!slots?.length) return null;
      const valid = slots.every((s) => s.time !== null && DAY.safeParse(s.day).success);
      return valid ? { kind, value: slots as Slot[] } : null;
    }
    case 'yes_no':
      return data.answer === null || data.answer === undefined ? null : { kind, value: data.answer as boolean };
    case 'photos':
      return data.wants_now === null || data.wants_now === undefined ? null : { kind, value: data.wants_now as boolean };
    case 'phone': {
      const phone = normalizePhone((data.digits as string | null) ?? '');
      return phone ? { kind, value: phone } : null;
    }
    case 'email': {
      if (data.declined) return { kind, value: null };
      const email = (data.email as string | null)?.trim().toLowerCase() ?? '';
      return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email) ? { kind, value: email } : null;
    }
    case 'confirm':
      return { kind, value: { confirmed: Boolean(data.confirmed), correction: (data.correction_field as string | null) ?? null } };
  }
}

// The model writes times as it reads them ("9:00 a.m.", "2 pm", "14:00"); code turns them into HH:MM.
// A time with no clock hour stays unread, so the interview asks again.
export function normalizeTime(raw: string): string | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\s*$/i.exec(raw);
  if (!m) return null;
  let hour = Number(m[1]);
  const minutes = Number(m[2] ?? '0');
  const meridiem = m[3]?.toLowerCase().replace(/[.\s]/g, '');
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minutes > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Kenyan numbers: 07xx or 01xx with 10 digits, or 254 followed by 9 digits, become +254...
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}
