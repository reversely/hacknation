// Speech-to-text screening for the voice interview (docs/interview.md, #39). Runs on the Veriton:
//   bun bench/interview/screen_stt.ts [report dir]
// Scores every candidate on the persona clips (one voice, the test interviewees) and on the
// synthetic domain set (nine other voices: prices, counts, times, phone numbers), with word error
// rate overall and per category. The best small candidates then go through the full interview run.

import { $ } from 'bun';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPORT = process.argv[2] ?? `/root/wren-bench/reports/stt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const AUDIO = '/root/wren-bench/audio';
const SYNTH = '/root/wren-bench/synth';
const HF = '/root/.cache/huggingface/hub';

type Candidate = { id: string; post: (wav: Blob) => Promise<string>; size: string; phone?: boolean };

const whisper = (port: number) => async (wav: Blob) => {
  const form = new FormData();
  form.append('file', wav);
  form.append('response_format', 'json');
  form.append('language', 'sw');
  return ((await (await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: form })).json()) as { text: string }).text.trim();
};
const raw = (url: string) => async (wav: Blob) => ((await (await fetch(url, { method: 'POST', body: wav })).json()) as { text: string }).text.trim();

const CANDIDATES: Candidate[] = [
  { id: 'whisper-large-v3', post: whisper(8100), size: '/root/models/whisper/ggml-large-v3.bin' },
  { id: 'whisper-large-v3-turbo-q5', post: whisper(8101), size: '/root/models/whisper/ggml-large-v3-turbo-q5_0.bin', phone: true },
  { id: 'whisper-small', post: whisper(8102), size: '/root/models/whisper/ggml-small.bin', phone: true },
  { id: 'mms-1b-all', post: raw('http://127.0.0.1:8103/stt/mms'), size: `${HF}/models--facebook--mms-1b-all` },
  { id: 'ft whisper-small-sw (pplantinga)', post: whisper(8110), size: '/root/models/whisper-ft/ggml-small-sw-pplantinga.bin', phone: true },
  { id: 'ft whisper-small-sw (PaschalK)', post: whisper(8111), size: '/root/models/whisper-ft/ggml-small-sw-paschalk.bin', phone: true },
  { id: 'ft whisper-small-sw (ElizabethMwangi)', post: whisper(8112), size: '/root/models/whisper-ft/ggml-small-sw-mwangi.bin', phone: true },
  { id: 'ft whisper-turbo-sw-q5 (Zelyanoth)', post: whisper(8113), size: '/root/models/whisper-ft/ggml-turbo-sw-zelyanoth-q5_0.bin', phone: true },
  { id: 'ft whisper-large-v3-sw (ElizabethMwangi)', post: whisper(8114), size: '/root/models/whisper-ft/ggml-large-v3-sw-mwangi.bin' },
  { id: 'ft wav2vec2-xlsr-sw (eddiegulay)', post: raw('http://127.0.0.1:8105/stt/xlsr-sw-eddiegulay'), size: `${HF}/models--eddiegulay--wav2vec2-large-xlsr-mvc-swahili`, phone: true },
  { id: 'ft w2v-bert-2.0-sw (badrex)', post: raw('http://127.0.0.1:8105/stt/w2v-bert-sw-badrex'), size: `${HF}/models--badrex--w2v-bert-2.0-swahili-asr`, phone: true },
];

type Clip = { file: string; text: string; set: 'personas' | 'synthetic'; category: string };

const personas = JSON.parse(readFileSync(join(AUDIO, 'personas.json'), 'utf8')) as { personas: { id: string; answers?: Record<string, string>; same_as?: string }[] };
const byId = new Map(personas.personas.map((p) => [p.id, p]));
const clips: Clip[] = [];
for (const p of personas.personas) {
  const answers = p.answers ?? byId.get(p.same_as ?? '')?.answers ?? {};
  for (const [key, text] of Object.entries(answers)) {
    const field = key.split('#')[0].split('.').pop()!;
    clips.push({ file: join(AUDIO, p.id, `${key.replace('#', '__')}.wav`), text, set: 'personas', category: field });
  }
}
for (const line of readFileSync(join(SYNTH, 'manifest.jsonl'), 'utf8').split('\n').filter(Boolean)) {
  const item = JSON.parse(line) as { audio: string; text: string; category: string };
  clips.push({ file: join(SYNTH, item.audio), text: item.text, set: 'synthetic', category: item.category });
}

function wer(reference: string, hypothesis: string): number {
  const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
  const r = norm(reference);
  const h = norm(hypothesis);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return r.length ? d[r.length][h.length] / r.length : 0;
}

async function sizeMb(path: string): Promise<number | null> {
  try {
    if (statSync(path).isFile()) return Math.round(statSync(path).size / 2 ** 20);
    const out = await $`du -sbL ${path}`.quiet().nothrow().text();
    return Math.round(Number(out.split(/\s+/)[0]) / 2 ** 20);
  } catch {
    return null;
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const rows = [];
const samples: Record<string, { text: string; heard: string }[]> = {};
for (const candidate of CANDIDATES) {
  const scored: { clip: Clip; wer: number; ms: number }[] = [];
  let failed = 0;
  for (const clip of clips) {
    const started = performance.now();
    const heard = await candidate.post(Bun.file(clip.file)).catch(() => null);
    if (heard === null) {
      failed++;
      continue;
    }
    scored.push({ clip, wer: wer(clip.text, heard), ms: performance.now() - started });
    if (clip.category === 'price' || clip.category === 'availability' || clip.category === 'schedule') (samples[candidate.id] ??= []).length < 4 && samples[candidate.id].push({ text: clip.text, heard });
  }
  const of = (filter: (c: Clip) => boolean) => mean(scored.filter((s) => filter(s.clip)).map((s) => s.wer));
  rows.push({
    id: candidate.id,
    phone: Boolean(candidate.phone),
    size_mb: await sizeMb(candidate.size),
    personas: of((c) => c.set === 'personas'),
    synthetic: of((c) => c.set === 'synthetic'),
    numbers: of((c) => ['price', 'count', 'duration', 'capacity'].includes(c.category)),
    times: of((c) => ['schedule', 'availability'].includes(c.category)),
    phone_numbers: of((c) => c.category === 'phone'),
    ms: mean(scored.map((s) => s.ms)),
    failed,
  });
  console.log(`${candidate.id}: personas ${(rows.at(-1)!.personas * 100).toFixed(0)}%, synthetic ${(rows.at(-1)!.synthetic * 100).toFixed(0)}%, failed ${failed}`);
}

rows.sort((a, b) => (a.personas + a.synthetic) / 2 - (b.personas + b.synthetic) / 2);
const pct = (x: number) => (Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(0)}%`);
const md = [
  `# Speech-to-text screening`,
  ``,
  `${clips.filter((c) => c.set === 'personas').length} persona clips (one voice) and ${clips.filter((c) => c.set === 'synthetic').length} synthetic domain clips (nine other voices), all ElevenLabs Eleven v3 Kiswahili, labelled synthetic. Word error rate; lower is better.`,
  ``,
  `| Model | Phone-sized | File MB | Personas | Synthetic set | Numbers | Times | Phone numbers | Seconds per clip | Failed |`,
  `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  ...rows.map((r) => `| ${r.id} | ${r.phone ? 'yes' : 'no'} | ${r.size_mb ?? 'n/a'} | ${pct(r.personas)} | ${pct(r.synthetic)} | ${pct(r.numbers)} | ${pct(r.times)} | ${pct(r.phone_numbers)} | ${(r.ms / 1000).toFixed(2)} | ${r.failed} |`),
  ``,
  `Sizes of Hugging Face models are their fp32 cache on disk; an 8-bit export is about a quarter of that.`,
  ``,
  `## Sample transcripts`,
  ``,
  ...Object.entries(samples).flatMap(([id, items]) => [`**${id}**`, ...items.map((s) => `- "${s.text}" heard as "${s.heard}"`), '']),
].join('\n');
mkdirSync(REPORT, { recursive: true });
writeFileSync(join(REPORT, 'stt-screen.json'), JSON.stringify({ clips: clips.length, rows, samples }, null, 2));
writeFileSync(join(REPORT, 'stt-screen.md'), md);
console.log(md);
