// The phone panel's screens, following the hi-fi onboarding design and the survey's labels
// (app/src/survey/strings.ts). Each phone renders in one language; the English twin mirrors a
// Kiswahili phone (docs/space.md, Twin phone).

import { DAY_LETTERS, LANGUAGE_CHOICES, STRINGS, type Strings } from '../../../app/src/survey/strings';
import { DAYS, SERVICE_TYPES, type Day, type Language, type ServiceType } from '../../../app/src/survey/survey';
import { h, field } from './ui';
import { INBOX } from './visitor';
import { formatSlot } from '../../../app/src/survey/render';
import { dateLabel, type VisitorItem } from './site';
import { businessComplete, newService, scheduleComplete, serviceComplete, siteSlug, type State } from './state';

export type ScreenId = 'language' | 'signin' | 'business' | 'services' | 'availability' | 'review' | 'building' | 'site';

export type Context = {
  state: State;
  language: Language; // this phone's language
  s: Strings;
  live(text: string): string; // operator-typed text in this phone's language
  siteHtml: string | null; // the generated page in this phone's language
  inbox: { items: VisitorItem[]; url: string; editing: number | null; edit(id: number | null): void; approve(id: number, reply?: string): void; decline(id: number): void };
  go(screen: ScreenId): void;
  redraw(): void; // rebuilds every phone after a structural change
  changed(): void; // re-checks the footer, the twin and the narration after a value change
};

export type Screen = {
  body: HTMLElement[];
  footer?: { label: string; enabled: () => boolean; action: () => void; secondary?: boolean };
  back?: ScreenId;
  dot?: number; // position in the five progress dots, 0 to 4
  bare?: boolean; // no back or help button
};

const DOT_COUNT = 5;
const DAY_KEYS = Object.keys(DAYS) as Day[];
const TYPE_KEYS = Object.keys(SERVICE_TYPES) as Exclude<ServiceType, 'custom'>[];

export function dots(active: number): HTMLElement {
  return h('div', { class: 'dots', 'aria-label': `${active + 1} / ${DOT_COUNT}` }, ...Array.from({ length: DOT_COUNT }, (_, i) => h('span', { class: i === active ? 'on' : '' })));
}

const titleBlock = (title: string, lead: string) => [h('h1', { class: 'title' }, title), h('p', { class: 'subtitle' }, lead)];

function text(ctx: Context, value: string, label: string, onInput: (v: string) => void, attrs: Record<string, string> = {}, multiline = false): HTMLElement {
  const input = h(multiline ? 'textarea' : 'input', { class: `input ${multiline ? 'area' : ''}`, value: ctx.live(value), 'aria-label': label, ...attrs }) as HTMLInputElement;
  if (multiline) input.value = ctx.live(value);
  input.addEventListener('input', () => {
    onInput(input.value);
    ctx.changed();
  });
  return input;
}

