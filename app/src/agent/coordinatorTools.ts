import { z } from 'zod';

import type { Translate } from '../inference/translator';
import { readConfig, readProgress } from '../setup/setupStore';
import { currentStep, setupSummary } from '../setup/steps';
import type { LocalStore } from '../store/localStore';
import { newId } from '../store/ids';
import { farmRecordProblems } from './farmRecord';
import { preparePublication, previewIsCurrent, publishedFarm, publishToWebsite, saveApproved, type PublicationDeps } from './publication';
import type { JsonGenerator } from './websiteCreator';
import { defineTool, type Harness } from './harness';
import { TEXT, type Language } from './language';

// The business profile is the base of every promotional item: the website, the listings and the
// replies are all written from it (docs/architecture.md section 4, step 1). Until the Sheets store is
// connected, the draft lives on the phone.
const DRAFT_KEY = 'profile_draft';

// Small models fill fields the operator never mentioned: with a placeholder ("TBD", "not
// specified") or with the field's own description copied in as the value. Both are rejected, so
// the field stays missing and the agent asks for it.
const PLACEHOLDER = /^(tbd|tba|n\/?a|unknown|none|-+|\?+)$|\bnot (specified|stated|provided|given|mentioned)\b/i;
const sameText = (a: string, b: string) => a.toLowerCase().replace(/\W+/g, ' ').trim() === b.toLowerCase().replace(/\W+/g, ' ').trim();
const stated = (hint: string) => z.string().trim().min(1).describe(hint);

// Drops invented values field by field, so the details the operator did state are still saved.
export function keepStated(fields: ProfileDraft): { kept: ProfileDraft; dropped: string[] } {
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  const seen: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const hint: string = FIELD_HINTS[key as keyof typeof FIELD_HINTS] ?? '';
    // The model has copied one stated value (the meeting place) into fields never mentioned.
    const copied = typeof value === 'string' && seen.some((earlier) => sameText(earlier, value));
    if (typeof value === 'string' && (PLACEHOLDER.test(value) || sameText(value, hint) || copied)) dropped.push(key);
    else kept[key] = value;
    if (typeof value === 'string') seen.push(value);
  }
  return { kept: kept as ProfileDraft, dropped };
}

// What each field means, shown to the model as the field's description.
const FIELD_HINTS = {
  name: 'The business name, if the operator states it',
  description: "What the tour is, in the operator's words",
  duration: 'How long the tour lasts, for example "2 hours"',
  price: 'Price per person with currency, for example "1500 KES"',
  capacity: 'Most visitors per tour',
  meeting_instructions: 'Where and how visitors meet the operator',
  availability: 'Days and times tours run',
  policies: 'Cancellation, children, weather and other rules',
} as const;

