import { z } from 'zod';

import { readConfig, readProgress } from '../setup/setupStore';
import { setupSummary } from '../setup/steps';
import type { LocalStore } from '../store/localStore';
import { defineTool, type Harness } from './harness';

// The business profile is the base of every promotional item: the website, the listings and the
// replies are all written from it (docs/architecture.md section 4, step 1). Until the Sheets store is
// connected, the draft lives on the phone.
const DRAFT_KEY = 'profile_draft';

// Small models fill fields the operator never mentioned with placeholders; a placeholder is
// rejected so the field stays missing and the agent asks for it.
const PLACEHOLDER = /^(tbd|tba|n\/?a|unknown|none|not specified|-+|\?+)$/i;
const stated = (hint: string) =>
  z.string().trim().min(1).refine((value) => !PLACEHOLDER.test(value), 'Leave out fields the operator has not stated').describe(hint);

export const ProfileDraft = z.object({
  description: stated('The tour in the operator\'s words').optional(),
  duration: stated('e.g. "2 hours"').optional(),
  price: stated('Per person, with currency').optional(),
  capacity: z.number().int().positive().describe('Most visitors per tour').optional(),
  meeting_instructions: stated('Where visitors meet').optional(),
  availability: stated('Days and times').optional(),
  policies: stated('Cancellation and other rules').optional(),
});
export type ProfileDraft = z.infer<typeof ProfileDraft>;

type StoredDraft = { fields: ProfileDraft; status: 'DRAFT' | 'APPROVED'; updatedAt: string | null };

export function readDraft(store: LocalStore): StoredDraft {
  const saved = store.getMeta(DRAFT_KEY);
  return saved ? (JSON.parse(saved) as StoredDraft) : { fields: {}, status: 'DRAFT', updatedAt: null };
}

function writeDraft(store: LocalStore, draft: StoredDraft): void {
  store.setMeta(DRAFT_KEY, JSON.stringify(draft));
}

const REQUIRED: (keyof ProfileDraft)[] = ['description', 'duration', 'price', 'capacity', 'meeting_instructions', 'availability'];

export function missingFields(fields: ProfileDraft): (keyof ProfileDraft)[] {
  return REQUIRED.filter((key) => fields[key] === undefined);
}

export function registerCoordinatorTools(harness: Harness, store: LocalStore, now: () => string): void {
  harness.register(
    defineTool({
      name: 'get_setup_status',
      description: 'Setup steps and their status.',
      args: z.object({}),
      approval: 'none',
      run: async () => setupSummary(readProgress(store)),
    }),
    ['coordinator'],
  );
  harness.register(
    defineTool({
      name: 'read_profile_draft',
      description: 'The profile draft and its missing fields.',
      args: z.object({}),
      approval: 'none',
      run: async () => {
        const draft = readDraft(store);
        return { business_name: readConfig(store).business?.name ?? null, ...draft, missing: missingFields(draft.fields) };
      },
    }),
    ['coordinator'],
  );
  harness.register(
    defineTool({
      name: 'save_profile_draft',
      description: 'Save details the operator stated. Omit anything not stated.',
      args: ProfileDraft,
      approval: 'none',
      run: async (fields) => {
        const draft = readDraft(store);
        // A change after approval needs a fresh approval.
        writeDraft(store, { fields: { ...draft.fields, ...fields }, status: 'DRAFT', updatedAt: now() });
        const saved = Object.keys(fields);
        return { saved, missing: missingFields({ ...draft.fields, ...fields }) };
      },
    }),
    ['coordinator'],
  );
  harness.register(
    defineTool({
      name: 'approve_profile_draft',
      description: 'Ask the operator to approve the complete draft.',
      args: z.object({}),
      approval: 'operator',
      run: async () => {
        const draft = readDraft(store);
        const missing = missingFields(draft.fields);
        if (missing.length) throw new Error(`The draft is missing: ${missing.join(', ')}`);
        writeDraft(store, { ...draft, status: 'APPROVED', updatedAt: now() });
        return { status: 'APPROVED' };
      },
    }),
    ['coordinator'],
  );
}
