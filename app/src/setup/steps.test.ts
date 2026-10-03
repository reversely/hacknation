/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import type { SecretName, SecretVault } from './secrets';
import { currentStep, emptyProgress, parseProgress, runCheck, setupSummary, type CheckDeps } from './steps';

const now = '2026-10-03T12:00:00.000Z';
const DEVICE_TOKEN = 'dev-token-SECRET-123';
const VERCEL_TOKEN = 'vercel-SECRET-456';

function vault(values: Partial<Record<SecretName, string>>): SecretVault {
  return { get: async (n) => values[n] ?? null, set: async () => {}, remove: async () => {} };
}

function fakeFetch(handler: (url: string, auth: string | null) => Response): typeof fetch {
  return (async (url: string, init?: RequestInit) =>
    handler(url, (init?.headers as Record<string, string>)?.Authorization ?? null)) as typeof fetch;
}

const healthy = (services: Record<string, string>) =>
  new Response(JSON.stringify({ server_time: now, services: { sheets: 'OK', calendar: 'OK', whatsapp: 'OK', ...services } }));

function deps(over: Partial<CheckDeps> = {}): CheckDeps {
  return {
    vault: vault({ device_token: DEVICE_TOKEN, vercel_token: VERCEL_TOKEN }),
    config: { apiUrl: 'https://noor.example', business: { name: 'Ondera farm', whatsappNumber: '+254712345678', timezone: 'Africa/Nairobi' } },
    fetch: fakeFetch(() => healthy({})),
    ...over,
  };
}

describe('resume', () => {
  test('setup reopens at the first step that is not done', () => {
    const progress = emptyProgress();
    progress.business = { status: 'DONE', checkedAt: now, error: null };
    progress.gmail = { status: 'DONE', checkedAt: now, error: null };
    const restarted = parseProgress(JSON.stringify(progress));
    expect(currentStep(restarted)).toBe('vercel');
  });

  test('progress saved by a build that had the removed backend step still resumes', () => {
    const saved = { business: { status: 'DONE', checkedAt: now, error: null }, backend: { status: 'DONE', checkedAt: now, error: null } };
    const restarted = parseProgress(JSON.stringify(saved));
    expect(Object.keys(restarted)).not.toContain('backend');
    expect(currentStep(restarted)).toBe('gmail');
  });

  test('a corrupt saved copy starts setup from the beginning', () => {
    expect(currentStep(parseProgress('{not json'))).toBe('business');
  });
});

describe('checks', () => {
  test('the website check sends the device token to the deployed project and passes on a valid health answer', async () => {
    let sent = null as string | null;
    const state = await runCheck('website', deps({ fetch: fakeFetch((_, auth) => ((sent = auth), healthy({}))) }), now);
    expect(state.status).toBe('DONE');
    expect(sent).toBe(`Bearer ${DEVICE_TOKEN}`);
  });

  test('a service the backend has not configured fails with a plain reason', async () => {
    const state = await runCheck('whatsapp', deps({ fetch: fakeFetch(() => healthy({ whatsapp: 'NOT_CONFIGURED' })) }), now);
    expect(state).toMatchObject({ status: 'FAILED', error: 'WhatsApp is not set up on the backend yet' });
  });

  test('before the website is published, the checks that need it fail without a request', async () => {
    let called = false;
    const fetch = fakeFetch(() => ((called = true), healthy({})));
    const noToken = await runCheck('website', deps({ vault: vault({}), fetch }), now);
    const noAddress = await runCheck('sheets', deps({ config: { apiUrl: null, business: null }, fetch }), now);
    expect(noToken.error).toBe('Please publish the website first');
    expect(noAddress.error).toBe('Please publish the website first');
    expect(called).toBe(false);
  });

  test('a business number without a country code fails', async () => {
    const config = { apiUrl: null, business: { name: 'Ondera farm', whatsappNumber: '0712345678', timezone: 'Africa/Nairobi' } };
    expect((await runCheck('business', deps({ config }), now)).status).toBe('FAILED');
  });

  test('a rejected Vercel token fails', async () => {
    const state = await runCheck('vercel', deps({ fetch: fakeFetch(() => new Response('{}', { status: 403 })) }), now);
    expect(state.error).toBe('Vercel rejected the token');
  });
});

describe('secrets never reach the model', () => {
  test('error text from a server that echoes the token is not passed on', async () => {
    const echo = fakeFetch((_, auth) => new Response(`bad token ${auth}`, { status: 500 }));
    const progress = emptyProgress();
    progress.website = await runCheck('website', deps({ fetch: echo }), now);
    progress.vercel = await runCheck('vercel', deps({ fetch: echo }), now);
    const forModel = JSON.stringify(setupSummary(progress));
    expect(forModel).not.toContain('SECRET');
    expect(progress.website.error).toBe('The backend answered with error 500');
  });
});
