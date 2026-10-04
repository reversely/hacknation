// Wren demonstration Space: the phone, its English twin when the chosen language is not English, and
// the narration panel (docs/space.md).

import { buildSite, type BuildResult, type SiteContent } from '../../../app/src/survey/pipeline';
import type { Language } from '../../../app/src/survey/survey';
import { wrenWordmark as wordmark } from './assets/generated';
import { answerQuestion, pipelineDeps, reviewSentiment, type Reporters } from './inference';
import { cachedTranslation, translate, type ModelEvent, type TranslationEvent } from './models';
import { narration } from './narration';
import { dots, SCREENS, stringsFor, type Context, type ScreenId } from './screens';
import { englishSurvey, initialState, toSurvey, type State } from './state';
import css from './styles.css' with { type: 'text' };
import { h } from './ui';
import { siteWindow, type VisitorItem } from './site';
import { siteSlug } from './state';

const state: State = initialState();
let current: ScreenId = 'language';
const events: TranslationEvent[] = [];
const modelEvents: ModelEvent[] = [];
const problems: string[] = [];
const sites: Partial<Record<Language, string>> = {};
const contents: Partial<Record<Language, SiteContent>> = {};
let result: BuildResult | null = null;
let buildError: string | null = null;
// What visitors did on the site; each item waits for the operator's decision on the phone.
const items: VisitorItem[] = [];
let nextId = 1;
let editing: number | null = null;
let showing: Language = 'sw';

