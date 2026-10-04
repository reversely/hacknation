# Voice interview

Noor sets up the business by answering Wren's spoken questions in Kiswahili. Wren fills the Farm
record from the answers, reads back anything it is unsure of, and asks Noor to approve the record
before the Website Creator builds the site. The questions follow the onboarding wireframe
(`docs/lofi-wireframe-onboarding.pdf`, "fill in info", sections 1 to 4). This file records the
interview design, the model size budget, and the benchmark that picks the models.

## Conventions

- **Turn:** one question from Wren and one spoken answer from Noor.
- **Ceiling stack:** the most accurate candidate at each stage, regardless of size. It runs on the
  Veriton GN100 and sets the accuracy the phone stack is measured against.
- **Phone stack:** the smallest candidates whose accuracy stays close enough to the ceiling.
- **Persona:** one synthetic interviewee with a ground-truth answer sheet.
- Sizes marked ≈ come from published model files, not from measurements in this project.

## Interview fields

| Wireframe section | Field | Notes |
| --- | --- | --- |
| 1. Business | name, address | The Farm record gains `address` |
| 2. Services | type (tour, personal service, workshop, other), description, duration, price, capacity | One or more services; the Farm record holds one tour today |
| 3. Per service | availability, instructions | Availability becomes days and start times per service |
| 4. Contact | phone or WhatsApp number, email | The number may already come from Setup |
| 4. Photos | photos | Deferred: a photo picker needs a new library |

The app asks each question as a fixed Kiswahili line. The model's only job in a turn is to extract
field values from Noor's answer through a schema-constrained tool call. Code validates each value,
reads back an uncertain one, accepts corrections ("hapana, ni elfu mbili"), and ends with Noor's
approval card. The Farm schema change goes through `docs/contracts.md` and the coordinator owner
before any code depends on it.

## Live pipeline

1. Speech to text turns Noor's audio into Kiswahili text.
2. App code rewrites Kiswahili clock times to digits, and the translation model renders the answer
   in English (`docs/language.md`).
3. The agent model extracts field values.
4. The next question comes from the app's fixed Kiswahili lines; a free-text reply goes through
   the translation model.
5. Text to speech speaks Wren's line.

Every stage runs on the device that hosts it, with no internet connection.

## Size budget

The phone downloads each model once and loads one at a time, so disk use adds up across stages and
memory peaks at the largest single model.

| Stage | Ceiling candidate | Phone candidates |
| --- | --- | --- |
| Agent | Gemma 4 E4B Q4_K_M, 5.0 GB | Gemma 4 E2B Q4_K_M, 3.1 GB |
| Translation | NLLB-200 distilled 1.3B | NLLB-200 distilled 600M, ≈0.6 GB at 8-bit |
| Speech to text | Whisper large-v3, ≈3.1 GB at f16; MMS-1B-all, ≈4 GB; community Kiswahili fine-tune of Whisper large-v3 | w2v-BERT 2.0 Kiswahili fine-tune, 581M parameters, ≈0.55 GB at 8-bit; wav2vec2 XLSR Kiswahili fine-tune, 315M; Whisper small and its Kiswahili fine-tunes, ≈0.47 GB |
| Text to speech | MMS-TTS `swh`, ≈0.15 GB | MMS-TTS `swh`; a Piper Kiswahili voice, ≈0.06 GB |

The selected phone stack (next section) downloads about 4.4 GB, against about 1 to 2 GB of models
wired today, and peaks at about 3 GB of memory while the agent model is loaded. w2v-BERT, NLLB and
MMS-TTS all need an ONNX runtime on the phone, which is a new dependency and an open decision.

## Benchmark

The benchmark runs every candidate on the Veriton in one pass, offline, so the ceiling and every
phone option are scored on the same audio.

| Stage | Candidates |
| --- | --- |
| Speech to text | Whisper large-v3, large-v3-turbo and small (whisper.cpp); MMS-1B-all; community Kiswahili fine-tunes from Hugging Face: Whisper small (pplantinga, PaschalK, ElizabethMwangi), Whisper large-v3 (ElizabethMwangi), Whisper large-v3-turbo (Zelyanoth), wav2vec2 XLSR (eddiegulay), w2v-BERT 2.0 (badrex) |
| Translation | NLLB-200 distilled 1.3B and 600M |
| Agent | Gemma 4 E4B and E2B |
| Text to speech | MMS-TTS `swh`; a Piper Kiswahili voice |

