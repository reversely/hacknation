import type { FarmProfile } from '@wren/contracts';

import type { Translate } from '../inference/translator';
import { readConfig } from '../setup/setupStore';
import type { LocalStore } from '../store/localStore';
import { WEBSITE_URL_KEY } from '../website/appsScriptWebsite';
import { buildFarmRecord, type DraftFields } from './farmRecord';
import { DEFAULT_WEBSITE_PAGE, generateWebsitePage, renderWebsitePreviewHtml, validateWebsitePage, type JsonGenerator, type WebsitePage } from './websiteCreator';

// The website flow in the chat (docs/website-creator.md): the approval card shows the page this draft
// produces, rendered on the phone and editable; approving saves it on the phone; publishing to the
// Apps Script site is a separate step with its own approval.

export type PublicationDeps = {
  translate: Translate | null;
  // The website model; without one the page uses the fixed default copy.
  generateCopy: JsonGenerator | null;
  newId: () => string;
  now: () => string;
  // Runs the outbox now, so an approved page reaches the spreadsheet (and the Apps Script site)
  // without waiting for the next sync cycle. Absent when Google is not wired in.
  sync?: () => Promise<unknown>;
};

// Where the approved page ended up, for the reply in the chat.
export type PublishResult =
  | { state: 'LIVE'; url: string }
  | { state: 'NO_SITE' }
  | { state: 'QUEUED'; url: string | null };

export type Publication = { record: FarmProfile; page: WebsitePage; html: string };

// The preview and the approval must publish the same page, so one preparation per draft is kept
// for each store.
const prepared = new WeakMap<LocalStore, { key: string; publication: Promise<Publication> }>();

function draftKey(store: LocalStore, fields: DraftFields): string {
  return JSON.stringify({ fields, business: readConfig(store).business });
}

// True when the page prepared for the preview matches the current draft.
export function previewIsCurrent(store: LocalStore, fields: DraftFields): boolean {
  return prepared.get(store)?.key === draftKey(store, fields);
}

export function preparePublication(store: LocalStore, fields: DraftFields, deps: PublicationDeps): Promise<Publication> {
  const business = readConfig(store).business;
  const key = draftKey(store, fields);
  const cached = prepared.get(store);
  if (cached?.key === key) return cached.publication;
  const publication = (async () => {
    const existing = store.list<FarmProfile>('Farm')[0] ?? null;
    const record = await buildFarmRecord({ fields, business, existing, translate: deps.translate, newId: deps.newId, now: deps.now() });
    const page = deps.generateCopy
      ? await generateWebsitePage(deps.generateCopy, deps.translate ?? (async (text) => text), record)
      : DEFAULT_WEBSITE_PAGE;
    const published = { ...record, page };
    return { record: published, page, html: renderWebsitePreviewHtml(published, page) };
  })();
  prepared.set(store, { key, publication });
  // A failed preparation is not reused.
  publication.catch(() => {
    if (prepared.get(store)?.publication === publication) prepared.delete(store);
  });
  return publication;
}

// The operator's edits to the headline or introduction in the preview. The edited page replaces the
// prepared one, so approval saves exactly what the preview last showed.
export async function editPublication(
  store: LocalStore,
  fields: DraftFields,
  deps: PublicationDeps,
  edits: Partial<Pick<WebsitePage, 'headline' | 'introduction'>>,
): Promise<Publication> {
  const current = await preparePublication(store, fields, deps);
  const page = validateWebsitePage({ ...current.page, ...edits });
  const record = { ...current.record, page };
  const edited = { record, page, html: renderWebsitePreviewHtml(record, page) };
  prepared.set(store, { key: draftKey(store, fields), publication: Promise.resolve(edited) });
  return edited;
}

// Approving the content keeps it on the phone; nothing goes online yet.
export function saveApproved(store: LocalStore, publication: Publication): void {
  store.upsert('Farm', publication.record);
}

// The separate publish step: queues the Farm row write for the approved page and runs it. The Apps
// Script site reads that row, so a completed write puts the page online.
export async function publishToWebsite(store: LocalStore, deps: PublicationDeps): Promise<PublishResult> {
  const farm = publishedFarm(store);
  if (!farm) throw new Error('There is no approved page to publish.');
  const now = deps.now();
  const actionId = deps.newId();
  store.enqueue({ id: actionId, type: 'save_profile', approved_by: 'OPERATOR', approved_at: now, profile: farm }, now);
  const url = store.getMeta(WEBSITE_URL_KEY);
  if (!url) return { state: 'NO_SITE' };
  await deps.sync?.().catch(() => undefined);
  const receipt = store.outbox().find((entry) => entry.id === actionId);
  return receipt?.status === 'COMPLETED' ? { state: 'LIVE', url } : { state: 'QUEUED', url };
}

export function publishedFarm(store: LocalStore): FarmProfile | null {
  return store.list<FarmProfile>('Farm').find((farm) => farm.status === 'APPROVED' && farm.page) ?? null;
}
