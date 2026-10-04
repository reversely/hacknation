// The demonstration's narration: the role panel on the left, the numbered step under the device,
// and the model details behind "How it works" (docs/space.md, Narration panel).

import type { BuildResult } from '../../../app/src/survey/pipeline';
import type { ModelEvent, TranslationEvent } from './models';
import type { ScreenId } from './screens';
import type { SitePage } from './site';
import { businessComplete, scheduleComplete, serviceComplete, toSurvey, type State } from './state';
import { h } from './ui';

export type Mode = 'operator' | 'visitor';
type Step = { title: string; text: string; model: string | null };

export const ROLES: Record<Mode, { title: string; text: string }> = {
  operator: { title: 'Farm-tour operator', text: 'The operator sets up the business on the phone in their own language, and approves everything Wren drafts before a visitor sees it.' },
  visitor: { title: 'Visitor', text: "A visitor finds the farm's website, books a visit, asks questions and leaves a review, in the operator's language or in English." },
};

const OPERATOR: Record<ScreenId, Step> = {
  language: { title: 'Choose a language', text: 'Every screen and the generated site use only this language. When it is not English, an English twin of the phone appears beside it.', model: null },
  signin: { title: 'Sign in', text: "On the phone, Wren signs in with the operator's own Google account. This demonstration makes no Google call.", model: null },
  business: { title: 'Describe the business', text: "The name and phone number go straight into the survey; a local number gains its country code in code. In the twin, the operator's own words are translated live.", model: 'NLLB-200 600M, for the twin only' },
  services: { title: 'List what visitors can book', text: 'Each service keeps its own duration, price and capacity. Numbers never pass through a model; only a custom name or a sentence about the service is free text.', model: 'NLLB-200 600M, for the twin only' },
  availability: { title: 'Set the days and times', text: 'The chosen days and time slots become the booking calendar. Kiswahili pages show times on the Swahili clock, which counts hours from dawn.', model: null },
  review: { title: 'Check before creating', text: 'Nothing is created until the operator presses the button, and every check must pass first.', model: null },
  building: { title: 'Create the site', text: "The operator's free text crosses into English, the coding model writes short copy under a JSON schema, checks reject anything not in the facts, and the copy crosses back into the chosen language.", model: 'NLLB-200 600M and Qwen2.5-Coder 1.5B' },
  site: { title: 'Approve what visitors asked for', text: "Bookings, questions the chat could not answer, and reviews wait on the operator's phone. Wren drafts a reply from the site's facts and labels each review's sentiment; nothing reaches the visitor until the operator approves it.", model: 'Gemma 4 E2B' },
};

const VISITOR: Record<SitePage, Step> = {
  home: { title: 'Find the farm', text: "The farm's site carries its own design. Its headline and introduction come from the coding model; prices, durations and capacities come straight from the survey.", model: null },
  book: { title: 'Book a visit', text: 'A booking returns a reference code that encodes the experience, date, time and party size with a check character, so the visitor can look it up again with no backend. The farm confirms it from the phone.', model: null },
  ask: { title: 'Ask a question', text: "A 0.5B-parameter chat model answers from the site's facts and published reviews. A Kiswahili question crosses into English and the answer crosses back. A question the facts cannot answer goes to the operator.", model: 'Qwen2.5 0.5B Instruct and NLLB-200 600M' },
  reviews: { title: 'Leave a review', text: 'A review waits for the operator, who sees its sentiment label and decides whether to publish it.', model: 'Gemma 4 E2B, on the phone' },
  contact: { title: 'Get in touch', text: 'The phone number, location, open days and times come straight from the survey.', model: null },
};

const ORDER: { mode: Mode; key: string }[] = [
  ...(['language', 'signin', 'business', 'services', 'availability', 'review', 'building'] as const).map((key) => ({ mode: 'operator' as const, key })),
  ...(['home', 'book', 'ask', 'reviews', 'contact'] as const).map((key) => ({ mode: 'visitor' as const, key })),
  { mode: 'operator', key: 'site' },
];