export const ProfileDraft = z.object({
  name: stated(FIELD_HINTS.name).optional(),
  description: stated(FIELD_HINTS.description).optional(),
  duration: stated(FIELD_HINTS.duration).optional(),
  price: stated(FIELD_HINTS.price).optional(),
  capacity: z.number().int().positive().describe(FIELD_HINTS.capacity).optional(),
  meeting_instructions: stated(FIELD_HINTS.meeting_instructions).optional(),
  availability: stated(FIELD_HINTS.availability).optional(),
  policies: stated(FIELD_HINTS.policies).optional(),
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

const REQUIRED = ['description', 'duration', 'price', 'capacity', 'meeting_instructions', 'availability'] as const;
type RequiredField = (typeof REQUIRED)[number];

export function missingFields(fields: ProfileDraft): RequiredField[] {
  return REQUIRED.filter((key) => fields[key] === undefined);
}



// What the operator reads for "what have you saved": the stored values and the next question,
// written by the app in the operator's language.
export function describeDraft(fields: ProfileDraft, missing: RequiredField[], language: Language): string {
  const text = TEXT[language];
  const saved = (Object.keys(text.fields) as (keyof ProfileDraft)[])
    .filter((key) => fields[key] !== undefined)
    .map((key) => `${text.fields[key]}: ${fields[key]}`);
  const parts = [saved.length ? `${text.saved}: ${saved.join('; ')}.` : text.nothingSaved];
  if (missing.length) parts.push(text.questions[missing[0]]);
  return parts.join(' ');
}

// The translator, when set, writes the Kiswahili side of the Farm record built at approval.
export function registerCoordinatorTools(
  harness: Harness,
  store: LocalStore,
  now: () => string,
  language: () => Language,
  translate: Translate | null = null,
  generateCopy: JsonGenerator | null = null,
  sync?: () => Promise<unknown>,
): void {
  const publication: PublicationDeps = { translate, generateCopy, newId, now, sync };
  // Every turn must call a tool (tool_choice "required"): Gemma 4 understood Kiswahili requests
  // but, left to choose, answered in text and never called a tool. Plain conversation goes here.
  harness.register(
    defineTool({
      name: 'reply_to_operator',
      description: 'Say something to the operator, such as a question or an answer, when no other tool fits.',
      args: z.object({ text: z.string().trim().min(1).describe('What to say, in the operator\'s language') }),
      approval: 'none',
      run: async ({ text }) => ({ reply: text, said_by_model: true }),
    }),
    ['coordinator'],
  );
  harness.register(
    defineTool({
      name: 'get_setup_status',
      description: 'List the setup steps with their status, so you can tell the operator what to do next.',
      args: z.object({}),
      approval: 'none',
      // The app answers from the saved progress, so the reply cannot misstate it.
      run: async () => {
        const progress = readProgress(store);
        const next = currentStep(progress);
        const text = TEXT[language()];
        return { steps: setupSummary(progress), reply: next ? `${text.nextStep}: ${text.steps[next]}.` : text.allStepsDone };
      },
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
        const missing = missingFields(draft.fields);
        return { business_name: readConfig(store).business?.name ?? null, ...draft, missing, reply: describeDraft(draft.fields, missing, language()) };
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
        const { kept, dropped } = keepStated(fields);
        // A change after approval needs a fresh approval.
        writeDraft(store, { fields: { ...draft.fields, ...kept }, status: 'DRAFT', updatedAt: now() });
        const missing = missingFields({ ...draft.fields, ...kept });
        return {
          saved: Object.keys(kept),
          ...(dropped.length ? { not_saved_because_not_stated: dropped } : {}),
          missing,
          // A complete draft goes straight to the approval card: left to choose, the model asked for the
          // setup status instead.
          ...(missing.length ? { follow_up: TEXT[language()].questions[missing[0]] } : { next_tool: 'approve_profile_draft' }),
        };
      },
    }),
    ['coordinator'],
  );
  harness.register(
    defineTool({
      name: 'approve_profile_draft',
      description: 'Ask the operator to approve the profile draft and its website page; approving saves them on the phone.',
      args: z.object({}),
      approval: 'operator',
      // Approval builds the Farm record the website and listings read, so everything that record
      // needs is checked here, before the operator is asked: missing fields, a duration or price the
      // app cannot read, and the WhatsApp number from Setup.
      precondition: () => {
        const fields = readDraft(store).fields;
        const text = TEXT[language()];
        const problems = farmRecordProblems(fields, readConfig(store).business);
        if (problems.includes('whatsapp_number') && problems.length === 1) return text.whatsappMissing;
        const ask = problems.filter((field): field is keyof typeof text.questions => field in text.questions);
        if (!ask.length) return problems.length ? text.whatsappMissing : null;
        return `${text.draftIncomplete} ${text.stillNeeded}: ${ask.map((field) => text.fields[field]).join(', ')}. ${text.questions[ask[0]]}`;
      },
      // The approval card showed this same page (preparePublication keeps one per draft).
      run: async () => {
        const draft = readDraft(store);
        // The operator approved the page in the preview; a draft changed since then is not published.
        if (!previewIsCurrent(store, draft.fields)) throw new Error(TEXT[language()].draftChanged);
        const prepared = await preparePublication(store, draft.fields, publication);
        saveApproved(store, prepared);
        writeDraft(store, { ...draft, status: 'APPROVED', updatedAt: now() });
        return { status: 'APPROVED', farm_id: prepared.record.id, version: prepared.record.version, reply: TEXT[language()].pageSaved, can_publish: true };
      },
    }),
    ['coordinator'],
  );
  // Publishing is its own approval: the saved page goes to the spreadsheet the Apps Script site reads.
  harness.register(
    defineTool({
      name: 'publish_website',
      description: 'Ask the operator to publish the approved page to the public website.',
      args: z.object({}),
      approval: 'operator',
      operatorOnly: true,
      precondition: () => (publishedFarm(store) ? null : TEXT[language()].nothingToPublish),
      run: async () => {
        const result = await publishToWebsite(store, publication);
        const text = TEXT[language()];
        const reply = result.state === 'LIVE' ? text.websiteLive : result.state === 'NO_SITE' ? text.websiteNeedsSetup : text.websiteQueued;
        return { status: 'PUBLISHED', reply, website: result };
      },
    }),
    ['coordinator'],
  );
}