Speech to text, translation and the agent run as full pipelines: 4 × 2 × 2 = 16 combinations per
persona. Text to speech does not change what the interview extracts, so it runs once per Wren line
and is scored apart.

| Measure | Stage |
| --- | --- |
| Word error rate against the persona's script | Speech to text |
| Fields correct against the ground truth; fields invented; turns to finish | Full pipeline |
| Seconds per stage and per turn | Every stage |
| Peak memory and model file size | Every stage |
| Intelligibility: word error rate when the ceiling speech-to-text model transcribes Wren's audio | Text to speech |

Speech-to-text models are first screened on every clip, then the leaders run full interviews. Two
fixes run on every transcript before translation (`app/src/interview/normalize.ts`): day names a
speech model splits ("juma mosi") are rejoined, and a run of seven or more spoken digits becomes a
phone number. A text value counts as correct in English or in the operator's Kiswahili.

## Selected stack

The user selected the phone stack on 4 October 2026 from the offline benchmark on the Veriton. In
the deciding run no benchmark process made a connection outside the machine.

| Stage | Phone stack | Licence |
| --- | --- | --- |
| Speech to text | `badrex/w2v-bert-2.0-swahili-asr` (w2v-BERT 2.0 fine-tune) | CC BY 4.0 |
| Translation | `facebook/nllb-200-distilled-600M` | CC BY-NC 4.0 |
| Agent | Gemma 4 E2B Instruct, Q4_K_M | Apache 2.0 |
| Text to speech | `facebook/mms-tts-swh` | CC BY-NC 4.0 |

| Pipeline | Fields correct | Records confirmed | Seconds per turn |
| --- | --- | --- | --- |
| Ceiling: Whisper large-v3 Kiswahili fine-tune, NLLB 600M, Gemma 4 E2B | 71% | 6 of 8 | about 2.3 |
| Phone stack | 70% | 7 of 8 | about 2.6 |
| Whisper small Kiswahili fine-tune, NLLB 600M, Gemma 4 E4B | 62% | 8 of 8 | about 2.3 |

| Speech to text, word error rate on 341 clips | Persona clips | Synthetic domain clips |
| --- | --- | --- |
| w2v-BERT 2.0 Kiswahili fine-tune | 24% | 18% |
| Whisper large-v3 Kiswahili fine-tune | 26% | 16% |
| MMS-1B-all | 29% | 23% |
| Whisper large-v3 | 49% | 50% |
| Whisper small | 73% | 80% |

Stock Whisper models garbled Kiswahili numbers ("shilingi elfu moja na mia tano" heard as
"Shilingelf mudia na miatano"), and no translation model recovered them. The phone stack misses
English names said inside Kiswahili and answers given in English; the read-back is where the
operator corrects them. MMS-TTS was more intelligible than the Piper voice when transcribed back
(29% against 40% word error rate).

## Test interviewees

Eight personas cover a single tour, two services, vague times ("asubuhi"), a correction mid-answer,
numbers said in English, a refusal ("sina picha sasa"), a long rambling answer, and a quiet or noisy
recording. Each persona has answers keyed by field, with variants for clarifying follow-ups.
ElevenLabs Eleven v3 generates the Kiswahili audio once, from Voice Library voices; no voice clones a
real person. The audio is labelled synthetic, stays outside git, and replays from disk in every run,
so the system under test never needs the internet.

The benchmark build is tracked in #39.

## Open decisions

1. The ONNX runtime that runs w2v-BERT, NLLB and MMS-TTS on the phone.
2. Photos: the picker library, or photos added later on the website.
3. The Farm schema change for address, several services and per-service availability.
4. Licences: NLLB and MMS-TTS carry CC BY-NC 4.0, which rules out commercial use; a commercial
   release needs other translation and voice models.