function mount(): void {
  const root = document.getElementById('wren-root');
  if (!root) {
    requestAnimationFrame(mount);
    return;
  }
  // A shadow root keeps Gradio's page styles away from the design; only styles.css applies inside.
  const shadow = root.shadowRoot ?? root.attachShadow({ mode: 'open' });
  const phones = { main: h('div', { class: 'screen' }), twin: h('div', { class: 'screen' }) };
  const columns = { main: h('div', { class: 'phone-column' }), twin: h('div', { class: 'phone-column twin' }) };
  const narrationSlot = h('div', { class: 'narration-slot' });
  const stage = h('div', { class: 'wren-stage' });
  shadow.replaceChildren(h('style', {}, css), stage);
  const footers: { button: HTMLButtonElement; enabled: () => boolean }[] = [];

  const report = (event: TranslationEvent) => {
    events.push(event);
    refreshNarration();
  };
  const reporters: Reporters = {
    translation: report,
    model: (event) => {
      modelEvents.push(event);
      refreshNarration();
    },
    problem: (text) => {
      problems.push(text);
      refreshNarration();
    },
  };
  const deps = pipelineDeps(reporters);
  const twinShown = () => state.language !== 'en';

  // Text the operator typed, shown in the English twin: the cached translation at once, otherwise
  // the original until a debounced translate call returns.
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const live = (text: string): string => {
    if (!text.trim()) return text;
    const cached = cachedTranslation(text, state.language, 'en');
    if (cached !== undefined) return cached;
    pending.add(text);
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const batch = [...pending];
      pending.clear();
      try {
        await translate(batch, state.language, 'en', report);
      } catch (error) {
        reporters.problem(`Live translation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (twinShown()) renderPhone('twin');
    }, 700);
    return text;
  };

  const ctxFor = (phone: 'main' | 'twin'): Context => {
    const language: Language = phone === 'main' ? state.language : 'en';
    return {
      state,
      language,
      s: stringsFor(language),
      live: phone === 'twin' ? live : (text) => text,
      siteHtml: sites[language] ?? null,
      inbox: {
        items,
        url: `wren.site/${siteSlug(state.name)}`,
        editing,
        edit(id) {
          editing = id;
          render();
        },
        approve(id, reply) {
          const item = items.find((i) => i.id === id);
          if (!item) return;
          item.status = 'approved';
          if (item.kind === 'question') item.reply = reply ?? item.draft;
          editing = null;
          render();
        },
        decline(id) {
          const item = items.find((i) => i.id === id);
          if (item) item.status = 'declined';
          editing = null;
          render();
        },
      },
      go(screen) {
        current = screen;
        if (screen === 'building') void build();
        render();
      },
      redraw: () => render(),
      changed() {
        footers.forEach((f) => (f.button.disabled = !f.enabled()));
        if (twinShown()) renderPhone('twin');
        refreshNarration();
      },
    };
  };

  async function build(): Promise<void> {
    result = null;
    buildError = null;
    try {
      const survey = toSurvey(state);
      result = await buildSite(survey, deps);
      sites[state.language] = result.html;
      contents[state.language] = result.site;
      showing = state.language;
      if (twinShown()) {
        // The twin's English page: the same survey with the operator's words in English. Every
        // translation and coder call repeats one the main build made, so the caches answer.
        const english = await englishSurvey(survey, (text) => deps.translate(text, state.language, 'en'));
        const twin = await buildSite(english, deps);
        sites.en = twin.html;
        contents.en = twin.site;
      }
    } catch (error) {
      buildError = `The site could not be created: ${error instanceof Error ? error.message : String(error)}`;
    }
    current = 'site';
    render();
  }

  function refreshNarration(): void {
    narrationSlot.replaceChildren(narration(current, state, events, modelEvents, problems, result, buildError));
  }

  function renderPhone(phone: 'main' | 'twin'): void {
    const ctx = ctxFor(phone);
    const screen = SCREENS[current](ctx);
    const top = h(
      'div',
      { class: 'topbar' },
      h('button', { class: 'icon-button', 'aria-label': 'Back', hidden: screen.bare || !screen.back, onclick: () => screen.back && ctx.go(screen.back) }, '←'),
      h('img', { class: 'wordmark', src: wordmark, alt: 'Wren' }),
      screen.bare ? h('span') : h('button', { class: 'icon-button', 'aria-label': 'Help' }, h('span', { class: 'help' }, '?')),
    );
    let footer: HTMLElement | null = null;
    if (screen.footer) {
      const button = h('button', { class: screen.footer.secondary ? 'secondary' : 'primary', type: 'button', onclick: screen.footer.action }, screen.footer.label) as HTMLButtonElement;
      button.disabled = !screen.footer.enabled();
      if (phone === 'main') footers.push({ button, enabled: screen.footer.enabled });
      footer = h('div', { class: 'footer' }, button, screen.dot !== undefined ? dots(screen.dot) : null);
    }
    phones[phone].replaceChildren(
      h('div', { class: 'statusbar', 'aria-hidden': 'true' }, h('span', {}, '9:41'), h('span', { class: 'icons' }, '▂▄▆ ◉ ▭')),
      top,
      h('div', { class: `body ${current === 'signin' ? 'signin-body' : ''}` }, ...screen.body),
      ...(footer ? [footer] : []),
    );
  }

  // The visitor's browser: the live site, kept at its scroll position across redraws.
  const siteSlot = h('div', { class: 'phone-column site-slot' });
  function visitorColumn(site: SiteContent): HTMLElement {
    const scroll = siteSlot.querySelector('.farm-site')?.scrollTop ?? 0;
    const languages = (Object.keys(contents) as Language[]).sort((a) => (a === state.language ? -1 : 1));
    const view = {
      site,
      slug: siteSlug(state.name),
      items,
      languages,
      showing: site.language,
      show(language: Language) {
        showing = language;
        render();
      },
      book(booking: Parameters<Parameters<typeof siteWindow>[0]['book']>[0]) {
        // A booking request needs no model: it waits on the phone for the operator.
        items.push({ kind: 'booking', id: nextId++, status: 'pending', ...booking });
        render();
      },
      ask(text: string, language: Language) {
        const item: VisitorItem = { kind: 'question', id: nextId++, text, draft: null, reply: null, status: 'pending', language };
        items.push(item);
        render();
        answerQuestion(contents[language] ?? site, text, reporters)
          .then((draft) => (item.draft = draft))
          .catch((error) => {
            item.draft = '';
            reporters.problem(`The reply draft failed: ${error instanceof Error ? error.message : String(error)}`);
          })
          .finally(render);
      },
      review(text: string, stars: number, name: string) {
        const item: VisitorItem = { kind: 'review', id: nextId++, text, stars, name, sentiment: null, status: 'pending' };
        items.push(item);
        render();
        reviewSentiment(text, reporters)
          .then((sentiment) => (item.sentiment = sentiment))
          .catch((error) => {
            item.sentiment = 'unclear';
            reporters.problem(`Sentiment failed: ${error instanceof Error ? error.message : String(error)}`);
          })
          .finally(render);
      },
    };
    const label = h('div', { class: 'phone-label' }, h('span', { class: 'lang' }, site.language === 'sw' ? 'Kiswahili' : 'English'), h('span', { class: 'kind' }, "Visitor's browser"));
    siteSlot.replaceChildren(label, siteWindow(view));
    const page = siteSlot.querySelector('.farm-site');
    if (page) page.scrollTop = scroll;
    return siteSlot;
  }

  function render(): void {
    footers.length = 0;
    renderPhone('main');
    const label = (language: string, kind: string) => h('div', { class: 'phone-label' }, h('span', { class: 'lang' }, language), h('span', { class: 'kind' }, kind));
    columns.main.replaceChildren(label(state.language === 'en' ? 'English' : 'Kiswahili', "Operator's phone"), h('div', { class: 'phone', role: 'region', 'aria-label': "Operator's phone" }, phones.main));
    const children: HTMLElement[] = [columns.main];
    if (twinShown()) {
      renderPhone('twin');
      // The twin mirrors the operator's phone and takes no input of its own.
      columns.twin.replaceChildren(label('English', 'Twin, translated'), h('div', { class: 'phone', role: 'region', 'aria-label': 'English twin', inert: true }, phones.twin));
      children.push(columns.twin);
    }
    const site = current === 'site' ? contents[showing] ?? contents[state.language] : undefined;
    if (site) children.push(visitorColumn(site));
    children.push(narrationSlot);
    stage.replaceChildren(...children);
    stage.classList.toggle('with-twin', twinShown());
    stage.classList.toggle('with-site', Boolean(site));
    refreshNarration();
  }

  render();
}

mount();
