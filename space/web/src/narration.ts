// The narration panel: what the current screen does, every translation made so far, and the site
// pipeline's own report (docs/space.md, Narration panel).

import type { BuildResult } from '../../../app/src/survey/pipeline';
import type { ModelEvent, TranslationEvent } from './models';
import type { ScreenId } from './screens';
import { businessComplete, scheduleComplete, serviceComplete, toSurvey, type State } from './state';
import { h } from './ui';

type Copy = { title: string; text: string; model: string | null };

const COPY: Record<ScreenId, Copy> = {
  language: { title: 'The operator picks a language', text: 'Every screen and the generated site use only this language. When it is not English, an English twin of the phone appears beside it, so this demonstration stays readable.', model: null },
  signin: { title: 'Signing in', text: "On the phone, Wren signs in with the operator's own Google account. This demonstration makes no Google call.", model: null },
  business: { title: 'Contact details', text: "The name and phone number go straight into the survey. A local number gains its country code in code, not in a model. In the twin, the operator's own words are translated live.", model: 'translation, for the twin only' },
  services: { title: 'What visitors can book', text: 'Each service keeps its own duration, price and capacity. Numbers never pass through a model; only a custom name or a sentence about the service is free text.', model: 'translation, for the twin only' },
  availability: { title: 'When visitors can book', text: 'The chosen days and time slots become the booking calendar. Kiswahili pages show times on the Swahili clock, which counts hours from dawn.', model: null },
  review: { title: 'Review before creating the site', text: 'Nothing is created until the operator presses the button. Every check must pass first.', model: null },
  building: { title: 'Creating the site', text: "The operator's free text crosses into English, the coding model writes short English copy under a JSON schema, checks reject anything not in the facts, and the copy crosses back into the chosen language.", model: 'translation and website copy' },
  site: { title: 'The site is live; the operator decides', text: "The browser on the right shows the farm's public site as a visitor sees it, in its own design. A visitor can request a booking, ask a question or leave a review there. Each one arrives on the operator's phone first: Wren drafts a reply to a question from the site's facts only and labels a review's sentiment, and nothing reaches the visitor until the operator approves it.", model: 'reply drafts and review sentiment' },
};

function translationList(events: TranslationEvent[]): HTMLElement | null {
  if (!events.length) return null;
  return h(
    'div',
    { class: 'panel translations' },
    h('h3', {}, 'Translations'),
    h(
      'ol',
      { class: 'steps' },
      ...events.slice(-10).map((e, i) =>
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

function survey(state: State): unknown {
  const ready = businessComplete(state) && state.services.every(serviceComplete) && scheduleComplete(state);
  return ready ? toSurvey(state) : { language: state.language, business: { name: state.name || null, phone: state.phone || null }, services: state.services.length, days: state.days, slots: state.slots };
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

export function narration(screen: ScreenId, state: State, events: TranslationEvent[], modelEvents: ModelEvent[], problems: string[], result: BuildResult | null, error: string | null): HTMLElement {
  const copy = COPY[screen];
  return h(
    'section',
    { class: 'narration', 'aria-live': 'polite' },
    h('h2', {}, copy.title),
    h('p', {}, copy.text),
    h('div', {}, copy.model ? h('span', { class: 'tag' }, `Model: ${copy.model}`) : h('span', { class: 'tag none' }, 'No model on this screen')),
    h('div', { class: 'gap' }),
    buildReport(result, error),
    modelList(modelEvents, problems),
    translationList(events),
    h('div', { class: 'panel' }, h('h3', {}, 'Survey so far'), h('pre', {}, JSON.stringify(survey(state), null, 2))),
  );
}
