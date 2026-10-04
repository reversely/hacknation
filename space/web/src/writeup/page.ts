// The visitor chat evaluation as an animated page in the Space (docs/chat-evaluation.md). Charts and
// figures animate as each section scrolls into view; nothing moves for a viewer who prefers reduced
// motion. Every number comes from data.ts, which carries the hand-reviewed results.

import { h } from '../ui';
import { barChart, countUp, runLines, stackedColumns } from './charts';
import { BY_KIND, CONFIGS, EXAMPLES, FINE_TUNE, FORM_FIELDS, HALLUCINATIONS, INTERVIEW_PIPELINES, LAYERS, MODELS_USED, QUESTIONS, RUNS, STT_WER, type Config } from './data';

const pct = (n: number) => Math.round((n / QUESTIONS.total) * 100);
// Accuracy: replies that say nothing false (a correct answer, "I don't know", or a hand-over).
const accurate = (c: Config) => QUESTIONS.total - HALLUCINATIONS[c].development - HALLUCINATIONS[c].heldOut;
const key = (text: string) => h('p', { class: 'wu-key' }, text);
const detail = (text: string) => h('p', { class: 'wu-detail' }, text);
const TONE: Record<Config, 'base' | 'mid' | 'good'> = { baseline: 'base', guidelines: 'mid', strict: 'good' };
const VERDICT: Record<string, string> = { hallucination: 'Hallucination', unsafe: 'Unsafe', owner: 'Sent to the owner', fixed: 'Fixed reply', correct: 'Correct' };

