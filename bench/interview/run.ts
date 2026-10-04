// Voice interview benchmark (docs/interview.md, #39). Runs on the Veriton with bun:
//   bun bench/interview/run.ts [audio dir] [report dir]
// Every persona goes through every speech-to-text, translation and agent combination; text to
// speech is scored apart. All services run on this machine, and the run logs every network
// connection that leaves it.

import { $ } from 'bun';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ChatModel, ModelTurn } from '../../app/src/agent/agentLoop';
import { normalizeSwahiliTimes } from '../../app/src/agent/swahiliTime';
import { Interview, type InterviewRecord } from '../../app/src/interview/engine';
import { normalizeTranscript } from '../../app/src/interview/normalize';
import { BUSINESS, CONFIRM, CONTACT, MORE_SERVICES, serviceQuestions } from '../../app/src/interview/questions';

const AUDIO = process.argv[2] ?? '/root/wren-bench/audio';
const REPORTS = process.argv[3] ?? `/root/wren-bench/reports/${new Date().toISOString().replace(/[:.]/g, '-')}`;
const HOST = '100.97.186.57'; // this machine's address, where the agent and translation servers listen

type SttCandidate = { id: string; url: string; kind: 'whisper' | 'mms' | 'ctc'; file: string | null };
const HF = '/root/.cache/huggingface/hub';
// BENCH_SET=finetunes runs the community fine-tunes that led the speech-to-text screening.
const STT_SETS: Record<string, SttCandidate[]> = {
  baseline: [
    { id: 'whisper-large-v3', url: 'http://127.0.0.1:8100', kind: 'whisper', file: '/root/models/whisper/ggml-large-v3.bin' },
    { id: 'whisper-large-v3-turbo-q5', url: 'http://127.0.0.1:8101', kind: 'whisper', file: '/root/models/whisper/ggml-large-v3-turbo-q5_0.bin' },
    { id: 'whisper-small', url: 'http://127.0.0.1:8102', kind: 'whisper', file: '/root/models/whisper/ggml-small.bin' },
    { id: 'mms-1b-all', url: 'http://127.0.0.1:8103/stt/mms', kind: 'mms', file: `${HF}/models--facebook--mms-1b-all` },
  ],
  finetunes: [
    { id: 'ft whisper-large-v3-sw (ElizabethMwangi)', url: 'http://127.0.0.1:8114', kind: 'whisper', file: '/root/models/whisper-ft/ggml-large-v3-sw-mwangi.bin' },
    { id: 'ft w2v-bert-2.0-sw (badrex)', url: 'http://127.0.0.1:8105/stt/w2v-bert-sw-badrex', kind: 'ctc', file: `${HF}/models--badrex--w2v-bert-2.0-swahili-asr` },
    { id: 'ft wav2vec2-xlsr-sw (eddiegulay)', url: 'http://127.0.0.1:8105/stt/xlsr-sw-eddiegulay', kind: 'ctc', file: `${HF}/models--eddiegulay--wav2vec2-large-xlsr-mvc-swahili` },
    { id: 'ft whisper-small-sw (pplantinga)', url: 'http://127.0.0.1:8110', kind: 'whisper', file: '/root/models/whisper-ft/ggml-small-sw-pplantinga.bin' },
  ],
};
STT_SETS.selected = [STT_SETS.finetunes[1], STT_SETS.finetunes[0], STT_SETS.finetunes[3]];
const STT = STT_SETS[process.env.BENCH_SET ?? 'baseline'];
// BENCH_TRANSLATOR limits the run to one translator, for example nllb-600M.
const TRANSLATORS = [
  { id: 'nllb-1.3B', url: `http://${HOST}:8099` },
  { id: 'nllb-600M', url: `http://${HOST}:8097` },
].filter((t) => !process.env.BENCH_TRANSLATOR || t.id === process.env.BENCH_TRANSLATOR);
const AGENTS = [
  { id: 'gemma-4-E4B', url: `http://${HOST}:8093`, file: '/root/models/gemma-4-E4B-it-Q4_K_M.gguf' },
  { id: 'gemma-4-E2B', url: `http://${HOST}:8094`, file: '/root/models/gemma-4-E2B-it-Q4_K_M.gguf' },
] as const;
const TTS = [
  { id: 'mms-tts-swh', path: '/tts/mms' },
  { id: 'piper-sw_CD-lanfrica-medium', path: '/tts/piper' },
] as const;
const MAX_TURNS = 45;

