import { formatSwahiliTimes } from '../agent/swahiliTime';
import type { SiteContent } from './pipeline';
import { DAYS, type Language } from './survey';

// The site template, in the operator's one chosen language. Every value is escaped; numbers come
// straight from the survey; fixed labels come from the table below.

const LABELS = {
  en: { services: 'Services', when: 'When', book: 'Call to book', per: 'per person', upTo: 'up to', people: 'people', hours: 'h', minutes: 'min' },
  sw: { services: 'Huduma', when: 'Lini', book: 'Piga simu kuweka nafasi', per: 'kwa kila mtu', upTo: 'hadi', people: 'watu', hours: 'saa', minutes: 'dakika' },
} as const;

const esc = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function formatDuration(minutes: number, lang: Language): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const l = LABELS[lang];
  if (lang === 'sw') return [h ? `${l.hours} ${h}` : '', m ? `${l.minutes} ${m}` : ''].filter(Boolean).join(' na ');
  return [h ? `${h} ${l.hours}` : '', m ? `${m} ${l.minutes}` : ''].filter(Boolean).join(' ');
}

export function formatPrice(price: { amount: number; currency: string }): string {
  return `${price.currency} ${price.amount.toLocaleString('en')}`;
}

// Kiswahili readers count hours from dawn, so Kiswahili lines show "saa tatu asubuhi", not 09:00.
export function formatSlot(slot: { start: string; end: string }, lang: Language): string {
  const text = `${slot.start} – ${slot.end}`;
  return lang === 'sw' ? formatSwahiliTimes(text) : text;
}

export function renderSite(site: SiteContent): string {
  const lang = site.language;
  const l = LABELS[lang];
  const days = site.availability.days.map((d) => DAYS[d][lang]).join(', ');
  const services = site.services
    .map(
      (s) => `<article class="card"><h3>${esc(s.name)}</h3>${s.blurb ? `<p>${esc(s.blurb)}</p>` : ''}
<ul class="facts"><li>${esc(formatPrice(s.price))} ${esc(l.per)}</li><li>${esc(formatDuration(s.duration_minutes, lang))}</li><li>${esc(l.upTo)} ${esc(s.capacity)} ${esc(l.people)}</li></ul></article>`,
    )
    .join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(site.business.name)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f1ea;color:#1f2a24;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:min(100% - 32px,760px);margin:0 auto;padding:28px 0 48px}
.brand{margin:0;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2f5b45}
h1{margin:6px 0 0;font-family:Georgia,serif;font-weight:400;font-size:clamp(1.9rem,7vw,3rem);line-height:1.1;overflow-wrap:anywhere}
.intro{margin:12px 0 0}.where{margin:4px 0 0;color:#55635a}.label{margin:24px 0 10px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#55635a}
.cards{display:grid;gap:12px}.card{background:#fff;border-radius:14px;padding:16px;overflow-wrap:anywhere}.card h3{margin:0 0 6px;font-size:1.1rem}.card p{margin:0 0 10px}
.facts{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.facts li{background:#e8efe9;border-radius:999px;padding:3px 10px;font-size:14px}
.slots{margin:6px 0 0;padding-left:18px}.book{display:inline-flex;margin-top:22px;min-height:48px;align-items:center;padding:10px 18px;border-radius:999px;background:#2f5b45;color:#fff;text-decoration:none;font-weight:700}
@media(min-width:620px){.cards{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}}
</style></head><body><main lang="${lang}"><p class="brand">${esc(site.business.name)}</p>
<h1>${esc(site.headline)}</h1>
<p class="intro">${esc(site.introduction)}</p>
${site.business.location ? `<p class="where">${esc(site.business.location)}</p>` : ''}
<h2 class="label">${esc(l.services)}</h2><div class="cards">${services}</div>
<h2 class="label">${esc(l.when)}</h2><p>${esc(days)}</p><ul class="slots">${site.availability.slots.map((s) => `<li>${esc(formatSlot(s, lang))}</li>`).join('')}</ul>
<a class="book" href="tel:${esc(site.business.phone)}">${esc(l.book)}: ${esc(site.business.phone)}</a>
</main></body></html>`;
}
