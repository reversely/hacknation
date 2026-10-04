/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { preparePublication, publish, publishedFarm } from './publication';
import { DEFAULT_WEBSITE_PAGE } from './websiteCreator';

function memoryStore() {
  const meta = new Map<string, string>([['business_basics', JSON.stringify({ name: 'Ondera Coffee Farm', whatsappNumber: '+254712345678', timezone: 'Africa/Nairobi' })]]);
  const records = new Map<string, unknown>();
  const outbox: { id: string; type: string; status: string }[] = [];
  return {
    getMeta: (key: string) => meta.get(key) ?? null,
    setMeta: (key: string, value: string) => void meta.set(key, value),
    upsert: (_tab: string, record: { id: string }) => void records.set(record.id, record),
    list: () => [...records.values()],
    enqueue: (action: { id: string; type: string }) => void outbox.push({ id: action.id, type: action.type, status: 'QUEUED' }),
    outbox: () => outbox,
  } as never as Parameters<typeof publish>[0] & { outbox: () => typeof outbox };
}

const fields = {
  description: 'A coffee farm tour where guests walk the coffee rows',
  duration: '2 hours',
  price: '1500 KES',
  capacity: 8,
  meeting_instructions: 'Ondera market gate',
  availability: 'Saturdays at 09:00',
};
let ids = 0;
const deps = (generations: string[]) => ({
  translate: async (text: string) => `SW ${text}`,
  generateCopy: async () => {
    generations.push('called');
    return JSON.stringify({ headline: 'Walk the coffee rows at Ondera', introduction: 'Taste fresh coffee on the farm.', theme: 'coffee' });
  },
  newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
  now: () => '2026-10-03T12:00:00Z',
});

test('approval publishes the page the preview showed, and queues the spreadsheet write', async () => {
  const store = memoryStore();
  const generations: string[] = [];
  const d = deps(generations);
  const preview = await preparePublication(store, fields, d);
  const approved = await preparePublication(store, fields, d);
  expect(approved).toBe(preview);
  expect(generations).toHaveLength(1);
  await publish(store, approved, d);
  const farm = publishedFarm(store);
  expect(farm?.page).toMatchObject({ headline: { en: 'Walk the coffee rows at Ondera', sw: 'SW Walk the coffee rows at Ondera' } });
  expect(store.outbox()).toEqual([expect.objectContaining({ type: 'save_profile', status: 'QUEUED' })]);
  expect(preview.html).toContain('Walk the coffee rows at Ondera');
});

test('a changed draft prepares a new page', async () => {
  const store = memoryStore();
  const generations: string[] = [];
  const d = deps(generations);
  await preparePublication(store, fields, d);
  await preparePublication(store, { ...fields, price: '2000 KES' }, d);
  expect(generations).toHaveLength(2);
});

test('without a website model the default copy is published', async () => {
  const store = memoryStore();
  const publication = await preparePublication(store, { ...fields, capacity: 9 }, { ...deps([]), generateCopy: null });
  expect(publication.page).toEqual(DEFAULT_WEBSITE_PAGE);
});

test('approval reports where the page ended up: no site, live after a sync, or still queued', async () => {
  const noSite = memoryStore();
  const d = deps([]);
  expect(await publish(noSite, await preparePublication(noSite, fields, d), d)).toEqual({ state: 'NO_SITE' });

  const live = memoryStore();
  live.setMeta('website_url', 'https://script.google.com/macros/s/abc/exec');
  const syncs = { ...d, sync: async () => live.outbox().forEach((entry) => (entry.status = 'COMPLETED')) };
  expect(await publish(live, await preparePublication(live, fields, syncs), syncs)).toEqual({ state: 'LIVE', url: 'https://script.google.com/macros/s/abc/exec' });

  const offline = memoryStore();
  offline.setMeta('website_url', 'https://script.google.com/macros/s/abc/exec');
  const fails = { ...d, sync: async () => { throw new Error('offline'); } };
  expect(await publish(offline, await preparePublication(offline, fields, fails), fails)).toEqual({ state: 'QUEUED', url: 'https://script.google.com/macros/s/abc/exec' });
});
