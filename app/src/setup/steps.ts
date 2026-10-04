// Setup order follows docs/architecture.md section 4. Apps Script setup is waiting on the
// operator's choice in docs/architecture.md section 10, question 3.
export const STEP_IDS = [
  'business',
  'gmail',
  'sheets',
  'website',
  'whatsapp',
  'calendar',
  'listings',
] as const;
export type StepId = (typeof STEP_IDS)[number];

export type StepState = { status: 'NOT_STARTED' | 'DONE' | 'FAILED'; checkedAt: string | null; error: string | null };
export type SetupProgress = Record<StepId, StepState>;

export type BusinessBasics = { name: string; whatsappNumber: string; timezone: string };
export type SetupConfig = { business: BusinessBasics | null };

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

export type CheckDeps = { config: SetupConfig };

const E164 = /^\+[1-9]\d{6,14}$/;

export const CHECKS: Record<StepId, ((deps: CheckDeps) => Promise<CheckResult>) | null> = {
  business: async ({ config }) => {
    const b = config.business;
    if (!b?.name.trim()) return { ok: false, error: 'Please enter the farm name' };
    if (!E164.test(b.whatsappNumber)) return { ok: false, error: 'Please enter the WhatsApp number with its country code' };
    return { ok: true };
  },
  // These checks are implemented when their setup connectors are added.
  gmail: null,
  sheets: null,
  website: null,
  whatsapp: async ({ config }) => {
    if (!config.business || !E164.test(config.business.whatsappNumber)) {
      return { ok: false, error: 'Add the WhatsApp number in Business details first' };
    }
    return { ok: true };
  },
  calendar: null,
  // The operator creates both listings by hand and confirms here (architecture section 4, step 8).
  listings: null,
};

export async function runCheck(step: StepId, deps: CheckDeps, now: string): Promise<StepState> {
  const check = CHECKS[step];
  if (!check) {
    const error = step === 'sheets'
      ? 'Spreadsheet creation and Apps Script API provisioning are not implemented yet'
      : step === 'website'
        ? 'Create a preview in the Website tab; publishing the web app is not set up yet'
        : `${step} setup is not available in this build`;
    return { status: 'FAILED', checkedAt: now, error };
  }
  const result = await check(deps);
  return result.ok
    ? { status: 'DONE', checkedAt: now, error: null }
    : { status: 'FAILED', checkedAt: now, error: result.error };
}