export function step(mode: Mode, key: ScreenId | SitePage): Step & { n: number; total: number } {
  const info = mode === 'operator' ? OPERATOR[key as ScreenId] : VISITOR[key as SitePage];
  return { ...info, n: ORDER.findIndex((s) => s.mode === mode && s.key === key) + 1, total: ORDER.length };
}

function translationList(events: TranslationEvent[]): HTMLElement | null {
  if (!events.length) return null;
  return h(
    'div',
    { class: 'panel translations' },
    h('h3', {}, 'Translations'),
    h(
      'ol',
      { class: 'steps' },
      ...events.slice(-8).map((e, i) =>
        h(
          'li',
          {},
          h('span', { class: 'n' }, String(i + 1)),
          h('span', {}, h('div', { class: 'pair' }, h('span', {}, e.text), h('span', { 'aria-hidden': 'true' }, '→'), h('strong', {}, e.result)), h('div', { class: 'meta' }, `${e.source} to ${e.target}, ${e.from === 'model' ? `NLLB-200 600M, ${e.ms} ms` : e.from}`)),
        ),
      ),
    ),
  );
}

function buildReport(result: BuildResult | null, error: string | null): HTMLElement | null {
  if (error) return h('div', { class: 'panel' }, h('h3', {}, 'Site pipeline'), h('p', {}, error));
  if (!result) return null;
  const rows: [string, string][] = [
    ['Free text into English', `${result.ms.translateIn} ms`],
    ['Website copy (coding model)', result.fellBack ? `fell back to the operator's words after ${result.attempts} attempts` : `${result.attempts} attempt${result.attempts > 1 ? 's' : ''}, ${result.ms.coder} ms`],
    ['Copy into the chosen language', `${result.ms.translateOut} ms`],
    ['Total', `${result.ms.total} ms`],
  ];
  return h(
    'div',
    { class: 'panel' },
    h('h3', {}, 'Site pipeline'),
    h('ol', { class: 'steps' }, ...rows.map(([stage, detail], i) => h('li', {}, h('span', { class: 'n' }, String(i + 1)), h('span', {}, h('strong', {}, `${stage}: `), detail)))),
    result.problems.length ? h('p', { class: 'meta' }, `Last check result: ${result.problems.join('; ')}`) : null,
  );
}

function modelList(events: ModelEvent[], problems: string[]): HTMLElement | null {
  if (!events.length && !problems.length) return null;
  return h(
    'div',
    { class: 'panel' },
    h('h3', {}, 'Model calls'),
    h('ol', { class: 'steps' }, ...events.slice(-8).map((e, i) => h('li', {}, h('span', { class: 'n' }, String(i + 1)), h('span', {}, h('strong', {}, `${e.summary}: `), e.from === 'model' ? `${e.model}, ${e.ms} ms` : e.from)))),
    ...problems.slice(-3).map((text) => h('p', { class: 'meta' }, text)),
  );
}

function survey(state: State): unknown {
  const ready = businessComplete(state) && state.services.every(serviceComplete) && scheduleComplete(state);
  return ready ? toSurvey(state) : { language: state.language, business: { name: state.name || null, phone: state.phone || null }, services: state.services.length, days: state.days, slots: state.slots };
}

// Kept open across redraws once the viewer opens it.
let detailsOpen = false;

export function details(state: State, events: TranslationEvent[], modelEvents: ModelEvent[], problems: string[], result: BuildResult | null, error: string | null): HTMLElement {
  const el = h(
    'details',
    { class: 'how' },
    h('summary', {}, 'How it works'),
    h('div', { class: 'how-body' }, buildReport(result, error), modelList(modelEvents, problems), translationList(events), h('div', { class: 'panel' }, h('h3', {}, 'Survey so far'), h('pre', {}, JSON.stringify(survey(state), null, 2)))),
  ) as HTMLDetailsElement;
  el.open = detailsOpen;
  el.addEventListener('toggle', () => (detailsOpen = el.open));
  return el;
}
