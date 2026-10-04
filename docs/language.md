# Kiswahili handling

Noor writes to Wren in Kiswahili and reads its answers in Kiswahili. This file records how Wren turns those messages into tool calls, which models it uses for each step, and the measurements behind each choice. Section 2 of `docs/architecture.md` lists the models; this file holds the evidence.

## Pipeline

1. App code rewrites Kiswahili clock times to 24-hour digits ("saa tatu asubuhi" becomes 09:00, "saa nane mchana" becomes 14:00). Kiswahili counts hours from about 6 am and 6 pm. Every translation model tested rendered some of these times as the literal number, for example "eight in the afternoon" for 14:00. A time with no time-of-day word stays as written, so "matembezi ya saa mbili" (a two-hour walk) keeps its meaning.
2. A dedicated translation model translates Noor's message into English.
3. The agent model reads the English message and calls tools. Every turn must call a tool (`tool_choice: "required"`); a `reply_to_operator` tool carries plain answers. The turn ends after an action instead of asking the model to describe it.
4. The app writes most text Noor reads: the follow-up question for the next missing field, the approval request and the confirmations. These lines are fixed Kiswahili strings in `app/src/agent/language.ts`.
5. The translation model translates the agent's remaining free-text replies into Kiswahili.

The user chose this design: the agent works in English, and a translation model, not a chat model, handles Kiswahili in both directions.

## Agent model

The agent model is Gemma 4 E2B Instruct, Q4_K_M quantisation (3.1 GB, Apache 2.0, `unsloth/gemma-4-E2B-it-GGUF`). All tests below ran on llama.cpp `llama-server` built at commit `6c8dcaa`, the commit `llama.rn` bundles, with ten typed Kiswahili requests run twice each.

| Model, used directly on Kiswahili | Result |
| --- | --- |
| Qwen3 1.7B (the earlier choice) | Understood about 1 of 20 requests; Kiswahili replies repeated phrases |
| Qwen3 4B | No tool calls; replies looped |
| Gemma 3 4B | No tool calls; tool names written as text |
| Sunflower-Gemma4-E2B (Sunbird) | Fluent Kiswahili, but no tool calls even when one was required, and it wrote `</\|turn>` in place of Gemma 4's end-of-turn token |
| Gemma 4 E4B | First action right in about 16 of 20 runs when a tool call was required |
| Gemma 4 E2B | First action right in most runs; Kiswahili text after a tool call looped |

Gemma 4 E2B and E4B called no tools when the choice was left to them (0 of 20 runs), which is why every turn requires one. With English input from the translation model, Qwen3 1.7B filled fields Noor never gave (capacity 50, "Daily") when required to call a tool, so it is not used as the agent.

## Translation model

The benchmark translated 14 Kiswahili sentences into English with beam search (4 beams, no sampling), so each model gives the same output on every run. Each sentence carries checks on its key values: prices, counts, times, dates, negation and the meeting place, 29 checks in total.

| Model | Licence | Checks passed | Time per sentence, server CPU |
| --- | --- | --- | --- |
| NLLB-200 distilled 1.3B | CC BY-NC 4.0 | 27/29 | 4.1 s |
| NLLB-200 distilled 600M | CC BY-NC 4.0 | 26/29 | 1.8 s |
| MADLAD-400 3B | Apache 2.0 | 26/29 | 8.1 s |
| HPLT v1 (hplt_opus) | CC BY 4.0 | 23/29 | 0.4 s |
| OPUS-MT swc-en and en-sw | Apache 2.0 | 21/29 | 0.4 s |
| OPUS-MT tc-bible-big | Apache 2.0 | 21/29 | 0.7 s |
| M2M100 418M | MIT | 20/29 | 1.6 s |

Five further candidates scored 20/29 or lower: M2M100 1.2B, Rogendo/sw-en, OPUS-MT mul-en, mBART-50 and HPLT v2. The checks most models failed were Kiswahili clock times, which step 1 of the pipeline now converts before translation.

English-to-Kiswahili output had errors in every model. NLLB 600M wrote "wana uhuru" ("they have freedom") for "go free", and most models wrote "Niliokoa" ("I rescued") for "I saved". This is why the app writes most of the Kiswahili Noor reads, and why a Kiswahili speaker reviews those lines before the demonstration.

## Pipeline result

Clock-time conversion, NLLB 600M and Gemma 4 E2B together handled 14 Kiswahili messages, run twice each. All 18 runs of the nine messages that state a tour detail saved the right value in both runs, including 09:00, 14:00, 19:00, 2000 and 1500 written as words, capacity 12 and a price correction. Conversational requests ("I don't want to change anything", "what should I do now", "please confirm", "what have you saved") still produced weak answers or tool-call markup written as text; the app code that answers these requests from the saved draft is in progress.

## Open decisions

The user decides each of these:

1. The translation model licence: NLLB-200 (best scores, non-commercial), HPLT v1 (CC BY 4.0, 23/29) or MADLAD-400 (Apache 2.0, 3B parameters).
2. How the translation model runs on the phone. These encoder-decoder models do not run in llama.cpp, so the phone needs a second runtime, such as ONNX Runtime, which is a new dependency.
3. Phone memory for two models: the agent model (3.1 GB) and the translation model held together, or loaded one at a time.

## Development setup

All inference during development runs on the team's GN100 server, not on the development Mac. `docs/setup.md` ("Testing the agent on a model server") lists the servers and how the app reaches them.
