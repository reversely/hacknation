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
  description: stated('What the tour is, in the operator\'s words').optional(),
  duration: stated('How long the tour lasts, for example "2 hours"').optional(),
  price: stated('Price per person with currency, for example "1500 KES"').optional(),
  capacity: z.number().int().positive().describe('Most visitors per tour').optional(),
  meeting_instructions: stated('Where and how visitors meet the operator').optional(),
  availability: stated('Days and times tours run').optional(),
  policies: stated('Cancellation, children, weather and other rules').optional(),
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
      description: 'List the setup steps with their status, so you can tell the operator what to do next.',
      args: z.object({}),
      approval: 'none',
      run: async () => setupSummary(readProgress(store)),
    }),
    ['coordinator'],
  );
  harness.register(
    defineTool({
      name: 'read_profile_draft',
      description: 'Read the business profile draft and the fields still missing.',
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
      description: 'Save tour details the operator stated to the business profile draft. Only include fields the operator actually said.',
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
      description: 'Ask the operator to approve the profile draft so it can be used for the website and listings.',
      args: z.object({}),
      approval: 'operator',
      precondition: () => {
        const missing = missingFields(readDraft(store).fields);
        return missing.length ? `The draft is missing: ${missing.join(', ')}. Ask the operator for them.` : null;
      },
      run: async () => {
        const draft = readDraft(store);
        writeDraft(store, { ...draft, status: 'APPROVED', updatedAt: now() });
        return { status: 'APPROVED' };
      },
    }),
    ['coordinator'],
  );
}
