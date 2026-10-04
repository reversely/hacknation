// The farm's public website as a visitor sees it, in a laptop frame. It carries the farm's own look,
// distinct from Wren's interface. Bookings return a reference code that needs no backend; questions
// go to a small chat model; bookings and reviews wait for the operator's approval on the phone
// (docs/space.md, Visitor's view).

import type { SiteContent } from '../../../app/src/survey/pipeline';
import { formatDuration, formatPrice, formatSlot } from '../../../app/src/survey/render';
import { DAY_LETTERS } from '../../../app/src/survey/strings';
import { DAYS, type Day, type Language } from '../../../app/src/survey/survey';
import { decodeBooking, type CodedBooking } from './booking-code';
import type { Sentiment } from './inference';
import { h } from './ui';

export type Status = 'pending' | 'approved' | 'declined';
export type Booking = { kind: 'booking'; id: number; code: string; date: string; slot: { start: string; end: string }; people: number; name: string; service: string; status: Status };
export type Question = { kind: 'question'; id: number; text: string; draft: string | null; reply: string | null; status: Status; language: Language };
export type Review = { kind: 'review'; id: number; text: string; stars: number; name: string; sentiment: Sentiment | null; status: Status };
export type VisitorItem = Booking | Question | Review;
export type ChatLine = { from: 'visitor' | 'site'; text: string; pending?: boolean; handedOver?: boolean };
export type SitePage = 'home' | 'book' | 'ask' | 'reviews' | 'contact';
export const SITE_PAGES: SitePage[] = ['home', 'book', 'ask', 'reviews', 'contact'];

export type SiteView = {
  site: SiteContent;
  slug: string;
  page: SitePage;
  items: VisitorItem[];
  chat: ChatLine[];
  languages: Language[]; // the site versions built; more than one when the twin exists
  go(page: SitePage): void;
  show(language: Language): void;
  book(booking: CodedBooking & { name: string }): string; // returns the reference code
  ask(text: string): void;
  review(text: string, stars: number, name: string): void;
};

const L = {
  en: {
    home: 'Home', book: 'Book', ask: 'Ask us', reviews: 'Reviews', contact: 'Contact', bookNow: 'Book a visit', from: 'From', per: 'per person', upTo: 'Up to', people: 'people', about: 'About the farm', experiences: 'Experiences', pick: 'Choose a day', time: 'Time', guests: 'Guests', service: 'Experience', yourName: 'Your name', request: 'Request booking',
    received: 'Booking request received', yourCode: 'Your booking reference', keepCode: 'Keep this code. The farm confirms your visit, and you can check it here at any time.', pending: 'Waiting for the farm to confirm', approved: 'Confirmed by the farm', declined: 'The farm could not take this booking; please choose another time', check: 'Check a booking', checkPlaceholder: 'WR-XXXX-XXX', find: 'Find', notFound: 'That code is not valid. Check each character.', validCode: 'Valid reference',
    askTitle: 'Ask us anything', askLead: 'Answers come from the information on this site. Anything else goes to the farm.', suggested: ['How long is the tour?', 'How much does it cost?', 'Which days are you open?', 'Where are you?'] as string[], send: 'Send', typing: 'Writing…', handedOver: "I don't have that information. I've passed your question to the farm, and they will reply.",
    noReviews: 'No reviews yet', write: 'Leave a review', publish: 'Post review', reviewPending: 'Thank you. Your review appears once the farm publishes it.', where: 'Where', when: 'When', phone: 'Phone', days: 'Open', call: 'Call', madeWith: 'Site made with Wren', laptop: "Visitor's laptop",
  },
  sw: {
    home: 'Mwanzo', book: 'Weka nafasi', ask: 'Uliza', reviews: 'Maoni', contact: 'Mawasiliano', bookNow: 'Weka nafasi', from: 'Kuanzia', per: 'kwa kila mtu', upTo: 'Hadi', people: 'watu', about: 'Kuhusu shamba', experiences: 'Huduma', pick: 'Chagua siku', time: 'Saa', guests: 'Wageni', service: 'Huduma', yourName: 'Jina lako', request: 'Omba nafasi',
    received: 'Ombi la nafasi limepokelewa', yourCode: 'Namba yako ya kumbukumbu', keepCode: 'Hifadhi namba hii. Shamba litathibitisha ziara yako, na unaweza kuiangalia hapa wakati wowote.', pending: 'Inasubiri shamba kuthibitisha', approved: 'Imethibitishwa na shamba', declined: 'Shamba halikuweza kupokea nafasi hii; tafadhali chagua muda mwingine', check: 'Angalia nafasi', checkPlaceholder: 'WR-XXXX-XXX', find: 'Tafuta', notFound: 'Namba hiyo si sahihi. Kagua kila herufi.', validCode: 'Namba sahihi',
    askTitle: 'Tuulize chochote', askLead: 'Majibu yanatoka kwenye taarifa za tovuti hii. Mengine yanatumwa kwa shamba.', suggested: ['Ziara inachukua muda gani?', 'Bei ni kiasi gani?', 'Mko wazi siku gani?', 'Mko wapi?'] as string[], send: 'Tuma', typing: 'Inaandika…', handedOver: 'Sina taarifa hiyo. Nimetuma swali lako kwa shamba, na watakujibu.',
    noReviews: 'Bado hakuna maoni', write: 'Andika maoni', publish: 'Tuma maoni', reviewPending: 'Asante. Maoni yako yataonekana shamba likiyachapisha.', where: 'Mahali', when: 'Lini', phone: 'Simu', days: 'Wazi', call: 'Piga simu', madeWith: 'Tovuti imetengenezwa na Wren', laptop: 'Kompyuta ya mgeni',
  },
} as const;

