/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { currentStep, emptyProgress, parseProgress, runCheck, setupSummary, type CheckDeps } from './steps';

const now = '2026-10-03T12:00:00.000Z';
const config = { business: { name: 'Ondera farm', whatsappNumber: '+254712345678', timezone: 'Africa/Nairobi' } };
const deps: CheckDeps = { config };

describe('resume', () => {
  test('setup resumes at the first unfinished architecture step', () => {
    const progress = emptyProgress();
    progress.business = { status: 'DONE', checkedAt: now, error: null };
    progress.gmail = { status: 'DONE', checkedAt: now, error: null };
    expect(currentStep(parseProgress(JSON.stringify(progress)))).toBe('sheets');
  });

  test('old Vercel and backend progress do not block the new flow', () => {
    const saved = {
      business: { status: 'DONE', checkedAt: now, error: null },
      vercel: { status: 'NOT_STARTED', checkedAt: null, error: null },
      backend: { status: 'DONE', checkedAt: now, error: null },
    };
    const progress = parseProgress(JSON.stringify(saved));
    expect(Object.keys(progress)).not.toContain('vercel');
    expect(Object.keys(progress)).not.toContain('backend');
    expect(currentStep(progress)).toBe('gmail');
  });

  test('a corrupt saved copy starts from the beginning', () => {
    expect(currentStep(parseProgress('{not json'))).toBe('business');
  });
});

describe('checks', () => {
  test('spreadsheet setup describes the Apps Script method decision', async () => {
    const result = await runCheck('sheets', deps, now);
    expect(result.error).toContain('Apps Script setup method');
  });

  test('website setup explains that deployment is still pending', async () => {
    const result = await runCheck('website', deps, now);
    expect(result.error).toContain('publishing the web app is not set up yet');
  });

  test('business and WhatsApp checks require an international phone number', async () => {
    expect((await runCheck('business', deps, now)).status).toBe('DONE');
    expect((await runCheck('whatsapp', deps, now)).status).toBe('DONE');
    const invalid = { business: { ...config.business, whatsappNumber: '0712345678' } };
    expect((await runCheck('business', { config: invalid }, now)).status).toBe('FAILED');
    expect((await runCheck('whatsapp', { config: invalid }, now)).status).toBe('FAILED');
  });

  test('setup summaries contain only the active architecture steps', async () => {
    const progress = emptyProgress();
    expect(setupSummary(progress).map((item) => item.step)).not.toContain('vercel');
  });
});
