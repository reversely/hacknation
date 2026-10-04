// Universal translation of the visitor's view into languages beyond the site's two, by NLLB-200
// 600M over the English site. NLLB beat Qwen2.5 0.5B on every phrase tried ("Book a visit": NLLB
// "Réservez une visite", Qwen "Vérifiez un séjour"). The page renders in English, then each visible
// phrase is swapped for its translation; one whose numbers differ from the English keeps the English
// (docs/space.md, Visitor's view).

import { cachedTranslation, translate, type TranslationEvent } from './models';

export type OtherLanguage = { code: string; name: string; label: string };
export const OTHER_LANGUAGES: OtherLanguage[] = [
  { code: 'fr', name: 'French', label: 'Français' },
  { code: 'es', name: 'Spanish', label: 'Español' },
  { code: 'de', name: 'German', label: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', label: 'Português' },
  { code: 'zh', name: 'Simplified Chinese', label: '中文' },
  { code: 'ja', name: 'Japanese', label: '日本語' },
];

// Separators differ by language (1,500 / 1.500 / 1 500), so only the digits are compared.
const digits = (text: string) => (text.match(/\d[\d\s.,]*/g) ?? []).map((n) => n.replace(/\D/g, '')).join(' ');
const worthTranslating = (text: string) => /\p{L}{2,}/u.test(text) && !/^(WR-|\+?\d[\d\s-]{6,}$)/.test(text.trim());

type Slot = { text: string; set: (value: string) => void };

function slots(root: HTMLElement): Slot[] {
  const out: Slot[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest('.fs-code, .fs-bubble.visitor, .fs-reviews p, .fs-reviews cite, .fs-thread .fs-bubble.site, input, textarea')) continue;
    const text = node.textContent?.trim() ?? '';
    if (worthTranslating(text)) {
      const target = node;
      out.push({ text, set: (value) => (target.textContent = value) });
    }
  }
  for (const field of root.querySelectorAll<HTMLInputElement>('input[placeholder], textarea[placeholder]')) {
    if (worthTranslating(field.placeholder) && !field.classList.contains('fs-code-input')) out.push({ text: field.placeholder, set: (value) => (field.placeholder = value) });
  }
  return out;
}

const apply = (slot: Slot, translated: string | undefined) => {
  if (translated && digits(translated) === digits(slot.text)) slot.set(translated);
};

// Swaps what this page already knows at once, then fetches the rest in one batch.
export function translatePage(root: HTMLElement, language: OtherLanguage, report: (event: TranslationEvent) => void, onError: (message: string) => void): void {
  const known = (text: string) => cachedTranslation(text, 'en', language.code);
  const found = slots(root);
  const missing = [...new Set(found.filter((s) => known(s.text) === undefined).map((s) => s.text))];
  found.forEach((s) => apply(s, known(s.text)));
  if (!missing.length) return;
  translate(missing, 'en', language.code, report)
    .then(() => slots(root).forEach((s) => apply(s, known(s.text))))
    .catch((error) => onError(`Translation into ${language.name} failed: ${error instanceof Error ? error.message : String(error)}`));
}
