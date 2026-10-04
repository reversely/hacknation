import type { FarmProfile } from '@wren/contracts';

import type { Translate } from '../inference/translator';
import { readConfig } from '../setup/setupStore';
import type { LocalStore } from '../store/localStore';
import { buildFarmRecord, type DraftFields } from './farmRecord';
import { DEFAULT_WEBSITE_PAGE, generateWebsitePage, renderWebsitePreviewHtml, type JsonGenerator, type WebsitePage } from './websiteCreator';

// One approval in the chat publishes the profile (docs/website-creator.md): the approval card shows
// the page this draft would produce, and approving saves the Farm record with that page and queues
// the Farm row write that the Apps Script page reads.

export type PublicationDeps = {
  translate: Translate | null;
  // The website model; without one the page uses the fixed default copy.
  generateCopy: JsonGenerator | null;
  newId: () => string;
  now: () => string;
};

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

// Saves the approved record locally and queues the Farm row write; the outbox runs it against the
// operator's spreadsheet when Google is connected.
export function publish(store: LocalStore, publication: Publication, deps: PublicationDeps): void {
  const now = deps.now();
  store.upsert('Farm', publication.record);
  store.enqueue({ id: deps.newId(), type: 'save_profile', approved_by: 'OPERATOR', approved_at: now, profile: publication.record }, now);
}

export function publishedFarm(store: LocalStore): FarmProfile | null {
  return store.list<FarmProfile>('Farm').find((farm) => farm.status === 'APPROVED' && farm.page) ?? null;
}
