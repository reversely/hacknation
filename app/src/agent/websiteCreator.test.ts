/// <reference types="bun" />
import { expect, mock, test } from 'bun:test';

// websiteCreator imports the phone's model loader, which needs React Native.
mock.module('../inference/localModel', () => ({ loadModel: async () => ({}) }));
const { generateWebsitePage, renderWebsitePreviewHtml, WEBSITE_COPY_SCHEMA } = await import('./websiteCreator');

const now = '2026-10-03T12:00:00Z';
const profile = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', version: 3, created_at: now, updated_at: now,
  status: 'APPROVED', approved_at: now, name: 'Ondera Coffee Farm',
  description: { en: 'A family coffee farm above Ondera.', sw: 'Shamba la kahawa la familia juu ya Ondera.' },
  offerings: [{ id: '9b2d1f3e-1c2a-4b5d-8e6f-7a8b9c0d1e2f', name: { en: 'Coffee farm walk', sw: 'Matembezi ya shamba la kahawa' },
    description: { en: 'Walk the coffee rows.', sw: 'Tembea kati ya mistari ya kahawa.' }, duration_minutes: 120, price: { amount: 1500, currency: 'KES' }, capacity: 8 }],
  meeting_instructions: { en: 'Meet at the Ondera market gate.', sw: 'Tukutane kwenye lango la soko la Ondera.' },
  policies: { en: 'Children under five are free.', sw: 'Watoto chini ya miaka mitano hawalipi.' },
  whatsapp_number: '+254712345678', email: null, timezone: 'Africa/Nairobi',
};
const translate = async (text: string) => `SW: ${text}`;

test('one call returns English copy; the app fixes the sections and the translator writes the Kiswahili', async () => {
  let sentSchema: unknown = null;
  const generate = async (_prompt: string, schema: object) => {
    sentSchema = schema;
    return JSON.stringify({ headline: 'Walk the coffee rows at Ondera', introduction: 'Pick ripe cherries and taste fresh coffee.', theme: 'coffee' });
  };
  const page = await generateWebsitePage(generate, translate, profile);
  expect(sentSchema).toBe(WEBSITE_COPY_SCHEMA);
  expect(page).toEqual({
    headline: { en: 'Walk the coffee rows at Ondera', sw: 'SW: Walk the coffee rows at Ondera' },
    introduction: { en: 'Pick ripe cherries and taste fresh coffee.', sw: 'SW: Pick ripe cherries and taste fresh coffee.' },
    theme: 'coffee',
    sectionOrder: ['offerings', 'visit', 'policies'],
  });
  expect(renderWebsitePreviewHtml(profile, page)).toContain('KES 1,500');
});

test('output that is not the schema\'s JSON is rejected', async () => {
  const fenced = async () => '```json\n{"headline":"x"}\n```';
  await expect(generateWebsitePage(fenced, translate, profile)).rejects.toThrow('not valid JSON');
});

test('markup in the copy is rejected even when it fits the schema', async () => {
  const markup = async () => JSON.stringify({ headline: '<script>alert(1)</script>', introduction: 'Fine.', theme: 'leaf' });
  await expect(generateWebsitePage(markup, translate, profile)).rejects.toThrow('plain text');
});

test('a draft profile cannot get a website', async () => {
  const generate = async () => '{}';
  await expect(generateWebsitePage(generate, translate, { ...profile, status: 'DRAFT' })).rejects.toThrow('Approve the farm profile');
});