export const SCREENS: Record<ScreenId, (ctx: Context) => Screen> = {
  language: (ctx) => ({
    body: [
      ...titleBlock(ctx.s.languageTitle, ctx.s.languageLead),
      h(
        'div',
        { class: 'card languages', role: 'radiogroup' },
        ...LANGUAGE_CHOICES.map((choice) =>
          h(
            'button',
            {
              class: `language ${ctx.state.language === choice.id ? 'selected' : ''}`,
              role: 'radio',
              'aria-checked': ctx.state.language === choice.id ? 'true' : 'false',
              onclick: () => {
                ctx.state.language = choice.id;
                ctx.redraw();
              },
            },
            h('span', { class: 'code' }, choice.code),
            h('span', { class: 'name' }, choice.label),
            ctx.state.language === choice.id ? h('span', { class: 'check' }, '✓') : h('span'),
          ),
        ),
      ),
    ],
    footer: { label: `${ctx.s.continue} →`, enabled: () => true, action: () => ctx.go('signin') },
  }),

  signin: (ctx) => ({
    bare: true,
    body: [h('div', { class: 'card signin' }, h('h1', { class: 'title' }, ctx.s.signInTitle), h('p', { class: 'subtitle' }, ctx.s.signInLead))],
    // The Space makes no Google call; the button only moves on.
    footer: { label: ctx.s.google, secondary: true, enabled: () => true, action: () => ctx.go('business') },
    dot: 0,
  }),

  business: (ctx) => ({
    back: 'signin',
    dot: 1,
    body: [
      ...titleBlock(ctx.s.businessTitle, ctx.s.businessLead),
      h(
        'div',
        { class: 'card stack' },
        field(ctx.s.name, text(ctx, ctx.state.name, ctx.s.name, (v) => (ctx.state.name = v), { 'data-field': 'name' })),
        field(ctx.s.phone, text(ctx, ctx.state.phone, ctx.s.phone, (v) => (ctx.state.phone = v), { type: 'tel', inputmode: 'tel', placeholder: '+254 712 345 678', 'data-field': 'phone' })),
        h('p', { class: 'hint' }, ctx.s.phoneHint),
        field(`${ctx.s.location} (${ctx.s.optional})`, text(ctx, ctx.state.location, ctx.s.location, (v) => (ctx.state.location = v), { 'data-field': 'location' })),
        field(`${ctx.s.about} (${ctx.s.optional})`, text(ctx, ctx.state.about, ctx.s.about, (v) => (ctx.state.about = v), { rows: '3', 'data-field': 'about' }, true)),
      ),
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, ctx.s.photos), h('div', { class: 'card-note' }, ctx.s.photosLater)),
    ],
    footer: { label: ctx.s.next, enabled: () => businessComplete(ctx.state), action: () => ctx.go('services') },
  }),

  services: (ctx) => ({
    back: 'business',
    dot: 2,
    body: [
      ...titleBlock(ctx.s.servicesTitle, ctx.s.servicesLead),
      ...ctx.state.services.map((_, index) => serviceCard(ctx, index)),
      ctx.state.services.length < 5
        ? h('button', { class: 'link-button', type: 'button', onclick: () => { ctx.state.services.push(newService()); ctx.redraw(); } }, `+ ${ctx.s.addService}`)
        : null,
    ].filter(Boolean) as HTMLElement[],
    footer: { label: ctx.s.next, enabled: () => ctx.state.services.every(serviceComplete), action: () => ctx.go('availability') },
  }),

  availability: (ctx) => ({
    back: 'services',
    dot: 3,
    body: [
      ...titleBlock(ctx.s.availabilityTitle, ctx.s.availabilityLead),
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'card-title left' }, ctx.s.days),
        h('div', { class: 'card-note left' }, ctx.s.daysHint),
        h(
          'div',
          { class: 'days', role: 'group', 'aria-label': ctx.s.days },
          ...DAY_KEYS.map((day, index) =>
            h(
              'button',
              {
                class: `day ${ctx.state.days.includes(day) ? 'on' : ''}`,
                type: 'button',
                'aria-pressed': ctx.state.days.includes(day) ? 'true' : 'false',
                'aria-label': DAYS[day][ctx.language],
                'data-day': day,
                onclick: () => {
                  ctx.state.days = ctx.state.days.includes(day) ? ctx.state.days.filter((d) => d !== day) : DAY_KEYS.filter((d) => d === day || ctx.state.days.includes(d));
                  ctx.redraw();
                },
              },
              DAY_LETTERS[ctx.language][index],
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'card-heading' }, h('span', {}, ctx.s.slots), h('span', { class: 'muted' }, ctx.s.regularHours)),
        ...ctx.state.slots.map((_, index) => slotRow(ctx, index)),
        h('button', { class: 'dashed', type: 'button', onclick: () => { ctx.state.slots.push({ start: '13:00', end: '14:30' }); ctx.redraw(); } }, `⊕ ${ctx.s.addSlot}`),
        h('p', { class: 'hint' }, ctx.s.slotHint),
      ),
    ],
    footer: { label: ctx.s.next, enabled: () => scheduleComplete(ctx.state), action: () => ctx.go('review') },
  }),

  review: (ctx) => {
    const checks: [string, boolean][] = [
      [ctx.s.servicesDone, ctx.state.services.every(serviceComplete)],
      [ctx.s.scheduleDone, scheduleComplete(ctx.state)],
      [ctx.s.contactDone, businessComplete(ctx.state)],
    ];
    return {
      back: 'availability',
      dot: 4,
      body: [
        ...titleBlock(ctx.s.reviewTitle, ctx.s.reviewLead),
        h('div', { class: 'card site-card' }, h('div', {}, h('div', { class: 'name' }, ctx.state.name), h('div', { class: 'url' }, `wren.site/${siteSlug(ctx.state.name)}`)), h('span', { 'aria-hidden': 'true' }, '▦')),
        h('div', { class: 'card checklist' }, ...checks.map(([label, ok]) => h('div', {}, h('span', { class: `tick ${ok ? '' : 'missing'}` }, ok ? '✓' : '!'), label))),
      ],
      footer: { label: ctx.s.create, enabled: () => checks.every(([, ok]) => ok), action: () => ctx.go('building') },
    };
  },

  building: (ctx) => ({ bare: true, body: [h('div', { class: 'building', 'aria-live': 'polite' }, h('span', { class: 'on' }, `${ctx.s.creating}…`))] }),

  site: (ctx) => siteScreen(ctx),
};