type Persona = { id: string; covers: string; truth?: Truth; answers?: Record<string, string>; same_as?: string };
type Truth = {
  name: string;
  address: string;
  services: { type: string; description: string; duration_minutes: number; price_kes: number; capacity: number; availability: { day: string; time: string }[]; instructions: string }[];
  phone: string;
  email: string | null;
};
type Timed<T> = { value: T; ms: number };

const config = (await Bun.file(join(AUDIO, 'personas.json')).json()) as { personas: Persona[] };
const byId = new Map(config.personas.map((p) => [p.id, p]));
const resolve = (p: Persona) => (p.same_as ? { ...byId.get(p.same_as)!, id: p.id, covers: p.covers } : p);
// BENCH_QUICK=1 runs one persona through one pipeline, as a smoke test.
const QUICK = process.env.BENCH_QUICK === '1';
const personas = config.personas.map(resolve).slice(0, QUICK ? 1 : undefined);

async function timed<T>(task: () => Promise<T>): Promise<Timed<T>> {
  const started = performance.now();
  const value = await task();
  return { value, ms: Math.round(performance.now() - started) };
}

// Speech to text and translation do not depend on the agent, so each result is computed once.
const memo = new Map<string, Promise<Timed<string>>>();
function once(key: string, task: () => Promise<string>): Promise<Timed<string>> {
  if (!memo.has(key)) memo.set(key, timed(task));
  return memo.get(key)!;
}

function transcribe(stt: SttCandidate, clip: string): Promise<Timed<string>> {
  return once(`stt:${stt.id}:${clip}`, async () => {
    const audio = Bun.file(clip);
    if (stt.kind !== 'whisper') {
      const response = await fetch(stt.url, { method: 'POST', body: audio });
      return ((await response.json()) as { text: string }).text.trim();
    }
    const form = new FormData();
    form.append('file', audio);
    form.append('response_format', 'json');
    form.append('language', 'sw');
    const response = await fetch(`${stt.url}/inference`, { method: 'POST', body: form });
    return ((await response.json()) as { text: string }).text.trim();
  });
}

