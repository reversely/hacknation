// Wren demonstration Space (docs/space.md). Two sides: the operator creates the site on the phone (with
// an English twin when the chosen language is not English), then the page switches to the visitor's
// view of the live site in a laptop frame. A role panel on the left and the numbered step under the
// device narrate both; the two sides invert each other's light and dark and their type.

import { buildSite, type BuildResult, type SiteContent } from '../../../app/src/survey/pipeline';
import { DAYS, type Language } from '../../../app/src/survey/survey';
import { wrenWordmark as wordmark } from './assets/generated';
import { encodeBooking } from './booking-code';
import { answerQuestion, askSite, pipelineDeps, reviewSentiment, summarise, type Reporters } from './inference';
import { DEMO_VISITOR } from './demo-inputs';
import { activityLines } from './prompts';
import { cachedTranslation, translate, type ModelEvent, type TranslationEvent } from './models';
import { details, ROLES, step, type Mode } from './narration';
import { dots, SCREENS, stringsFor, type Context, type ScreenId } from './screens';
import { fillDraft, firstOpenDate, laptop, SITE_PAGES, SUGGESTED, type ChatLine, type SitePage, type SiteView, type VisitorItem } from './site';
import { englishSurvey, initialState, siteSlug, toSurvey, type State } from './state';
import css from './styles.css' with { type: 'text' };
import { Trace, tracePanel } from './trace';
import { batteryIcon, signalIcon, wifiIcon } from './icons';
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
// Wren's summary on the operator's phone, regenerated when the visitors' activity changes.
const summary = { key: '', en: null as string[] | null, local: null as string[] | null, busy: false };
// The latest model call in the current step, shown live under the step.
let lastCall: { step: string; text: string } | null = null;
let view: SiteView | null = null;
let inboxTab: 'insights' | 'bookings' = 'insights';

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
  // The agent trace beside the phone during the build; it redraws only its own slot.
  const traceSlot = h('div', { class: 'device trace-device' });
  const trace = new Trace(() => {
    traceSlot.replaceChildren(h('div', { class: 'device-label' }, h('span', { class: 'lang' }, 'Agent'), h('span', { class: 'kind' }, 'Local models')), tracePanel(trace));
    if (trace.done) refreshCaption();
  });

  const reporters: Reporters = {
    translation: (event) => {
      events.push(event);
      lastCall = { step: stepKey(), text: `Translation ${event.source} to ${event.target}: NLLB-200 600M, ${event.from === 'model' ? `${event.ms} ms on the GPU` : `from the ${event.from}`}` };
      refreshCaption();
    },
    model: (event) => {
      modelEvents.push(event);
      lastCall = { step: stepKey(), text: `${event.summary}: ${event.model.split('/').pop()}, ${event.from === 'model' ? `${event.ms} ms on the GPU` : `from the ${event.from}`}` };
      refreshCaption();
    },
    problem: (text) => {
      problems.push(text);
      refreshCaption();
    },
  };
  const deps = pipelineDeps(reporters);
  const twinShown = () => state.language !== 'en';
  const stepKey = () => `${mode}:${mode === 'operator' ? current : page}`;
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
        summary: phone === 'main' ? summary.local : summary.en,
        openSite() {
          mode = 'visitor';
          page = 'home';
          render(0);
        },
        tab: inboxTab,
        setTab(tab) {
          inboxTab = tab;
          render();
        },
        // Change the live site: back through the setup screens with every answer kept, then
        // Create site rebuilds it; visitor requests stay.
        editSite() {
          current = 'business';
          render();
        },
        summarising: summary.busy,
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
    trace.reset();
    const traced = trace.wrap(deps);
    const slug = siteSlug(state.name);
    try {
      const survey = toSurvey(state);
      trace.push('head', `website creator: ${state.name}, in ${state.language === 'sw' ? 'Kiswahili' : 'English'}`);
      result = await buildSite(survey, traced);
      trace.result(result, slug);
      sites[state.language] = result.html;
      contents[state.language] = result.site;
      if (twinShown()) {
        // The twin's English site: the same survey with the operator's words in English. Its calls
        // repeat ones the main build made, so the caches answer them.
        trace.push('head', 'website creator: the English twin site');
        const english = await englishSurvey(survey, (text) => traced.translate(text, state.language, 'en'));
        const twin = await buildSite(english, traced);
        trace.result(twin, `${slug}/en`);
        sites.en = twin.html;
        contents.en = twin.site;
      }
      // The site is live; the walkthrough's Next opens the visitor's view.
      showing = state.language;
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
      h('div', { class: 'statusbar', 'aria-hidden': 'true' }, h('span', { class: 'clock' }, '9:41'), h('span', { class: 'island' }), h('span', { class: 'icons' }, signalIcon(), wifiIcon(), batteryIcon())),
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
    view = {
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
    };
    const element = laptop(view);
    queueMicrotask(() => {
      const el = stage.querySelector('.farm-site');
      if (el) el.scrollTop = scroll;
    });
    return element;
  }

  function ensureSummary(): void {
    if (!items.length) return;
    const lines = activityLines(items);
    const key = JSON.stringify(lines);
    if (key === summary.key) return;
    summary.key = key;
    summary.busy = true;
    summarise(state.name, lines, state.language, reporters)
      .then((s) => {
        if (summary.key !== key) return;
        summary.en = s.en;
        summary.local = s.local;
      })
      .catch((error) => {
        // No model: a plain count, so the phone never shows an empty summary.
        const n = (kind: string) => items.filter((i) => i.kind === kind).length;
        summary.en = [`${n('booking')} booking requests, ${n('question')} questions and ${n('review')} reviews are waiting.`, 'Wren could not write insights just now.'];
        summary.local = state.language === 'sw' ? [`Maombi ${n('booking')} ya nafasi, maswali ${n('question')} na maoni ${n('review')} yanasubiri.`, 'Wren haikuweza kuandika maarifa sasa hivi.'] : summary.en;
        reporters.problem(`The summary failed: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (summary.key === key) summary.busy = false;
        if (mode === 'operator') render();
      });
  }

  // The walkthrough: "Show me" does what a visitor would on this page; "Next" moves to the next step.
  const order: { mode: Mode; page?: SitePage }[] = [...SITE_PAGES.map((p) => ({ mode: 'visitor' as const, page: p })), { mode: 'operator' }];
  function showMe(): (() => void) | null {
    if (mode !== 'visitor' || !view) return null;
    const lang = view.site.language;
    const demo = DEMO_VISITOR[lang];
    const v = view;
    if (page === 'book' && !items.some((i) => i.kind === 'booking'))
      return () => {
        const date = firstOpenDate(v.site.availability.days);
        fillDraft({ date, month: date.slice(0, 7), slot: 0, people: demo.people, name: demo.name });
        fillDraft({ lastCode: v.book({ date, slot: 0, service: 0, people: demo.people, name: demo.name }) });
        render();
      };
    if (page === 'ask' && chat.length < 2) return () => v.ask(SUGGESTED[lang][0]);
    if (page === 'ask' && !items.some((i) => i.kind === 'question')) return () => v.ask(demo.unknown);
    if (page === 'reviews' && !items.some((i) => i.kind === 'review')) return () => v.review(demo.review, 5, demo.reviewName);
    return null;
  }
  function next(): { label: string; go: () => void } | null {
    if (mode === 'operator' && current === 'building')
      return siteLive() && trace.done
        ? {
            label: `Next: ${step('visitor', 'home').title}`,
            go: () => {
              current = 'site';
              mode = 'visitor';
              page = 'home';
              render(0);
            },
          }
        : null;
    const at = order.findIndex((o) => o.mode === mode && (mode === 'operator' ? current === 'site' : o.page === page));
    const to = order[at + 1];
    if (at < 0 || !to) return null;
    const s = step(to.mode, to.mode === 'operator' ? 'site' : to.page!);
    return {
      label: `Next: ${s.title}`,
      go: () => {
        mode = to.mode;
        if (to.page) page = to.page;
        render(0);
      },
    };
  }

  function refreshCaption(): void {
    const s = step(mode, mode === 'operator' ? current : page);
    caption.replaceChildren(
      h('p', { class: 'step-n' }, String(s.n).padStart(2, '0')),
      h('h2', { class: 'step-title' }, s.title),
      h('p', { class: 'step-text' }, s.text),
      s.model ? h('p', { class: 'step-model' }, `Model: ${s.model}`) : h('p', { class: 'step-model none' }, 'No model in this step'),
      lastCall && lastCall.step === stepKey() ? h('p', { class: 'step-live' }, h('span', { class: 'pulse', 'aria-hidden': 'true' }), lastCall.text) : h('span'),
      (() => {
        const act = showMe();
        const n = next();
        return act || n ? h('div', { class: 'step-actions' }, act ? h('button', { type: 'button', class: 'show-me', onclick: act }, 'Show me') : null, n ? h('button', { type: 'button', class: 'next', onclick: n.go }, `${n.label} →`) : null) : h('span');
      })(),
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
      if (current === 'site') ensureSummary();
      renderPhone('main');
      const devices: HTMLElement[] = [h('div', { class: 'device' }, label(state.language === 'en' ? 'English' : 'Kiswahili', "Operator's phone"), h('div', { class: 'phone', role: 'region', 'aria-label': "Operator's phone" }, phones.main))];
      if (twinShown()) {
        renderPhone('twin');
        // The twin mirrors the operator's phone and takes no input of its own.
        devices.push(h('div', { class: 'device twin' }, label('English', 'Twin, translated'), h('div', { class: 'phone', role: 'region', 'aria-label': 'English twin', inert: true }, phones.twin)));
      }
      if (current === 'building') {
        trace.redrawNow();
        devices.push(traceSlot);
      }
      stage.replaceChildren(h('div', { class: 'phones' }, ...devices));
    }
    refreshCaption();
    requestAnimationFrame(fit);
  }

  // Fit the devices to the window: scale the phones or the laptop down until they sit side by side
  // and leave room for the step caption below. On a narrow screen only the width counts.
  // Hugging Face's Space page grows its frame to fit the content, so the frame's own height says
  // nothing about the screen; the visible height comes from the screen less the browser and page
  // chrome, whichever is smaller.
  function fit(): void {
    const device = stage.firstElementChild as HTMLElement | null;
    if (!device) return;
    // With the compact role box above the stage, its height comes off the visible height too.
    const roleAbove = window.innerWidth < 1600 ? role.offsetHeight + 36 : 0;
    const visible = Math.min(window.innerHeight, window.screen.availHeight - 160) - roleAbove;
    // The full-height strip only exists from 1600px up; the compact row sizes itself.
    if (!roleAbove) page$.style.setProperty('--visible-h', `${visible}px`);
    device.style.zoom = '1';
    const show = stage.parentElement as HTMLElement;
    const narrow = window.innerWidth < 760;
    // Stacked phones on a narrow screen: scale to the widest single device.
    const width = narrow ? Math.max(...[...device.children].map((c) => (c as HTMLElement).scrollWidth), device.scrollWidth > window.innerWidth ? 0 : device.scrollWidth) : device.scrollWidth;
    const height = device.offsetHeight;
    // A short screen puts the step text beside the devices rather than under them.
    const SIDE_TEXT = 360;
    const pad = getComputedStyle(show);
    const showWidth = show.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    const below = Math.min(1, showWidth / width, (visible - 240) / height);
    const beside = Math.min(1, (showWidth - SIDE_TEXT - 40) / width, (visible - 64) / height);
    const side = !narrow && beside > below + 0.08;
    show.classList.toggle('side', side);
    const scale = narrow ? Math.max(0.3, Math.min(1, (window.innerWidth - 32) / width)) : Math.max(0.45, side ? beside : below);
    device.style.zoom = String(scale);
  }
  window.addEventListener('resize', () => requestAnimationFrame(fit));

  render();
}

mount();