// The chat's suggested questions; scripts/warm-cache.ts warms their answers.
export const SUGGESTED: Record<Language, string[]> = { en: L.en.suggested, sw: L.sw.suggested };

// The farm's photos, served beside the bundle (scripts/manifest.ts copies them).
export const PHOTO = new URL('./photos/farm.jpg', import.meta.url).href;

const WEEKDAYS: Day[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The next open dates from tomorrow, from the availability days.
function openDates(days: Day[], horizon = 21, limit = 6): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 1; i <= horizon && out.length < limit; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (days.includes(WEEKDAYS[d.getDay()])) out.push(isoDate(d));
  }
  return out;
}

export const dateLabel = (iso: string, language: Language) => {
  const d = new Date(`${iso}T12:00:00`);
  return `${DAYS[WEEKDAYS[d.getDay()]][language]} ${d.getDate()}/${d.getMonth() + 1}`;
};

// Form drafts survive a redraw; the site redraws on every model reply and approval.
const draft = { month: '', date: '', slot: 0, people: 2, name: '', service: 0, question: '', review: '', reviewName: '', stars: 5, lookup: '', lookedUp: '', lastCode: '' };

// The walkthrough fills the forms the way a visitor would (main.ts, Show me).
export function fillDraft(values: Partial<typeof draft>): void {
  Object.assign(draft, values);
}
export const firstOpenDate = (days: Day[]) => openDates(days)[0] ?? '';
export const upcomingOpenDates = (days: Day[], n: number) => openDates(days, 42, n);

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function laptop(view: SiteView): HTMLElement {
  const { site } = view;
  const lang = site.language;
  const l = L[lang];
  const input = (attrs: Record<string, string>, onInput: (v: string) => void, multiline = false) => {
    const el = h(multiline ? 'textarea' : 'input', { class: 'fs-input', ...attrs }) as HTMLInputElement;
    if (multiline) el.value = attrs.value ?? '';
    el.addEventListener('input', () => onInput(el.value));
    return el;
  };
  const cta = (label: string, action: () => void, small = false) => h('button', { type: 'button', class: `fs-cta ${small ? 'small' : ''}`, onclick: action }, label);
  const published = view.items.filter((i): i is Review => i.kind === 'review' && i.status === 'approved');

  const nav = h(
    'header',
    { class: 'fs-nav' },
    h('button', { type: 'button', class: 'fs-logo', onclick: () => view.go('home') }, site.business.name),
    h('nav', {}, ...SITE_PAGES.filter((p) => p !== 'home' && p !== 'book').map((p) => h('button', { type: 'button', class: view.page === p ? 'on' : '', onclick: () => view.go(p) }, l[p]))),
    h('button', { type: 'button', class: 'fs-nav-cta', onclick: () => view.go('book') }, l.bookNow),
  );

  const serviceCards = () =>
    h(
      'div',
      { class: 'fs-services' },
      ...site.services.map((s) =>
        h(
          'article',
          { class: 'fs-service' },
          h('div', { class: 'fs-price' }, h('strong', {}, formatPrice(s.price)), h('span', {}, l.per)),
          h('h3', {}, s.name),
          s.blurb ? h('p', {}, s.blurb) : null,
          h('ul', {}, h('li', {}, formatDuration(s.duration_minutes, lang)), h('li', {}, `${l.upTo} ${s.capacity} ${l.people}`)),
        ),
      ),
    );

  const pages: Record<SitePage, () => HTMLElement[]> = {
    home: () => {
      const cheapest = Math.min(...site.services.map((s) => s.price.amount));
      return [
        h(
          'section',
          { class: 'fs-hero' },
          h('img', { class: 'fs-hero-photo', src: PHOTO, alt: '' }),
          h('div', { class: 'fs-hero-shade', 'aria-hidden': 'true' }),
          h(
            'div',
            { class: 'fs-hero-text' },
            site.business.location ? h('p', { class: 'fs-kicker' }, site.business.location) : null,
            h('h1', {}, site.headline),
            h('p', { class: 'fs-lead' }, site.introduction),
            h('div', { class: 'fs-hero-actions' }, cta(l.bookNow, () => view.go('book')), h('span', { class: 'fs-hero-note' }, `${l.from} ${formatPrice({ amount: cheapest, currency: site.services[0].price.currency })} ${l.per}`)),
          ),
        ),
        site.business.description ? h('section', { class: 'fs-section fs-about' }, h('div', {}, h('h2', {}, l.about), h('p', {}, site.business.description)), h('img', { src: PHOTO, alt: '', class: 'fs-about-photo' })) : h('span'),
        h('section', { class: 'fs-section' }, h('h2', {}, l.experiences), serviceCards()),
        published.length ? h('section', { class: 'fs-section' }, h('h2', {}, l.reviews), reviewList(published.slice(-2))) : h('span'),
      ];
    },
    book: () => {
      const dates = openDates(site.availability.days, 90, 60);
      if (!dates.includes(draft.date)) draft.date = dates[0] ?? '';
      if (!draft.month) draft.month = draft.date.slice(0, 7);
      const mine = view.items.find((i): i is Booking => i.kind === 'booking' && i.code === draft.lastCode);
      const lookedUp = draft.lookedUp ? decodeBooking(draft.lookedUp) : null;
      const lookedUpItem = view.items.find((i): i is Booking => i.kind === 'booking' && i.code === draft.lookedUp);
      return [
        h(
          'section',
          { class: 'fs-section fs-booking' },
          h('h2', {}, l.book),
          mine ? confirmation(mine) : h('span'),
          site.services.length > 1
            ? h('label', { class: 'fs-field' }, h('span', { class: 'fs-label' }, l.service), (() => {
                const select = h('select', { class: 'fs-input' }, ...site.services.map((s, i) => h('option', { value: String(i), selected: i === draft.service }, s.name))) as HTMLSelectElement;
                select.addEventListener('change', () => (draft.service = Number(select.value)));
                return select;
              })())
            : h('span'),
          h('span', { class: 'fs-label' }, l.pick),
          calendar(),
          h('span', { class: 'fs-label' }, l.time),
          h('div', { class: 'fs-dates' }, ...site.availability.slots.map((s, i) => h('button', { type: 'button', class: i === draft.slot ? 'on' : '', onclick: () => { draft.slot = i; view.go('book'); } }, formatSlot(s, lang)))),
          h(
            'div',
            { class: 'fs-row' },
            h('label', {}, h('span', { class: 'fs-label' }, l.guests), input({ type: 'number', min: '1', max: String(site.services[draft.service]?.capacity ?? 1), value: String(draft.people), 'data-field': 'guests' }, (v) => (draft.people = Math.max(1, Math.min(site.services[draft.service]?.capacity ?? 1, Number(v) || 1))))),
            h('label', { class: 'grow' }, h('span', { class: 'fs-label' }, l.yourName), input({ value: draft.name, 'data-field': 'visitor-name' }, (v) => (draft.name = v))),
          ),
          cta(l.request, () => {
            if (!draft.date || !draft.name.trim()) return;
            draft.lastCode = view.book({ date: draft.date, slot: draft.slot, service: draft.service, people: draft.people, name: draft.name.trim() });
            view.go('book');
          }),
        ),
        h(
          'section',
          { class: 'fs-section' },
          h('h2', {}, l.check),
          h('div', { class: 'fs-row' }, h('label', { class: 'grow' }, input({ value: draft.lookup, placeholder: l.checkPlaceholder, 'data-field': 'lookup', class: 'fs-input fs-code-input' }, (v) => (draft.lookup = v))), cta(l.find, () => { draft.lookedUp = draft.lookup.trim(); view.go('book'); }, true)),
          draft.lookedUp
            ? lookedUp
              ? h('div', { class: `fs-status ${lookedUpItem?.status ?? 'pending'}` }, h('strong', {}, describe(lookedUp)), h('span', {}, lookedUpItem ? l[lookedUpItem.status] : l.validCode))
              : h('p', { class: 'fs-error' }, l.notFound)
            : h('span'),
        ),
      ];
    },
    ask: () => {
      const box = input({ value: draft.question, placeholder: l.suggested[0], 'data-field': 'chat' }, (v) => (draft.question = v));
      const send = () => {
        if (!draft.question.trim()) return;
        view.ask(draft.question.trim());
        draft.question = '';
      };
      box.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && send());
      return [
        h(
          'section',
          { class: 'fs-section fs-chat' },
          h('h2', {}, l.askTitle),
          h('p', { class: 'fs-muted-lead' }, l.askLead),
          h('div', { class: 'fs-chips' }, ...l.suggested.map((q) => h('button', { type: 'button', onclick: () => view.ask(q) }, q))),
          h(
            'div',
            { class: 'fs-thread', 'aria-live': 'polite' },
            ...view.chat.map((line) => h('div', { class: `fs-bubble ${line.from} ${line.handedOver ? 'handed' : ''}` }, line.pending ? l.typing : line.handedOver ? l.handedOver : line.text)),
          ),
          h('div', { class: 'fs-row fs-composer' }, h('label', { class: 'grow' }, box), cta(l.send, send, true)),
        ),
      ];
    },
    reviews: () => {
      const pending = view.items.some((i) => i.kind === 'review' && i.status === 'pending');
      return [
        h('section', { class: 'fs-section' }, h('h2', {}, l.reviews), published.length ? reviewList(published) : h('p', { class: 'fs-muted' }, l.noReviews)),
        h(
          'section',
          { class: 'fs-section fs-booking' },
          h('h2', {}, l.write),
          h('div', { class: 'fs-stars-pick', role: 'radiogroup' }, ...[1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', 'aria-label': `${n} / 5`, class: n <= draft.stars ? 'on' : '', onclick: () => { draft.stars = n; view.go('reviews'); } }, '★'))),
          input({ value: draft.review, rows: '3', 'data-field': 'visitor-review' }, (v) => (draft.review = v), true),
          h('div', { class: 'fs-row' }, h('label', { class: 'grow' }, h('span', { class: 'fs-label' }, l.yourName), input({ value: draft.reviewName, 'data-field': 'review-name' }, (v) => (draft.reviewName = v))), cta(l.publish, () => { if (draft.review.trim()) { view.review(draft.review.trim(), draft.stars, draft.reviewName.trim() || '—'); draft.review = ''; } }, true)),
          pending ? h('p', { class: 'fs-muted' }, l.reviewPending) : h('span'),
        ),
      ];
    },
    contact: () => [
      h(
        'section',
        { class: 'fs-section fs-contact' },
        h('h2', {}, l.contact),
        h(
          'dl',
          {},
          site.business.location ? h('div', {}, h('dt', {}, l.where), h('dd', {}, site.business.location)) : null,
          h('div', {}, h('dt', {}, l.phone), h('dd', {}, h('a', { href: `tel:${site.business.phone}` }, site.business.phone))),
          h('div', {}, h('dt', {}, l.days), h('dd', {}, site.availability.days.map((d) => DAYS[d][lang]).join(', '))),
          h('div', {}, h('dt', {}, l.when), h('dd', {}, site.availability.slots.map((s) => formatSlot(s, lang)).join(', '))),
        ),
        h('div', { class: 'fs-hero-actions' }, cta(l.bookNow, () => view.go('book')), h('button', { type: 'button', class: 'fs-ghost', onclick: () => view.go('ask') }, l.ask)),
      ),
    ],
  };

  // A month of days: open days can be picked, closed and past days cannot, and each day shows how
  // many booking requests it already has.
  function calendar(): HTMLElement {
    const open = new Set(openDates(site.availability.days, 90, 60));
    const [year, month] = draft.month.split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const count = new Date(year, month, 0).getDate();
    const requests = new Map<string, number>();
    for (const i of view.items) if (i.kind === 'booking' && i.status !== 'declined') requests.set(i.date, (requests.get(i.date) ?? 0) + i.people);
    const shift = (delta: number) => {
      const d = new Date(year, month - 1 + delta, 1);
      draft.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      view.go('book');
    };
    const thisMonth = isoDate(new Date()).slice(0, 7);
    const cells: HTMLElement[] = [];
    for (let i = 0; i < lead; i++) cells.push(h('span'));
    for (let day = 1; day <= count; day++) {
      const iso = `${draft.month}-${String(day).padStart(2, '0')}`;
      const taken = requests.get(iso);
      cells.push(
        open.has(iso)
          ? h('button', { type: 'button', class: `day ${iso === draft.date ? 'on' : ''}`, 'data-date': iso, onclick: () => { draft.date = iso; view.go('book'); } }, h('span', {}, String(day)), taken ? h('small', {}, `${taken} ${l.people}`) : null)
          : h('span', { class: 'day closed' }, String(day)),
      );
    }
    return h(
      'div',
      { class: 'fs-calendar' },
      h(
        'div',
        { class: 'fs-cal-head' },
        h('button', { type: 'button', 'aria-label': '‹', disabled: draft.month <= thisMonth, onclick: () => shift(-1) }, '‹'),
        h('strong', {}, first.toLocaleDateString(lang === 'sw' ? 'sw-KE' : 'en-GB', { month: 'long', year: 'numeric' })),
        h('button', { type: 'button', 'aria-label': '›', onclick: () => shift(1) }, '›'),
      ),
      h('div', { class: 'fs-cal-grid' }, ...DAY_LETTERS[lang].map((d) => h('span', { class: 'dow' }, d)), ...cells),
    );
  }

  function describe(b: CodedBooking): string {
    const service = site.services[b.service]?.name ?? '';
    const slot = site.availability.slots[b.slot];
    return [service, dateLabel(b.date, lang), slot ? formatSlot(slot, lang) : '', `${b.people} ${l.people}`].filter(Boolean).join(', ');
  }

  function confirmation(b: Booking): HTMLElement {
    return h(
      'div',
      { class: 'fs-confirm' },
      h('p', { class: 'fs-label' }, l.received),
      h('div', { class: 'fs-code' }, h('span', {}, l.yourCode), h('strong', {}, b.code)),
      h('p', {}, describe(decodeBooking(b.code)!)),
      h('div', { class: `fs-status ${b.status}` }, h('span', {}, l[b.status])),
      h('p', { class: 'fs-muted' }, l.keepCode),
    );
  }

  function reviewList(reviews: Review[]): HTMLElement {
    return h('div', { class: 'fs-reviews' }, ...reviews.map((r) => h('blockquote', {}, h('span', { class: 'fs-stars', 'aria-label': `${r.stars} / 5` }, stars(r.stars)), h('p', {}, r.text), h('cite', {}, r.name))));
  }

  const footer = h(
    'footer',
    { class: 'fs-footer' },
    h('div', {}, h('span', { class: 'fs-logo' }, site.business.name), site.business.description ? h('p', {}, site.business.description) : null),
    h('dl', {}, h('div', {}, h('dt', {}, l.phone), h('dd', {}, site.business.phone)), site.business.location ? h('div', {}, h('dt', {}, l.where), h('dd', {}, site.business.location)) : null),
    h('p', { class: 'fs-made' }, l.madeWith),
  );

  return h(
    'div',
    { class: 'laptop', role: 'region', 'aria-label': l.laptop },
    h(
      'div',
      { class: 'laptop-screen' },
      h(
        'div',
        { class: 'browser-bar' },
        h('span', { class: 'lights', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('span', { class: 'url' }, `wren.site/${view.slug}${view.page === 'home' ? '' : `/${view.page}`}`),
        view.languages.length > 1 ? h('span', { class: 'browser-langs' }, ...view.languages.map((lg) => h('button', { type: 'button', class: lg === lang ? 'on' : '', onclick: () => view.show(lg) }, lg === 'sw' ? 'Kiswahili' : 'English'))) : null,
      ),
      h('div', { class: 'farm-site', lang }, nav, h('main', {}, ...pages[view.page]()), footer),
    ),
    h('div', { class: 'laptop-base', 'aria-hidden': 'true' }),
  );
}
