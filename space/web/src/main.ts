// Wren demonstration Space (docs/space.md). Two sides: the operator creates the site on the phone (with
// an English twin when the chosen language is not English), then the page switches to the visitor's
// view of the live site in a laptop frame. A role panel on the left and the numbered step under the
// device narrate both; the two sides invert each other's light and dark and their type.

import { buildSite, type BuildResult, type SiteContent } from '../../../app/src/survey/pipeline';
import type { Language } from '../../../app/src/survey/survey';
import { wrenWordmark as wordmark } from './assets/generated';
import { encodeBooking } from './booking-code';
import { answerQuestion, askSite, pipelineDeps, reviewSentiment, type Reporters } from './inference';
import { cachedTranslation, translate, type ModelEvent, type TranslationEvent } from './models';
import { details, ROLES, step, type Mode } from './narration';
import { dots, SCREENS, stringsFor, type Context, type ScreenId } from './screens';
import { laptop, type ChatLine, type SitePage, type VisitorItem } from './site';
import { englishSurvey, initialState, siteSlug, toSurvey, type State } from './state';
import css from './styles.css' with { type: 'text' };
import { h } from './ui';

const state: State = initialState();
let mode: Mode = 'operator';
let current: ScreenId = 'language';
let page: SitePage = 'home';
const events: TranslationEvent[] = [];
const modelEvents: ModelEvent[] = [];
const problems: string[] = [];
const sites: Partial<Record<Language, string>> = {};
const contents: Partial<Record<Language, SiteContent>> = {};
let result: BuildResult | null = null;
let buildError: string | null = null;
// What visitors did on the site; bookings, handed-over questions and reviews wait for the operator.
const items: VisitorItem[] = [];
const chat: ChatLine[] = [];
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
  const role = h('aside', { class: 'role' });
  const stage = h('div', { class: 'stage' });
  const caption = h('div', { class: 'caption' });
  const page$ = h('div', { class: 'demo' }, role, h('div', { class: 'show' }, stage, caption));
  shadow.replaceChildren(h('style', {}, css), page$);
  const footers: { button: HTMLButtonElement; enabled: () => boolean }[] = [];

  const reporters: Reporters = {
    translation: (event) => {
      events.push(event);
      refreshCaption();
    },
    model: (event) => {
      modelEvents.push(event);
      refreshCaption();
    },
    problem: (text) => {
      problems.push(text);
      refreshCaption();
    },
  };
  const deps = pipelineDeps(reporters);
  const twinShown = () => state.language !== 'en';
  const siteLive = () => Boolean(contents[state.language]);

  // Text the operator typed, shown in the English twin: the cached translation at once, otherwise
  // the original until the operator pauses. Each field queues only its latest value, so a pause
  // sends one string per field rather than one per keystroke; text with no letters is not sent.
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const live = (text: string, field = text): string => {
    if (!/\p{L}/u.test(text)) return text;
    const cached = cachedTranslation(text, state.language, 'en');
    if (cached !== undefined) return cached;
    pending.set(field, text);
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const batch = [...new Set(pending.values())];
      pending.clear();
      try {
        await translate(batch, state.language, 'en', reporters.translation);
      } catch (error) {
        reporters.problem(`Live translation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (twinShown() && mode === 'operator') renderPhone('twin');
    }, 900);
    return text;
  };

  const find = (id: number) => items.find((i) => i.id === id);
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
          const item = find(id);
          if (!item) return;
          item.status = 'approved';
          if (item.kind === 'question') {
            item.reply = reply ?? item.draft;
            if (item.reply) chat.push({ from: 'site', text: item.reply });
          }
          editing = null;
          render();
        },
        decline(id) {
          const item = find(id);
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
        refreshCaption();
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
      if (twinShown()) {
        // The twin's English site: the same survey with the operator's words in English. Its calls
        // repeat ones the main build made, so the caches answer them.
        const english = await englishSurvey(survey, (text) => deps.translate(text, state.language, 'en'));
        const twin = await buildSite(english, deps);
        sites.en = twin.html;
        contents.en = twin.site;
      }
      // The site is live: the page switches to the visitor's view.
      showing = state.language;
      current = 'site';
      mode = 'visitor';
      page = 'home';
    } catch (error) {
      buildError = `The site could not be created: ${error instanceof Error ? error.message : String(error)}`;
      current = 'review';
    }
    render();
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

  // The visitor's laptop, kept at its scroll position across redraws.
  function visitorLaptop(): HTMLElement {
    const site = contents[showing] ?? contents[state.language]!;
    const english = contents.en ?? site;
    const scroll = stage.querySelector('.farm-site')?.scrollTop ?? 0;
    const view = laptop({
      site,
      slug: siteSlug(state.name),
      page,
      items,
      chat,
      languages: (Object.keys(contents) as Language[]).sort((a) => (a === state.language ? -1 : 1)),
      go(next) {
        const same = next === page;
        page = next;
        render(same ? undefined : 0);
      },
      show(language) {
        showing = language;
        render();
      },
      book(booking) {
        // A booking needs no model: its code carries the booking, and it waits for the operator.
        const code = encodeBooking(booking);
        const service = site.services[booking.service]?.name ?? '';
        items.push({ kind: 'booking', id: nextId++, code, date: booking.date, slot: site.availability.slots[booking.slot], people: booking.people, name: booking.name, service, status: 'pending' });
        return code;
      },
      ask(text) {
        const line: ChatLine = { from: 'site', text: '', pending: true };
        chat.push({ from: 'visitor', text }, line);
        render();
        const reviews = items.filter((i) => i.kind === 'review' && i.status === 'approved').map((i) => (i as { text: string }).text);
        askSite(site, english, reviews, text, reporters)
          .then(({ text: reply, unknown }) => {
            line.pending = false;
            line.text = reply;
            if (!unknown) return;
            // The facts do not answer it: the question goes to the operator, with Wren's draft.
            line.handedOver = true;
            const item: VisitorItem = { kind: 'question', id: nextId++, text, draft: null, reply: null, status: 'pending', language: site.language };
            items.push(item);
            answerQuestion(site, text, reporters)
              .then((draft) => (item.draft = draft))
              .catch((error) => {
                item.draft = '';
                reporters.problem(`The reply draft failed: ${error instanceof Error ? error.message : String(error)}`);
              })
              .finally(() => render());
          })
          .catch((error) => {
            line.pending = false;
            line.text = '…';
            reporters.problem(`The chat failed: ${error instanceof Error ? error.message : String(error)}`);
          })
          .finally(() => render());
      },
      review(text, stars, name) {
        const item: VisitorItem = { kind: 'review', id: nextId++, text, stars, name, sentiment: null, status: 'pending' };
        items.push(item);
        render();
        reviewSentiment(text, reporters)
          .then((sentiment) => (item.sentiment = sentiment))
          .catch((error) => {
            item.sentiment = 'unclear';
            reporters.problem(`Sentiment failed: ${error instanceof Error ? error.message : String(error)}`);
          })
          .finally(() => render());
      },
    });
    queueMicrotask(() => {
      const el = stage.querySelector('.farm-site');
      if (el) el.scrollTop = scroll;
    });
    return view;
  }

  function refreshCaption(): void {
    const s = step(mode, mode === 'operator' ? current : page);
    caption.replaceChildren(
      h('p', { class: 'step-n' }, String(s.n).padStart(2, '0')),
      h('h2', { class: 'step-title' }, s.title),
      h('p', { class: 'step-text' }, s.text),
      s.model ? h('p', { class: 'step-model' }, `Model: ${s.model}`) : h('p', { class: 'step-model none' }, 'No model in this step'),
      details(state, events, modelEvents, problems, result, buildError),
    );
    const r = ROLES[mode];
    role.replaceChildren(
      h('p', { class: 'role-kicker' }, 'Role'),
      h('h1', { class: 'role-title' }, r.title),
      h('p', { class: 'role-text' }, r.text),
      siteLive()
        ? h(
            'div',
            { class: 'role-switch', role: 'tablist' },
            ...(['operator', 'visitor'] as const).map((m) => h('button', { type: 'button', role: 'tab', 'aria-selected': m === mode ? 'true' : 'false', class: m === mode ? 'on' : '', onclick: () => { mode = m; render(0); } }, m === 'operator' ? 'Operator' : 'Visitor')),
          )
        : h('span'),
      h('p', { class: 'role-count' }, `${String(s.n).padStart(2, '0')} / ${String(s.total).padStart(2, '0')}`),
    );
  }

  // scrollTo resets the laptop's page to the top when the visitor moves to another page.
  function render(scrollTo?: number): void {
    footers.length = 0;
    page$.classList.toggle('visitor', mode === 'visitor');
    const label = (language: string, kind: string) => h('div', { class: 'device-label' }, h('span', { class: 'lang' }, language), h('span', { class: 'kind' }, kind));
    if (mode === 'visitor' && siteLive()) {
      stage.replaceChildren(visitorLaptop());
      if (scrollTo !== undefined) queueMicrotask(() => stage.querySelector('.farm-site')?.scrollTo({ top: scrollTo }));
    } else {
      renderPhone('main');
      const devices: HTMLElement[] = [h('div', { class: 'device' }, label(state.language === 'en' ? 'English' : 'Kiswahili', "Operator's phone"), h('div', { class: 'phone', role: 'region', 'aria-label': "Operator's phone" }, phones.main))];
      if (twinShown()) {
        renderPhone('twin');
        // The twin mirrors the operator's phone and takes no input of its own.
        devices.push(h('div', { class: 'device twin' }, label('English', 'Twin, translated'), h('div', { class: 'phone', role: 'region', 'aria-label': 'English twin', inert: true }, phones.twin)));
      }
      stage.replaceChildren(h('div', { class: 'phones' }, ...devices));
    }
    refreshCaption();
  }

  render();
}

mount();
