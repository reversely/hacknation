import { HealthResponse } from '@noor/contracts';

import type { SecretVault } from './secrets';

// Setup wizard steps (docs/architecture.md section 4), in the order the operator meets them.
// The backend is the operator's own Vercel project, so every check that goes through it comes
// after the website step that deploys it.
export const STEP_IDS = [
  'business',
  'gmail',
  'vercel',
  'website',
  'sheets',
  'whatsapp',
  'calendar',
  'listings',
] as const;
export type StepId = (typeof STEP_IDS)[number];

export type StepState = { status: 'NOT_STARTED' | 'DONE' | 'FAILED'; checkedAt: string | null; error: string | null };
export type SetupProgress = Record<StepId, StepState>;

export type BusinessBasics = { name: string; whatsappNumber: string; timezone: string };
export type SetupConfig = { apiUrl: string | null; business: BusinessBasics | null };

export function emptyProgress(): SetupProgress {
  return Object.fromEntries(
    STEP_IDS.map((id) => [id, { status: 'NOT_STARTED', checkedAt: null, error: null }]),
  ) as SetupProgress;
}

// Merges saved progress with the current step list, so a step added in a later version
// starts as NOT_STARTED instead of breaking an older saved copy.
export function parseProgress(saved: string | null): SetupProgress {
  const progress = emptyProgress();
  if (!saved) return progress;
  try {
    const parsed = JSON.parse(saved) as Partial<SetupProgress>;
    for (const id of STEP_IDS) if (parsed[id]) progress[id] = parsed[id]!;
  } catch {
    // A corrupt saved copy restarts setup rather than blocking the app.
  }
  return progress;
}

// The step the wizard opens at after a restart: the first one not yet done.
export function currentStep(progress: SetupProgress): StepId | null {
  return STEP_IDS.find((id) => progress[id].status !== 'DONE') ?? null;
}

// What the model may know about setup: step names, statuses and error summaries.
export function setupSummary(progress: SetupProgress): { step: StepId; status: StepState['status']; error: string | null }[] {
  return STEP_IDS.map((step) => ({ step, status: progress[step].status, error: progress[step].error }));
}

export type CheckResult = { ok: true } | { ok: false; error: string };

export type CheckDeps = {
  vault: SecretVault;
  config: SetupConfig;
  fetch: typeof fetch;
};

const E164 = /^\+[1-9]\d{6,14}$/;

// Error strings are written here, never copied from a response body, so a server or token
// value cannot reach the screen, the log or the model through an error.
// The website deploy (#18) writes the backend address and the device token; the operator never
// types either.
async function health(deps: CheckDeps): Promise<HealthResponse | string> {
  const token = await deps.vault.get('device_token');
  if (!deps.config.apiUrl || !token) return 'Please publish the website first';
  try {
    const response = await deps.fetch(`${deps.config.apiUrl}/api/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) return 'The backend rejected the device token';
    if (!response.ok) return `The backend answered with error ${response.status}`;
    const parsed = HealthResponse.safeParse(await response.json());
    return parsed.success ? parsed.data : 'The backend answer was not understood';
  } catch {
    return 'The backend could not be reached';
  }
}

function serviceCheck(service: keyof HealthResponse['services'], label: string) {
  return async (deps: CheckDeps): Promise<CheckResult> => {
    const result = await health(deps);
    if (typeof result === 'string') return { ok: false, error: result };
    const status = result.services[service];
    if (status === 'OK') return { ok: true };
    return {
      ok: false,
      error: status === 'NOT_CONFIGURED' ? `${label} is not set up on the backend yet` : `${label} did not respond`,
    };
  };
}

export const CHECKS: Record<StepId, ((deps: CheckDeps) => Promise<CheckResult>) | null> = {
  business: async ({ config }) => {
    const b = config.business;
    if (!b?.name.trim()) return { ok: false, error: 'Please enter the farm name' };
    if (!E164.test(b.whatsappNumber)) return { ok: false, error: 'Please enter the WhatsApp number with its country code' };
    return { ok: true };
  },
  // Gmail sign-in arrives with #3; until then this step cannot pass.
  gmail: null,
  vercel: async ({ vault, fetch }) => {
    const token = await vault.get('vercel_token');
    if (!token) return { ok: false, error: 'Please enter the Vercel token' };
    try {
      const response = await fetch('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401 || response.status === 403) return { ok: false, error: 'Vercel rejected the token' };
      return response.ok ? { ok: true } : { ok: false, error: `Vercel answered with error ${response.status}` };
    } catch {
      return { ok: false, error: 'Vercel could not be reached' };
    }
  },
  // Passes once the deployed project answers its health check.
  website: async (deps) => {
    const result = await health(deps);
    return typeof result === 'string' ? { ok: false, error: result } : { ok: true };
  },
  sheets: serviceCheck('sheets', 'Google Sheets'),
  whatsapp: serviceCheck('whatsapp', 'WhatsApp'),
  calendar: serviceCheck('calendar', 'Google Calendar'),
  // The operator creates both listings by hand and confirms here (architecture section 4, step 8).
  listings: null,
};

export async function runCheck(step: StepId, deps: CheckDeps, now: string): Promise<StepState> {
  const check = CHECKS[step];
  if (!check) return { status: 'FAILED', checkedAt: now, error: 'This step is not available yet' };
  const result = await check(deps);
  return result.ok
    ? { status: 'DONE', checkedAt: now, error: null }
    : { status: 'FAILED', checkedAt: now, error: result.error };
}
