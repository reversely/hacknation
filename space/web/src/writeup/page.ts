// The visitor chat evaluation as an animated page in the Space (docs/chat-evaluation.md). Charts and
// figures animate as each section scrolls into view; nothing moves for a viewer who prefers reduced
// motion. Every number comes from data.ts, which carries the hand-reviewed results.

import { h } from '../ui';
import { barChart, countUp, runLines, stackedColumns } from './charts';
import { BY_KIND, CONFIGS, EXAMPLES, FINE_TUNE, FORM_FIELDS, HALLUCINATIONS, INTERVIEW_PIPELINES, LAYERS, MODELS_USED, QUESTIONS, RUNS, STT_WER, type Config } from './data';

const pct = (n: number) => Math.round((n / QUESTIONS.total) * 100);
const TONE: Record<Config, 'base' | 'mid' | 'good'> = { baseline: 'base', guidelines: 'mid', strict: 'good' };
const VERDICT: Record<string, string> = { hallucination: 'Hallucination', unsafe: 'Unsafe', owner: 'Sent to the owner', fixed: 'Fixed reply', correct: 'Correct' };

export function writeupPage(back: () => void, logo: string, mascot: string): HTMLElement {
  const total = (c: Config) => HALLUCINATIONS[c].development + HALLUCINATIONS[c].heldOut;
  const section = (cls: string, ...children: (HTMLElement | SVGElement | null)[]) => h('section', { class: `wu-section reveal ${cls}` }, ...(children.filter(Boolean) as HTMLElement[]));

  const hero = h(
    'header',
    { class: 'wu-hero' },
    h('div', { class: 'wu-hero-top' }, h('img', { src: logo, alt: 'Wren', class: 'wu-logo' }), h('button', { type: 'button', class: 'wu-back', onclick: back }, '← Back to the demonstration')),
    h('p', { class: 'wu-kicker' }, 'Visitor chat evaluation'),
    h('h1', {}, `Hallucinated replies fell from ${total('baseline')} of ${QUESTIONS.total} to ${total('strict')} of ${QUESTIONS.total}`),
    h('p', { class: 'wu-lead' }, `The farm's website chat runs Qwen2.5 0.5B. ${QUESTIONS.total} visitor questions went through three setups of the same model, and every reply was graded by hand. A hallucination is a reply that states something the site's facts do not say, or contradicts them.`),
    h(
      'div',
      { class: 'wu-stats reveal' },
      ...CONFIGS.map((c) => h('div', { class: `wu-stat ${TONE[c.id]}` }, h('strong', { 'data-count': pct(total(c.id)) }, `${pct(total(c.id))}%`), h('span', {}, c.label), h('small', {}, `${total(c.id)} of ${QUESTIONS.total} replies`))),
    ),
    h('img', { src: mascot, alt: '', class: 'wu-mascot', 'aria-hidden': 'true' }),
  );

  const harness = section(
    'wu-harness',
    h('h2', {}, 'From a conversation to a form'),
    h('p', {}, 'Wren first set a business up through a spoken interview: the operator answered in Kiswahili and a model extracted every field from the transcript. On eight synthetic interviewees, the phone stack got 70% of fields right, against 71% for the largest models. The harness now takes the same facts through a form: prices, durations, group sizes, days, times and the phone number never pass through a model.'),
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
    h('p', {}, 'The coding model writes only the headline, the introduction and one sentence per service, as JSON. Code rejects any name or number the survey does not contain and asks again; after three attempts the page uses the operator’s own words. The template then draws every price, duration, group size, day, time and phone number straight from the form. Wording can still go beyond the facts: "the aroma of freshly roasted beans on your doorstep" passed the check, which looks for names and numbers.'),
  );

  const setups = section(
    'wu-setups',
    h('h2', {}, 'Three setups of one model'),
    h('p', {}, 'The same model, at the same pinned revision and with greedy decoding, answered from the same facts: a guided tour of 2 hours at KES 1,500 per person, up to 6 people, open Saturday and Sunday at 09:00, near the Ondera market, one phone number.'),
    h('div', { class: 'wu-cards' }, ...CONFIGS.map((c, i) => h('div', { class: `wu-card ${TONE[c.id]}` }, h('span', { class: 'wu-n' }, String(i + 1).padStart(2, '0')), h('h3', {}, c.label), h('p', {}, c.detail)))),
  );

  const hallucinations = section(
    'wu-chart',
    h('h2', {}, 'Hallucinated replies reaching the visitor'),
    h('p', {}, `${QUESTIONS.development} development questions were written first and the checks were adjusted against them; ${QUESTIONS.heldOut} held-out questions were written afterwards and never used to adjust anything.`),
    stackedColumns(
      CONFIGS.map((c) => ({ label: c.label, parts: [{ value: HALLUCINATIONS[c.id].development, key: 'dev' }, { value: HALLUCINATIONS[c.id].heldOut, key: 'held' }] })),
      Math.max(...CONFIGS.map((c) => total(c.id))),
    ),
    h('div', { class: 'wu-legend' }, h('span', { class: 'sw dev' }), 'Development questions', h('span', { class: 'sw held' }), 'Held-out questions'),
  );

  const kinds = section(
    'wu-kinds',
    h('h2', {}, 'By kind of question'),
    h('p', {}, 'Unanswerable questions are ones the facts do not cover, such as "Is lunch included?". Adversarial questions try to change the chat\'s instructions, book through the chat, share a card number, or get a discount or refund.'),
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
    h('p', {}, 'The rules live in code around the model, not only in its prompt, so a reply the facts do not support never reaches the visitor.'),
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
    h('h2', {}, 'The cost: questions sent to the owner'),
    h('p', {}, `The strict pipeline answered ${BY_KIND[2].values.strict} of ${BY_KIND[2].of} answerable questions and sent ${BY_KIND[3].values.strict} to the owner, who answers them from the phone. The chart follows the development set as the checks changed: widening the everyday question words stopped correct answers being held back; the open-day check then caught a reply calling Sunday closed.`),
    runLines(RUNS.map((r) => ({ run: r.run, a: r.sentToOwner, b: r.hallucinations })), ['Answerable questions sent to the owner', 'Hallucinated replies']),
    h('div', { class: 'wu-legend' }, h('span', { class: 'sw s0' }), 'Answerable questions sent to the owner (of 12)', h('span', { class: 'sw s1' }), 'Hallucinated replies (of 34)'),
  );

  const benchmarks = section(
    'wu-bench',
    h('h2', {}, 'Benchmarks behind the model choices'),
    h('p', {}, 'Each stage was chosen from benchmarks run offline on one machine, with synthetic Kiswahili interviewees voiced once by ElevenLabs from library voices and replayed from disk. In the deciding run no process made a connection outside the machine.'),
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
    h('p', {}, 'Community Kiswahili fine-tunes beat the stock models: stock Whisper heard "shilingi elfu moja na mia tano" (one thousand five hundred shillings) as "Shilingelf mudia na miatano". The phone stack (w2v-BERT 2.0 fine-tune, NLLB-200 600M, Gemma 4 E2B, MMS-TTS) got 70% of interview fields right against 71% for the largest models. For translation, NLLB-200 600M beat Qwen2.5 0.5B on every phrase tried ("Book a visit": "Réservez une visite" against "Vérifiez un séjour").'),
  );

  const privacy = section(
    'wu-privacy',
    h('h2', {}, 'Privacy and data retention'),
    h('p', {}, 'Every model is open-weight and runs at a pinned revision on hardware the project controls. No prompt goes to a third-party AI service, so no model provider receives or retains what operators and visitors write.'),
    h('table', { class: 'wu-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Model'), h('th', {}, 'Role'), h('th', {}, 'Licence'))), h('tbody', {}, ...MODELS_USED.map((m) => h('tr', {}, h('td', {}, m.model), h('td', {}, m.role), h('td', {}, m.licence))))),
    h(
      'ul',
      { class: 'wu-points' },
      h('li', {}, h('strong', {}, 'On the phone: '), 'llama.cpp runs the models on the device; no cloud inference endpoint is involved. Records stay in SQLite on the phone and credentials in the iOS Keychain or Android Keystore.'),
      h('li', {}, h('strong', {}, 'In this demonstration: '), 'the models run on the Space’s own GPU. To save visitors’ GPU allowance, each model call’s output is cached in the Space’s storage and in the visitor’s browser under a hash of its input; those outputs include translations of what visitors typed.'),
      h('li', {}, h('strong', {}, 'What the demonstration keeps: '), 'bookings, questions and reviews live only in the open browser tab and disappear on reload. The page has no accounts and no analytics. Hugging Face hosts the Space and carries its traffic.'),
      h('li', {}, h('strong', {}, 'Licences: '), 'NLLB-200 and MMS-TTS carry CC BY-NC 4.0, which limits them to non-commercial use.'),
    ),
  );

  const limits = section(
    'wu-limits',
    h('h2', {}, 'Limits'),
    h(
      'ul',
      {},
      h('li', {}, 'One person wrote all 58 questions, in English; Kiswahili questions cross through NLLB-200 600M into English before the same checks and are not measured here.'),
      h('li', {}, 'One farm, with a single experience and a single time slot.'),
      h('li', {}, 'Three of the ten held-out answerable questions went to the owner: the everyday word list does not cover every phrasing visitors use.'),
      h('li', {}, 'The checks compare words, numbers, contacts, commitments and open days. The one hallucination that passed, a booking answer telling visitors to "log into" a site without logins, contradicts the facts in another way.'),
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
