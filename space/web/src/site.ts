// The farm's public website as a visitor sees it, in a browser window beside the phones. It carries
// the farm's own look, distinct from Wren's interface, and every visitor action waits for the
// operator's approval on the phone (docs/space.md, Visitor's view).

import type { SiteContent } from '../../../app/src/survey/pipeline';
import { formatDuration, formatPrice, formatSlot } from '../../../app/src/survey/render';
import { DAYS, type Day, type Language } from '../../../app/src/survey/survey';
import { h } from './ui';
import type { Sentiment } from './inference';

export type Status = 'pending' | 'approved' | 'declined';
export type Booking = { kind: 'booking'; id: number; date: string; slot: { start: string; end: string }; people: number; name: string; service: string; status: Status };
export type Question = { kind: 'question'; id: number; text: string; draft: string | null; reply: string | null; status: Status; language: Language };
export type Review = { kind: 'review'; id: number; text: string; stars: number; name: string; sentiment: Sentiment | null; status: Status };
export type VisitorItem = Booking | Question | Review;

export type SiteView = {
  site: SiteContent;
  slug: string;
  items: VisitorItem[];
  languages: Language[]; // the site versions built; more than one when the twin exists
  showing: Language;
  show(language: Language): void;
  book(booking: Omit<Booking, 'kind' | 'id' | 'status'>): void;
  ask(text: string, language: Language): void;
  review(text: string, stars: number, name: string): void;
};

const L = {
  en: { tours: 'Experiences', book: 'Book', reviews: 'Reviews', contact: 'Contact', bookNow: 'Book a visit', call: 'Call', from: 'From', per: 'per person', upTo: 'Up to', people: 'people', open: 'Open', pick: 'Choose a day', time: 'Time', guests: 'Guests', yourName: 'Your name', request: 'Request booking', pending: 'Waiting for the farm to confirm', approved: 'Confirmed', declined: 'Not available, please choose another time', askTitle: 'Ask the farm', askPlaceholder: 'Is the tour suitable for children?', send: 'Send question', awaiting: 'The farm will reply here', noReviews: 'No reviews yet', write: 'Leave a review', publish: 'Post review', reviewPending: 'Your review appears once the farm publishes it', madeWith: 'Site made with Wren', where: 'Where', when: 'When', phone: 'Phone', service: 'Experience' },
  sw: { tours: 'Huduma', book: 'Weka nafasi', reviews: 'Maoni', contact: 'Mawasiliano', bookNow: 'Weka nafasi', call: 'Piga simu', from: 'Kuanzia', per: 'kwa kila mtu', upTo: 'Hadi', people: 'watu', open: 'Wazi', pick: 'Chagua siku', time: 'Saa', guests: 'Wageni', yourName: 'Jina lako', request: 'Omba nafasi', pending: 'Inasubiri shamba kuthibitisha', approved: 'Imethibitishwa', declined: 'Haipatikani, tafadhali chagua muda mwingine', askTitle: 'Uliza shamba', askPlaceholder: 'Je, ziara inafaa watoto?', send: 'Tuma swali', awaiting: 'Shamba litajibu hapa', noReviews: 'Bado hakuna maoni', write: 'Andika maoni', publish: 'Tuma maoni', reviewPending: 'Maoni yako yataonekana shamba likiyachapisha', madeWith: 'Tovuti imetengenezwa na Wren', where: 'Mahali', when: 'Lini', phone: 'Simu', service: 'Huduma' },
} as const;

