/// <reference types="bun" />
import { expect, test } from 'bun:test';

import type { ChatModel, ModelTurn } from '../agent/agentLoop';
import { Interview } from './engine';
import { normalizePhone } from './extract';

const record = (args: object): ModelTurn => ({ content: '', toolCalls: [{ type: 'function', function: { name: 'record_answer', arguments: JSON.stringify(args) } }] });

// Answers keyed by question: the stand-in model returns the tool arguments for each question in turn.
function modelFor(script: Record<string, object | object[]>): ChatModel {
  const asked = new Map<string, number>();
  return async (messages) => {
    const question = /Question: (.+)/.exec(String(messages[1].content))![1];
    const entry = script[question];
    const n = asked.get(question) ?? 0;
    asked.set(question, n + 1);
    const args = Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
    return record(args ?? { value: null });
  };
}

const service = (type: string, minutes: number, price: number) => ({
  'What kind of service is it: a tour, a personal service, a workshop, or other?': { type },
  'How would you describe this service to a visitor?': { value: `${type} description` },
  'How long does it take?': { minutes },
  'How much does it cost per person?': { amount: price },
  'How many visitors can join at one time?': { count: 6 },
  'On which days and at what time does it run?': { slots: [{ day: 'saturday', time: '09:00' }] },
  'Where do visitors meet you, or what should they do when they arrive?': { value: 'the market gate' },
});

async function run(interview: Interview, maxTurns = 50): Promise<string[]> {
  const asked: string[] = [];
  for (let step = interview.current(); step && asked.length < maxTurns; step = interview.current()) {
    asked.push(`${step.question.key}${step.attempt ? '#clarify' : ''}`);
    await interview.answer('answer');
  }
  return asked;
}

const base = {
  'What is the name of your business?': { value: 'Ondera Highlands Farm' },
  'Where is your business located?': { value: 'Ondera, Nyeri' },
  'Which phone or WhatsApp number should visitors use?': { digits: '0712345678' },
  'Do you have a business email address?': { email: null, declined: true },
  'Would you like to add photos of the farm now?': { wants_now: false },
};

test('a second service adds its questions, then asks again for more', async () => {
  const interview = new Interview(
    modelFor({
      ...base,
      ...service('tour', 120, 1500),
      'Do you offer another service?': [{ answer: true }, { answer: false }],
      'This is what I wrote down. Is it correct?': { confirmed: true, correction_field: null },
    }),
  );
  const asked = await run(interview);
  expect(asked.filter((k) => k === 'more_services')).toHaveLength(2);
  expect(asked).toContain('service_2.price');
  expect(interview.record.services).toHaveLength(2);
  expect(interview.record).toMatchObject({ name: 'Ondera Highlands Farm', phone: '+254712345678', email: null, confirmed: true });
});

test('an unreadable answer gets one clarifying question, then the field stays empty', async () => {
  const script = { ...base, ...service('tour', 120, 1500), 'Do you offer another service?': { answer: false }, 'This is what I wrote down. Is it correct?': { confirmed: true, correction_field: null } };
  script['How much does it cost per person?'] = { amount: null } as never;
  const interview = new Interview(modelFor(script));
  const asked = await run(interview);
  expect(asked).toEqual(expect.arrayContaining(['service_1.price', 'service_1.price#clarify']));
  expect(interview.record.services[0].price_kes).toBeUndefined();
});

test('a correction at the read-back is taken from the same answer, then read back again', async () => {
  const interview = new Interview(
    modelFor({
      ...base,
      ...service('tour', 120, 1500),
      'How many visitors can join at one time?': [{ count: 6 }, { count: 5 }],
      'Do you offer another service?': { answer: false },
      'This is what I wrote down. Is it correct?': [{ confirmed: false, correction_field: 'service_1.capacity' }, { confirmed: true, correction_field: null }],
    }),
  );
  const asked = await run(interview);
  expect(asked.filter((k) => k === 'confirm')).toHaveLength(2);
  expect(interview.record.services[0].capacity).toBe(5);
  expect(interview.record.confirmed).toBe(true);
});

test('Kenyan phone numbers normalize to +254, and anything else reads as unread', () => {
  expect(normalizePhone('0712 345 678')).toBe('+254712345678');
  expect(normalizePhone('254722000111')).toBe('+254722000111');
  expect(normalizePhone('12345')).toBeNull();
});

test('the business name and email are taken as said, never through translation', async () => {
  const { verbatim } = await import('./engine');
  const { BUSINESS, CONTACT } = await import('./questions');
  expect(verbatim(BUSINESS[0], 'Shamba la Kahawa la Ondera.')).toEqual({ kind: 'text', value: 'Shamba la Kahawa la Ondera' });
  expect(verbatim(CONTACT[1], 'Ni ondera.coffee@gmail.com')).toEqual({ kind: 'email', value: 'ondera.coffee@gmail.com' });
  expect(verbatim(CONTACT[1], 'Sina barua pepe.')).toBeNull();
  expect(verbatim(BUSINESS[0], 'Aah, sisi tunaita shamba letu Kahawa Bora, ni jina alilolipa marehemu baba yangu zamani sana.')).toBeNull();
});

test('times the model writes as read become HH:MM', async () => {
  const { normalizeTime } = await import('./extract');
  expect(['9:00 a.m.', '2 pm', '14:00', '12 a.m.', 'nine'].map(normalizeTime)).toEqual(['09:00', '14:00', '14:00', '00:00', null]);
});

test('durations and yes or no are read in code, in either language', async () => {
  const { durationMinutes, yesNo } = await import('./extract');
  expect([
    durationMinutes('Two hours.', 'Saa mbili.'),
    durationMinutes('An hour and a half.', 'Saa moja na nusu.'),
    durationMinutes('Ninety minutes', ''),
    durationMinutes('It is two hours.', 'Ni two hours.'),
    durationMinutes('At nine in the morning', 'saa tatu asubuhi'),
  ]).toEqual([120, 90, null, 120, null]);
  expect([yesNo('Yes, I have another.', 'Ndiyo, nina nyingine.'), yesNo("I don't have a picture now.", 'Sina picha sasa.'), yesNo('Maybe', 'Labda')]).toEqual([true, false, null]);
});

test('split day names rejoin and spoken phone digits become a number, while prices and times stay words', async () => {
  const { normalizeTranscript } = await import('./normalize');
  expect(normalizeTranscript('kila juma mosi saa tatu asubuhi')).toBe('kila Jumamosi saa tatu asubuhi');
  expect(normalizeTranscript('namba yangu ni sifuri saba moja mbili, tatu nne tano, sita saba nane')).toBe('namba yangu ni 0712345678');
  expect(normalizeTranscript('shilingi elfu moja na mia tano')).toBe('shilingi elfu moja na mia tano');
});