function serviceCard(ctx: Context, index: number): HTMLElement {
  const service = ctx.state.services[index];
  const select = h(
    'select',
    { class: 'select', 'aria-label': ctx.s.serviceType, 'data-field': `type-${index}` },
    h('option', { value: '', disabled: true, selected: !service.type }, ctx.s.selectOption),
    ...TYPE_KEYS.map((type) => h('option', { value: type, selected: service.type === type }, SERVICE_TYPES[type][ctx.language])),
    h('option', { value: 'custom', selected: service.type === 'custom' }, `${ctx.s.addCustom} +`),
  ) as HTMLSelectElement;
  select.addEventListener('change', () => {
    service.type = select.value as ServiceType;
    ctx.redraw();
  });
  const number = (value: string | number, label: string, onInput: (v: string) => void, attrs: Record<string, string>) => {
    const input = h('input', { class: 'input', type: 'number', min: '0', inputmode: 'numeric', value: String(value), 'aria-label': label, ...attrs }) as HTMLInputElement;
    input.addEventListener('input', () => {
      onInput(input.value);
      ctx.changed();
    });
    return input;
  };
  const name = service.type === 'custom' ? ctx.live(service.customName) || `${ctx.s.serviceType} ${index + 1}` : service.type ? SERVICE_TYPES[service.type][ctx.language] : `${ctx.s.serviceType} ${index + 1}`;
  return h(
    'div',
    { class: 'card service stack' },
    ctx.state.services.length > 1
      ? h('div', { class: 'service-head' }, h('strong', {}, name), h('button', { class: 'remove', type: 'button', 'aria-label': ctx.s.removeService, onclick: () => { ctx.state.services.splice(index, 1); ctx.redraw(); } }, '×'))
      : null,
    field(ctx.s.serviceType, select),
    service.type === 'custom' ? field(ctx.s.customName, text(ctx, service.customName, ctx.s.customName, (v) => (service.customName = v), { 'data-field': `custom-${index}` })) : null,
    field(
      ctx.s.duration,
      h(
        'div',
        { class: 'row' },
        h('div', { class: 'affix' }, number(service.hours, ctx.s.hr, (v) => (service.hours = Math.max(0, Math.floor(Number(v) || 0))), { class: 'input with-suffix', 'data-field': `hours-${index}` }), h('span', { class: 'suffix' }, ctx.s.hr)),
        h('div', { class: 'affix' }, number(String(service.minutes).padStart(2, '0'), ctx.s.min, (v) => (service.minutes = Math.min(59, Math.max(0, Math.floor(Number(v) || 0)))), { class: 'input with-suffix', max: '59', step: '15', 'data-field': `minutes-${index}` }), h('span', { class: 'suffix' }, ctx.s.min)),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      field(ctx.s.price, h('div', { class: 'affix' }, h('span', { class: 'prefix' }, ctx.state.currency), number(service.price, ctx.s.price, (v) => (service.price = v), { class: 'input with-prefix', placeholder: '1500', 'data-field': `price-${index}` }))),
      field(ctx.s.capacity, h('div', { class: 'affix' }, number(service.capacity, ctx.s.capacity, (v) => (service.capacity = v), { class: 'input with-suffix', placeholder: '6', 'data-field': `capacity-${index}` }), h('span', { class: 'suffix' }, ctx.s.clients))),
    ),
    field(`${ctx.s.serviceAbout} (${ctx.s.optional})`, text(ctx, service.description, ctx.s.serviceAbout, (v) => (service.description = v), { rows: '2', 'data-field': `about-${index}` }, true)),
  );
}

function slotRow(ctx: Context, index: number): HTMLElement {
  const slot = ctx.state.slots[index];
  const time = (value: string, field: string, onInput: (v: string) => void) => {
    const input = h('input', { type: 'time', value, step: '900', 'aria-label': ctx.s.slots, 'data-field': field }) as HTMLInputElement;
    input.addEventListener('input', () => {
      onInput(input.value);
      ctx.changed();
    });
    return input;
  };
  return h(
    'div',
    { class: 'slot' },
    h('span', { 'aria-hidden': 'true' }, '◷'),
    time(slot.start, `start-${index}`, (v) => (slot.start = v)),
    h('span', { 'aria-hidden': 'true' }, '–'),
    time(slot.end, `end-${index}`, (v) => (slot.end = v)),
    h('button', { class: 'remove', type: 'button', 'aria-label': ctx.s.removeService, onclick: () => { ctx.state.slots.splice(index, 1); ctx.redraw(); } }, '×'),
  );
}

export const stringsFor = (language: Language): Strings => STRINGS[language];

// After the site is live: the visitors' requests, each waiting for the operator's decision. Only
// the operator's phone acts; the twin mirrors it.
function siteScreen(ctx: Context): Screen {
  const t = INBOX[ctx.language];
  if (!ctx.siteHtml) return { back: 'review', body: [h('p', { class: 'subtitle' }, ctx.s.createFailed)] };
  const live = h('div', { class: 'card live-card' }, h('div', {}, h('div', { class: 'card-title left' }, h('span', { class: 'live-dot', 'aria-hidden': 'true' }), t.live), h('div', { class: 'url' }, ctx.inbox.url)));
  const items = [...ctx.inbox.items].reverse();
  const actions = (...buttons: [string, () => void, boolean?][]) => h('div', { class: 'actions' }, ...buttons.map(([label, action, primary]) => h('button', { type: 'button', class: primary ? 'approve' : '', onclick: action }, label)));
  const card = (item: VisitorItem): HTMLElement => {
    if (item.kind === 'booking') {
      return h(
        'div',
        { class: 'card request' },
        h('span', { class: 'kind' }, t.booking),
        h('strong', {}, `${item.name}: ${item.people} ${t.people}`),
        h('span', {}, `${item.service}, ${dateLabel(item.date, ctx.language)}, ${formatSlot(item.slot, ctx.language)}`),
        item.status === 'pending' ? actions([t.decline, () => ctx.inbox.decline(item.id)], [t.approve, () => ctx.inbox.approve(item.id), true]) : h('span', { class: `done ${item.status}` }, item.status === 'approved' ? t.approved : t.declined),
      );
    }
    if (item.kind === 'question') {
      const editing = ctx.inbox.editing === item.id;
      const box = editing ? (h('textarea', { class: 'input area', rows: '4', 'data-field': `reply-${item.id}` }) as HTMLTextAreaElement) : null;
      if (box) box.value = item.draft ?? '';
      const shown = item.language === ctx.language ? item.draft : item.draft && ctx.live(item.draft);
      return h(
        'div',
        { class: 'card request' },
        h('span', { class: 'kind' }, t.question),
        h('strong', {}, item.text),
        item.status === 'pending'
          ? item.draft === null
            ? h('span', { class: 'muted' }, t.drafting)
            : h('div', {}, h('div', { class: 'kind' }, t.draftLabel), box ?? h('div', { class: 'draft' }, shown ?? ''))
          : h('span', { class: `done ${item.status}` }, item.status === 'approved' ? t.sent : t.declined),
        item.status === 'pending' && item.draft !== null
          ? actions([t.decline, () => ctx.inbox.decline(item.id)], editing ? [t.send, () => ctx.inbox.approve(item.id, box!.value), true] : [t.edit, () => ctx.inbox.edit(item.id)], ...(editing ? [] : [[t.send, () => ctx.inbox.approve(item.id), true] as [string, () => void, boolean]]))
          : null,
      );
    }
    return h(
      'div',
      { class: 'card request' },
      h('span', { class: 'kind' }, `${t.review}, ${'★'.repeat(item.stars)}`),
      h('strong', {}, item.text),
      h('span', { class: `sentiment ${item.sentiment ?? ''}` }, item.sentiment ? t[item.sentiment] : '…'),
      item.status === 'pending' ? actions([t.hide, () => ctx.inbox.decline(item.id)], [t.publish, () => ctx.inbox.approve(item.id), true]) : h('span', { class: `done ${item.status}` }, item.status === 'approved' ? t.published : t.hidden),
    );
  };
  return {
    back: 'review',
    body: [live, h('div', { class: 'card-heading' }, h('span', {}, t.requests), h('span', { class: 'muted' }, String(items.filter((i) => i.status === 'pending').length))), ...(items.length ? items.map(card) : [h('p', { class: 'hint left' }, t.empty)])],
  };
}