// Same steps as the app: Swahili clock times to digits, then one sentence at a time.
function translate(translator: { id: string; url: string }, text: string): Promise<Timed<string>> {
  return once(`tr:${translator.id}:${text}`, async () => {
    const sentences = normalizeSwahiliTimes(text).split(/(?<=[.!?])\s+/).filter(Boolean);
    const parts: string[] = [];
    for (const sentence of sentences) {
      const response = await fetch(`${translator.url}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence, source: 'sw', target: 'en' }),
      });
      parts.push(((await response.json()) as { text: string }).text);
    }
    return parts.join(' ');
  });
}

// The agent servers are shared with other work and sometimes answer 500, so a call is retried
// twice; a call that still fails counts as an unread answer and is tallied in the report.
const agentErrors = new Map<string, number>();
function agentModel(url: string): ChatModel {
  return async (messages, tools) => {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, tools, tool_choice: 'required', temperature: 0, max_tokens: 256, chat_template_kwargs: { enable_thinking: false } }),
      }).catch(() => null);
      if (response?.ok) break;
      await Bun.sleep(1000 * (attempt + 1));
    }
    if (!response?.ok) {
      agentErrors.set(url, (agentErrors.get(url) ?? 0) + 1);
      return { content: '', toolCalls: [] };
    }
    const message = ((await response.json()) as { choices: { message: { content: string | null; tool_calls?: ModelTurn['toolCalls'] } }[] }).choices[0].message;
    return { content: (message.content ?? '').trim(), toolCalls: message.tool_calls ?? [] };
  };
}

// Which recorded answer plays for a question: the first ask, a clarifying ask, or a repeat.
function clipFor(persona: Persona, key: string, attempt: number, asked: number): { text: string; file: string } | null {
  const answers = persona.answers ?? {};
  const pick = attempt > 0 && answers[`${key}#clarify`] ? `${key}#clarify` : asked > 0 && answers[`${key}#again`] ? `${key}#again` : key;
  if (!(pick in answers)) return null;
  return { text: answers[pick], file: join(AUDIO, persona.id, `${pick.replace('#', '__')}.wav`) };
}

type Turn = { key: string; attempt: number; heard: string; english: string; saved: boolean; stt_ms: number; translate_ms: number; agent_ms: number };

async function interview(persona: Persona, stt: SttCandidate, translator: { id: string; url: string }, agent: (typeof AGENTS)[number]) {
  const engine = new Interview(agentModel(agent.url));
  const asked = new Map<string, number>();
  const turns: Turn[] = [];
  for (let step = engine.current(); step && turns.length < MAX_TURNS; step = engine.current()) {
    const key = step.question.key;
    const clip = clipFor(persona, key, step.attempt, asked.get(key) ?? 0);
    if (step.attempt === 0) asked.set(key, (asked.get(key) ?? 0) + 1);
    const transcribed = clip ? await transcribe(stt, clip.file) : { value: '', ms: 0 };
    const heard = { ...transcribed, value: normalizeTranscript(transcribed.value) };
    const english = heard.value ? await translate(translator, heard.value) : { value: '', ms: 0 };
    const result = await timed(() => engine.answer(english.value, heard.value));
    turns.push({ key, attempt: step.attempt, heard: heard.value, english: english.value, saved: result.value.saved, stt_ms: heard.ms, translate_ms: english.ms, agent_ms: result.ms });
  }
  return { record: engine.record, turns, score: score(persona.truth!, engine.record, persona.answers) };
}

// Field-level scoring against the persona's ground truth.
const words = (s: string) => new Set(s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3));
function similar(truth: string, value: string | undefined): boolean {
  if (!value) return false;
  const t = words(truth);
  const v = words(value);
  return t.size > 0 && [...t].filter((w) => v.has(w)).length / t.size >= 0.5;
}
const slotKey = (slots: { day: string; time: string }[] = []) => slots.map((s) => `${s.day}@${s.time}`).sort().join(',');

// A text value may be kept in Kiswahili, as the operator said it; it counts when it matches the
// English truth or the persona's own Kiswahili answer.
function score(truth: Truth, record: InterviewRecord, answers: Record<string, string> = {}) {
  const either = (english: string, key: string, value: string | undefined) => similar(english, value) || (answers[key] ? similar(answers[key], value) : false);
  const checks: Record<string, boolean> = {
    name: either(truth.name, 'name', record.name),
    address: either(truth.address, 'address', record.address),
    phone: record.phone === truth.phone,
    email: (record.email ?? null) === truth.email,
    service_count: record.services.length === truth.services.length,
  };
  truth.services.forEach((s, i) => {
    const got = record.services[i] ?? {};
    checks[`service_${i + 1}.type`] = got.type === s.type;
    checks[`service_${i + 1}.description`] = Boolean(got.description);
    checks[`service_${i + 1}.duration`] = got.duration_minutes === s.duration_minutes;
    checks[`service_${i + 1}.price`] = got.price_kes === s.price_kes;
    checks[`service_${i + 1}.capacity`] = got.capacity === s.capacity;
    checks[`service_${i + 1}.availability`] = slotKey(got.availability) === slotKey(s.availability);
    checks[`service_${i + 1}.instructions`] = either(s.instructions, `service_${i + 1}.instructions`, got.instructions);
  });
  const invented = [
    ...(truth.email === null && record.email ? ['email'] : []),
    ...record.services.slice(truth.services.length).map((_, i) => `service_${truth.services.length + i + 1}`),
  ];
  const correct = Object.values(checks).filter(Boolean).length;
  return { correct, total: Object.keys(checks).length, accuracy: correct / Object.keys(checks).length, invented, confirmed: record.confirmed, misses: Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k) };
}

// Word error rate: word-level edit distance over the reference length.
function wer(reference: string, hypothesis: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
  const r = norm(reference);
  const h = norm(hypothesis);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return r.length ? d[r.length][h.length] / r.length : 0;
}

// Connections from the benchmark's own processes (this runner and every server it calls) to
// anywhere but this machine, sampled during the run. Other work on the machine, such as model
// downloads, is not counted.
const outside = new Set<string>();
const LOCAL = /^(127\.|\[::1\]|::1|100\.97\.186\.57|\[::ffff:127\.)/;
const SERVICE_PORTS = [...STT.map((s) => new URL(s.url).port), ...TRANSLATORS.map((t) => new URL(t.url).port), ...AGENTS.map((a) => new URL(a.url).port), '8103'];
const watched = new Set<string>([String(process.pid)]);
for (const port of SERVICE_PORTS) {
  const pid = /pid=(\d+)/.exec(await $`ss -ltnpH sport = :${port}`.quiet().nothrow().text())?.[1];
  if (pid) watched.add(pid);
}
const watcher = setInterval(async () => {
  const lines = (await $`ss -tnpH state established`.quiet().nothrow().text()).split('\n');
  for (const line of lines) {
    const pid = /pid=(\d+)/.exec(line)?.[1];
    if (!pid || !watched.has(pid)) continue;
    const peer = line.trim().split(/\s+/)[3] ?? '';
    if (peer && !LOCAL.test(peer)) outside.add(peer);
  }
}, 2000);

async function peakMemoryMb(port: number): Promise<number | null> {
  const out = await $`ss -ltnpH sport = :${port}`.quiet().nothrow().text();
  const pid = /pid=(\d+)/.exec(out)?.[1];
  if (!pid) return null;
  const status = await Bun.file(`/proc/${pid}/status`).text().catch(() => '');
  const kb = /VmHWM:\s+(\d+)/.exec(status)?.[1];
  return kb ? Math.round(Number(kb) / 1024) : null;
}

// Hugging Face caches hold symlinks, so directories are measured with du -L.
async function sizeMb(path: string | null): Promise<number | null> {
  if (!path) return null;
  if (statSync(path).isFile()) return Math.round(statSync(path).size / 2 ** 20);
  const out = await $`du -sbL ${path}`.quiet().nothrow().text();
  return Math.round(Number(out.split(/\s+/)[0]) / 2 ** 20);
}

// --- Run ---
const startedAt = new Date().toISOString();
const results: { persona: string; stt: string; translator: string; agent: string; accuracy: number; correct: number; total: number; invented: string[]; confirmed: boolean; misses: string[]; turns: Turn[]; record: InterviewRecord }[] = [];

// The two agent servers work in parallel; within each, combinations run one after another.
await Promise.all(
  AGENTS.slice(0, QUICK ? 1 : undefined).map(async (agent) => {
    for (const stt of STT.slice(0, QUICK ? 1 : undefined))
      for (const translator of TRANSLATORS.slice(0, QUICK ? 1 : undefined))
        for (const persona of personas) {
          const run = await interview(persona, stt, translator, agent);
          results.push({ persona: persona.id, stt: stt.id, translator: translator.id, agent: agent.id, ...run.score, turns: run.turns, record: run.record });
          console.log(`${agent.id} ${stt.id} ${translator.id} ${persona.id}: ${run.score.correct}/${run.score.total}`);
        }
  }),
);

// Speech-to-text accuracy on every clip, from the cache the interviews filled plus any clip not asked.
const sttRows = await Promise.all(
  STT.map(async (stt) => {
    const scores: number[] = [];
    const times: number[] = [];
    for (const persona of personas)
      for (const [key, text] of Object.entries(persona.answers ?? {})) {
        const heard = await transcribe(stt, join(AUDIO, persona.id, `${key.replace('#', '__')}.wav`));
        scores.push(wer(text, heard.value));
        times.push(heard.ms);
      }
    return { stt: stt.id, wer: mean(scores), ms: mean(times), size_mb: await sizeMb(stt.file), peak_mb: await peakMemoryMb(Number(new URL(stt.url).port)) };
  }),
);

// Text to speech: every fixed line, timed, then transcribed by the ceiling model.
const lines = [...BUSINESS, ...serviceQuestions(1), MORE_SERVICES, ...CONTACT, CONFIRM].flatMap((q) => [q.sw, q.clarify]);
const ttsRows = [];
for (const tts of TTS) {
  const scores: number[] = [];
  const times: number[] = [];
  const seconds: number[] = [];
  for (const line of lines) {
    const synth = await timed(async () => new Uint8Array(await (await fetch(`http://127.0.0.1:8103${tts.path}`, { method: 'POST', body: JSON.stringify({ text: line }) })).arrayBuffer()));
    const file = join(REPORTS, 'tts', `${tts.id}-${lines.indexOf(line)}.wav`);
    mkdirSync(join(REPORTS, 'tts'), { recursive: true });
    writeFileSync(file, synth.value);
    const heard = await transcribe(STT[0], file);
    scores.push(wer(line, heard.value));
    times.push(synth.ms);
    seconds.push((synth.value.length - 44) / 32000);
  }
  ttsRows.push({ tts: tts.id, intelligibility_wer: mean(scores), ms: mean(times), audio_seconds: mean(seconds) });
}
clearInterval(watcher);

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

const combos = AGENTS.flatMap((agent) =>
  STT.flatMap((stt) =>
    TRANSLATORS.flatMap((translator) => {
      const rows = results.filter((r) => r.agent === agent.id && r.stt === stt.id && r.translator === translator.id);
      if (!rows.length) return [];
      const turns = rows.flatMap((r) => r.turns);
      return [{
        stt: stt.id,
        translator: translator.id,
        agent: agent.id,
        accuracy: mean(rows.map((r) => r.accuracy)),
        invented: rows.reduce((n, r) => n + r.invented.length, 0),
        confirmed: rows.filter((r) => r.confirmed).length,
        turns: mean(rows.map((r) => r.turns.length)),
        stt_ms: mean(turns.map((t) => t.stt_ms)),
        translate_ms: mean(turns.map((t) => t.translate_ms)),
        agent_ms: mean(turns.map((t) => t.agent_ms)),
      }];
    }),
  ),
).sort((a, b) => b.accuracy - a.accuracy);

const agentRows = await Promise.all(AGENTS.map(async (a) => ({ agent: a.id, size_mb: await sizeMb(a.file), peak_mb: await peakMemoryMb(Number(a.url.split(':').pop())), failed_calls: agentErrors.get(a.url) ?? 0 })));
const report = { started_at: startedAt, finished_at: new Date().toISOString(), outside_connections: [...outside], personas: personas.map((p) => ({ id: p.id, covers: p.covers })), combos, stt: sttRows, tts: ttsRows, agents: agentRows, results };
mkdirSync(REPORTS, { recursive: true });
writeFileSync(join(REPORTS, 'report.json'), JSON.stringify(report, null, 2));

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const s = (ms: number) => (ms / 1000).toFixed(2);
const md = [
  `# Voice interview benchmark`,
  ``,
  `Run ${startedAt} to ${report.finished_at} on the Veriton GN100. ${personas.length} synthetic personas (ElevenLabs Eleven v3, voice Halima), ${combos.length} pipelines.`,
  `Connections from the benchmark's ${watched.size} processes to anywhere outside this machine: ${outside.size === 0 ? 'none' : [...outside].join(', ')}.`,
  ``,
  `## Pipelines, best first`,
  ``,
  `| Speech to text | Translation | Agent | Fields correct | Invented | Confirmed | Turns | STT s | Translate s | Agent s |`,
  `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  ...combos.map((c) => `| ${c.stt} | ${c.translator} | ${c.agent} | ${pct(c.accuracy)} | ${c.invented} | ${c.confirmed}/${personas.length} | ${c.turns.toFixed(1)} | ${s(c.stt_ms)} | ${s(c.translate_ms)} | ${s(c.agent_ms)} |`),
  ``,
  `## Speech to text on every clip`,
  ``,
  `| Model | Word error rate | Seconds per clip | File MB | Peak memory MB |`,
  `| --- | --- | --- | --- | --- |`,
  ...sttRows.map((r) => `| ${r.stt} | ${pct(r.wer)} | ${s(r.ms)} | ${r.size_mb ?? 'n/a'} | ${r.peak_mb ?? 'n/a'} |`),
  ``,
  `## Text to speech on Wren's ${lines.length} lines`,
  ``,
  `| Voice | Word error rate when transcribed by whisper-large-v3 | Seconds to synthesize | Seconds of audio |`,
  `| --- | --- | --- | --- |`,
  ...ttsRows.map((r) => `| ${r.tts} | ${pct(r.intelligibility_wer)} | ${s(r.ms)} | ${r.audio_seconds.toFixed(1)} |`),
  ``,
  `## Agent models`,
  ``,
  `| Model | File MB | Peak memory MB | Calls failed after retries |`,
  `| --- | --- | --- | --- |`,
  ...agentRows.map((r) => `| ${r.agent} | ${r.size_mb} | ${r.peak_mb ?? 'n/a'} | ${r.failed_calls} |`),
  ``,
  `The agent and translation servers are shared with other work on this machine, so their times include any waiting. Peak memory is the server process's resident memory; whisper.cpp keeps model weights in GPU memory, which this figure leaves out. Sizes of Hugging Face models are their fp32 cache on disk.`,
].join('\n');
writeFileSync(join(REPORTS, 'report.md'), md);
console.log(md);