export function writeupPage(_back: () => void, logo: string, mascot: string): HTMLElement {
  const total = (c: Config) => HALLUCINATIONS[c].development + HALLUCINATIONS[c].heldOut;
  const section = (cls: string, ...children: (HTMLElement | SVGElement | null)[]) => h('section', { class: `wu-section reveal ${cls}` }, ...(children.filter(Boolean) as HTMLElement[]));

  const hero = h(
    'header',
    { class: 'wu-hero' },
    h('div', { class: 'wu-hero-top' }, h('img', { src: logo, alt: 'Wren', class: 'wu-logo' })),
    h('p', { class: 'wu-kicker' }, 'Visitor chat evaluation'),
    h('h1', {}, `Accuracy rose from ${pct(accurate('baseline'))}% to ${pct(accurate('strict'))}%`),
    h('p', { class: 'wu-lead' }, `${QUESTIONS.total} visitor questions. Three setups of one small model. Every reply checked by hand.`),
    h('p', { class: 'wu-lead-small' }, 'Accuracy counts the replies that say nothing false: a correct answer, an honest "I don\'t know", or a hand-over to the owner. The chat runs Qwen2.5 0.5B on the farm\'s website.'),
    h(
      'div',
      { class: 'wu-stats reveal' },
      ...CONFIGS.map((c) => h('div', { class: `wu-stat ${TONE[c.id]}` }, h('strong', { 'data-count': pct(accurate(c.id)) }, `${pct(accurate(c.id))}%`), h('span', {}, c.label), h('small', {}, `${accurate(c.id)} of ${QUESTIONS.total} replies accurate`))),
    ),
    h('img', { src: mascot, alt: '', class: 'wu-mascot', 'aria-hidden': 'true' }),
  );

  const harness = section(
    'wu-harness',
    h('h2', {}, 'From a conversation to a form'),
    key('Facts come from the form. No model touches prices, times or the phone number.'),
    detail('Wren first set a business up through a spoken interview, and a model pulled each field from the transcript: the phone stack got 70% of fields right. The form now takes the facts from its fields instead.'),
    h(
      'div',
      { class: 'wu-split' },
      h('div', { class: 'wu-panel reveal' }, h('h3', {}, 'Spoken interview: fields extracted correctly'), barChart(INTERVIEW_PIPELINES.map((p, i) => ({ label: p.label, value: p.fieldsCorrect, tone: i === 1 ? 'mid' : 'base' })), 100, '%')),
      h(
        'div',
        { class: 'wu-panel reveal' },
        h('h3', {}, 'Form: where each fact on the page comes from'),
        h('ul', { class: 'wu-fields' }, ...FORM_FIELDS.map((f) => h('li', { class: f.model ? 'model' : '' }, h('strong', {}, f.field), h('span', {}, f.source), h('em', {}, f.model ? 'Model, checked' : 'No model')))),
      ),
    ),
    key('The model writes only a headline and short sentences, and code checks them.'),
    detail('Code rejects any name or number the form does not contain and asks again; after three tries the page uses the owner’s own words. Wording can still stretch the facts: "the aroma of freshly roasted beans on your doorstep" passed, because the check looks for names and numbers.'),
  );

  const setups = section(
    'wu-setups',
    h('h2', {}, 'Three setups, one model'),
    key('Same model, same facts. Only the rules around it change.'),
    detail('The facts: a 2-hour guided tour, KES 1,500 per person, up to 6 people, open Saturday and Sunday at 09:00, near the Ondera market, one phone number.'),
    h('div', { class: 'wu-cards' }, ...CONFIGS.map((c, i) => h('div', { class: `wu-card ${TONE[c.id]}` }, h('span', { class: 'wu-n' }, String(i + 1).padStart(2, '0')), h('h3', {}, c.label), h('p', {}, c.detail)))),
  );

  const hallucinations = section(
    'wu-chart',
    h('h2', {}, 'Replies with nothing false'),
    key(`${accurate('strict')} of ${QUESTIONS.total} with guidelines and checks. ${accurate('baseline')} of ${QUESTIONS.total} with the first prompt.`),
    detail(`The checks were tuned on ${QUESTIONS.development} development questions. ${QUESTIONS.heldOut} held-out questions were written afterwards and never used for tuning.`),
    stackedColumns(
      CONFIGS.map((c) => ({ label: c.label, parts: [{ value: QUESTIONS.development - HALLUCINATIONS[c.id].development, key: 'dev' }, { value: QUESTIONS.heldOut - HALLUCINATIONS[c.id].heldOut, key: 'held' }] })),
      QUESTIONS.total,
    ),
    h('div', { class: 'wu-legend' }, h('span', { class: 'sw dev' }), 'Development questions', h('span', { class: 'sw held' }), 'Held-out questions'),
  );

  const kinds = section(
    'wu-kinds',
    h('h2', {}, 'Where the gains come from'),
    key('Made-up answers fell from 22 of 24 to none. Unsafe replies fell from 4 of 12 to none.'),
    detail('Unanswerable questions are ones the facts do not cover, such as "Is lunch included?". Adversarial questions try to rewrite the chat\'s rules, book through the chat, share a card number, or get a discount or refund.'),
    h(
      'div',
      { class: 'wu-grid' },
      ...BY_KIND.map((k) =>
        h(
          'div',
          { class: 'wu-panel reveal' },
          h('h3', {}, k.measure),
          barChart(
            CONFIGS.map((c) => ({ label: c.label, value: k.values[c.id], of: k.of, tone: TONE[c.id] })),
            k.of,
          ),
        ),
      ),
    ),
  );

  const pipeline = section(
    'wu-pipeline',
    h('h2', {}, 'What the checks do'),
    key('The rules run as code around the model, not only in its prompt.'),
    detail('A reply the facts do not support goes to the owner, never to the visitor.'),
    h('ol', { class: 'wu-layers' }, ...LAYERS.map((l, i) => h('li', { style: `--delay:${i * 220}ms` }, h('span', { class: 'wu-step' }, String(i + 1)), h('div', {}, h('strong', {}, l.name), h('p', {}, l.does))))),
  );

  const examples = section(
    'wu-examples',
    h('h2', {}, 'Four questions, three setups'),
    h(
      'div',
      { class: 'wu-example-list' },
      ...EXAMPLES.map((e) =>
        h(
          'article',
          { class: 'wu-example reveal' },
          h('h3', {}, `“${e.question}”`),
          ...e.outcomes.map((o) => h('div', { class: `wu-outcome ${o.verdict}` }, h('span', { class: 'who' }, CONFIGS.find((c) => c.id === o.config)!.label), h('p', {}, o.text), h('span', { class: 'verdict' }, VERDICT[o.verdict]))),
        ),
      ),
    ),
  );

  const runs = section(
    'wu-runs',
    h('h2', {}, 'The cost'),
    key(`${BY_KIND[3].values.strict} of ${BY_KIND[3].of} answerable questions went to the owner instead of being answered.`),
    detail('The owner answers them from the phone. The chart follows the checks across three runs: widening the everyday question words stopped correct answers being held back, and the open-day check caught a reply calling Sunday closed.'),
    runLines(RUNS.map((r) => ({ run: r.run, a: r.sentToOwner, b: r.hallucinations })), ['Answerable questions sent to the owner', 'Hallucinated replies']),
    h('div', { class: 'wu-legend' }, h('span', { class: 'sw s0' }), 'Answerable questions sent to the owner (of 12)', h('span', { class: 'sw s1' }), 'Hallucinated replies (of 34)'),
  );

  const benchmarks = section(
    'wu-bench',
    h('h2', {}, 'Benchmarks behind the models'),
    key('A fine-tune cut speech-to-text errors from 24.5% to 15.7%.'),
    detail('Every stage was chosen from benchmarks run offline on one machine, with synthetic Kiswahili voices replayed from disk. No process connected outside the machine in the deciding run.'),
    h(
      'div',
      { class: 'wu-split' },
      h('div', { class: 'wu-panel reveal' }, h('h3', {}, 'Speech to text: word error rate on 341 clips (persona clips)'), barChart(STT_WER.map((m, i) => ({ label: m.model.replace('Kiswahili fine-tune', 'fine-tune'), value: m.persona, tone: i === 0 ? 'good' : 'base' })), 100, '%', 220)),
      h(
        'div',
        { class: 'wu-panel reveal' },
        h('h3', {}, `Fine-tune on ${FINE_TUNE.trainingClips} synthetic clips: word error rate on ${FINE_TUNE.heldOutClips} unseen persona clips`),
        barChart([{ label: 'Before', value: FINE_TUNE.before, tone: 'base' }, { label: 'After', value: FINE_TUNE.after, tone: 'good' }], 100, '%'),
      ),
    ),
    detail('Stock Whisper heard "shilingi elfu moja na mia tano" (1,500 shillings) as "Shilingelf mudia na miatano". The phone stack got 70% of interview fields right, against 71% for the largest models. For translation, NLLB-200 600M beat Qwen2.5 0.5B on every phrase tried.'),
  );

  const privacy = section(
    'wu-privacy',
    h('h2', {}, 'Privacy'),
    key('Open models on hardware the project runs. No AI company receives what people type.'),
    detail('Every model is open-weight and pinned to one version.'),
    h('table', { class: 'wu-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Model'), h('th', {}, 'Role'), h('th', {}, 'Licence'))), h('tbody', {}, ...MODELS_USED.map((m) => h('tr', {}, h('td', {}, m.model), h('td', {}, m.role), h('td', {}, m.licence))))),
    h(
      'ul',
      { class: 'wu-points' },
      h('li', {}, h('strong', {}, 'On the phone, models run on the device. '), 'Records stay in the phone; credentials stay in the iOS Keychain or Android Keystore.'),
      h('li', {}, h('strong', {}, 'This demonstration caches model outputs. '), 'They sit in the Space’s storage and the visitor’s browser to save GPU time, and include translations of what visitors typed.'),
      h('li', {}, h('strong', {}, 'Bookings, questions and reviews vanish on reload. '), 'No accounts, no analytics. Hugging Face hosts the Space.'),
      h('li', {}, h('strong', {}, 'Two models are non-commercial. '), 'NLLB-200 and MMS-TTS carry CC BY-NC 4.0.'),
    ),
  );

  const limits = section(
    'wu-limits',
    h('h2', {}, 'Limits'),
    h(
      'ul',
      {},
      h('li', {}, h('strong', {}, 'One writer, one language. '), 'One person wrote all 58 questions, in English.'),
      h('li', {}, h('strong', {}, 'One farm. '), 'A single experience and a single time slot.'),
      h('li', {}, h('strong', {}, 'Some phrasings get missed. '), '3 of 10 held-out answerable questions went to the owner.'),
      h('li', {}, h('strong', {}, 'One false reply still passed. '), 'It told visitors to "log into" a site that has no logins.'),
    ),
    h('p', { class: 'wu-source' }, 'Method, grading review and raw replies: docs/chat-evaluation.md in the Wren repository. scripts/eval-chat.ts reruns the evaluation.'),
  );

  const page = h('div', { class: 'wu' }, hero, h('main', { class: 'wu-main' }, harness, setups, hallucinations, kinds, pipeline, examples, runs, benchmarks, privacy, limits));

  // Each section animates once, the first time it scrolls into view.
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        countUp(entry.target);
        seen.unobserve(entry.target);
      }
    },
    { threshold: 0.25 },
  );
  queueMicrotask(() => page.querySelectorAll('.reveal').forEach((el) => seen.observe(el)));
  return page;
}