const WEEKDAYS: Day[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// The next open dates over two weeks, from the availability days.
function openDates(days: Day[]): Date[] {
  const out: Date[] = [];
  const today = new Date();
  for (let i = 1; i <= 21 && out.length < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (days.includes(WEEKDAYS[d.getDay()])) out.push(d);
  }
  return out;
}

export const dateLabel = (iso: string, language: Language) => {
  const d = new Date(`${iso}T12:00:00`);
  return `${DAYS[WEEKDAYS[d.getDay()]][language]} ${d.getDate()}/${d.getMonth() + 1}`;
};
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Draft values of the booking form survive a redraw.
const draft = { date: '', slot: 0, people: 2, name: '', service: 0, question: '', review: '', reviewName: '', stars: 5 };

export function siteWindow(view: SiteView): HTMLElement {
  const { site } = view;
  const lang = site.language;
  const l = L[lang];
  const dates = openDates(site.availability.days);
  if (!draft.date || !dates.some((d) => isoDate(d) === draft.date)) draft.date = dates[0] ? isoDate(dates[0]) : '';
  const cheapest = site.services.reduce((min, s) => Math.min(min, s.price.amount), Infinity);
  const currency = site.services[0]?.price.currency ?? '';

  const input = (attrs: Record<string, string>, onInput: (v: string) => void, multiline = false) => {
    const el = h(multiline ? 'textarea' : 'input', { class: 'fs-input', ...attrs }) as HTMLInputElement;
    if (multiline) el.value = attrs.value ?? '';
    el.addEventListener('input', () => onInput(el.value));
    return el;
  };

  const nav = h(
    'header',
    { class: 'fs-nav' },
    h('span', { class: 'fs-logo' }, site.business.name),
    h('nav', {}, h('span', {}, l.tours), h('span', {}, l.reviews), h('span', {}, l.contact)),
    h('span', { class: 'fs-nav-cta' }, l.bookNow),
  );

  const hero = h(
    'section',
    { class: 'fs-hero' },
    h('div', { class: 'fs-hero-art', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'fs-hero-text' },
      site.business.location ? h('p', { class: 'fs-kicker' }, site.business.location) : null,
      h('h1', {}, site.headline),
      h('p', { class: 'fs-lead' }, site.introduction),
      h('div', { class: 'fs-hero-facts' }, h('span', {}, `${l.from} ${formatPrice({ amount: cheapest, currency })}`), h('span', {}, site.availability.days.map((d) => DAYS[d][lang]).join(', '))),
    ),
  );

  const services = h(
    'section',
    { class: 'fs-section' },
    h('h2', {}, l.tours),
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
    ),
  );

  const myBookings = view.items.filter((i): i is Booking => i.kind === 'booking');
  const booking = h(
    'section',
    { class: 'fs-section fs-booking' },
    h('h2', {}, l.book),
    h('p', { class: 'fs-label' }, l.pick),
    h('div', { class: 'fs-dates' }, ...dates.map((d) => h('button', { type: 'button', class: isoDate(d) === draft.date ? 'on' : '', 'data-date': isoDate(d), onclick: () => { draft.date = isoDate(d); view.show(view.showing); } }, dateLabel(isoDate(d), lang)))),
    h('p', { class: 'fs-label' }, l.time),
    h('div', { class: 'fs-dates' }, ...site.availability.slots.map((s, i) => h('button', { type: 'button', class: i === draft.slot ? 'on' : '', onclick: () => { draft.slot = i; view.show(view.showing); } }, formatSlot(s, lang)))),
    h(
      'div',
      { class: 'fs-row' },
      site.services.length > 1
        ? h('label', {}, h('span', { class: 'fs-label' }, l.service), (() => {
            const select = h('select', { class: 'fs-input' }, ...site.services.map((s, i) => h('option', { value: String(i), selected: i === draft.service }, s.name))) as HTMLSelectElement;
            select.addEventListener('change', () => (draft.service = Number(select.value)));
            return select;
          })())
        : null,
      h('label', {}, h('span', { class: 'fs-label' }, l.guests), input({ type: 'number', min: '1', max: String(site.services[draft.service]?.capacity ?? 1), value: String(draft.people), 'data-field': 'guests' }, (v) => (draft.people = Math.max(1, Number(v) || 1)))),
      h('label', { class: 'grow' }, h('span', { class: 'fs-label' }, l.yourName), input({ value: draft.name, 'data-field': 'visitor-name' }, (v) => (draft.name = v))),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'fs-cta',
        onclick: () => {
          if (!draft.date || !draft.name.trim()) return;
          view.book({ date: draft.date, slot: site.availability.slots[draft.slot], people: draft.people, name: draft.name.trim(), service: site.services[draft.service]?.name ?? '' });
        },
      },
      l.request,
    ),
    ...myBookings.map((b) => h('div', { class: `fs-status ${b.status}` }, h('strong', {}, `${dateLabel(b.date, lang)}, ${formatSlot(b.slot, lang)}, ${b.people} ${l.people}`), h('span', {}, l[b.status]))),
  );

  const questions = view.items.filter((i): i is Question => i.kind === 'question');
  const ask = h(
    'section',
    { class: 'fs-section' },
    h('h2', {}, l.askTitle),
    h('div', { class: 'fs-row' }, h('label', { class: 'grow' }, input({ value: draft.question, placeholder: l.askPlaceholder, 'data-field': 'visitor-question' }, (v) => (draft.question = v))), h('button', { type: 'button', class: 'fs-cta small', onclick: () => { if (draft.question.trim()) { view.ask(draft.question.trim(), lang); draft.question = ''; } } }, l.send)),
    ...questions.map((q) => h('div', { class: 'fs-qa' }, h('strong', {}, q.text), q.status === 'approved' && q.reply ? h('p', {}, q.reply) : h('p', { class: 'fs-muted' }, q.status === 'declined' ? '' : l.awaiting))),
  );

  const reviews = view.items.filter((i): i is Review => i.kind === 'review');
  const published = reviews.filter((r) => r.status === 'approved');
  const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const reviewSection = h(
    'section',
    { class: 'fs-section' },
    h('h2', {}, l.reviews),
    published.length ? h('div', { class: 'fs-reviews' }, ...published.map((r) => h('blockquote', {}, h('span', { class: 'fs-stars', 'aria-label': `${r.stars} / 5` }, stars(r.stars)), h('p', {}, r.text), h('cite', {}, r.name)))) : h('p', { class: 'fs-muted' }, l.noReviews),
    h('p', { class: 'fs-label' }, l.write),
    h('div', { class: 'fs-stars-pick', role: 'radiogroup' }, ...[1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', 'aria-label': `${n} / 5`, class: n <= draft.stars ? 'on' : '', onclick: () => { draft.stars = n; view.show(view.showing); } }, '★'))),
    input({ value: draft.review, rows: '3', 'data-field': 'visitor-review' }, (v) => (draft.review = v), true),
    h('div', { class: 'fs-row' }, h('label', { class: 'grow' }, h('span', { class: 'fs-label' }, l.yourName), input({ value: draft.reviewName, 'data-field': 'review-name' }, (v) => (draft.reviewName = v))), h('button', { type: 'button', class: 'fs-cta small', onclick: () => { if (draft.review.trim()) { view.review(draft.review.trim(), draft.stars, draft.reviewName.trim() || '—'); draft.review = ''; } } }, l.publish)),
    reviews.some((r) => r.status === 'pending') ? h('p', { class: 'fs-muted' }, l.reviewPending) : null,
  );

  const footer = h(
    'footer',
    { class: 'fs-footer' },
    h('div', {}, h('span', { class: 'fs-logo' }, site.business.name), site.business.description ? h('p', {}, site.business.description) : null),
    h('dl', {}, site.business.location ? h('div', {}, h('dt', {}, l.where), h('dd', {}, site.business.location)) : null, h('div', {}, h('dt', {}, l.phone), h('dd', {}, site.business.phone)), h('div', {}, h('dt', {}, l.when), h('dd', {}, site.availability.slots.map((s) => formatSlot(s, lang)).join(', ')))),
    h('p', { class: 'fs-made' }, l.madeWith),
  );

  return h(
    'div',
    { class: 'browser' },
    h(
      'div',
      { class: 'browser-bar' },
      h('span', { class: 'lights', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('span', { class: 'url' }, `wren.site/${view.slug}`),
      view.languages.length > 1 ? h('span', { class: 'browser-langs' }, ...view.languages.map((lg) => h('button', { type: 'button', class: lg === view.showing ? 'on' : '', onclick: () => view.show(lg) }, lg === 'sw' ? 'Kiswahili' : 'English'))) : null,
    ),
    h('div', { class: 'farm-site', lang }, nav, hero, services, booking, ask, reviewSection, footer),
  );
}
