# Field accuracy

Noor's website shows prices, durations, group sizes and times that visitors act on, so every value
on it has to match what Noor said. This file records how accurately small local models extract those
values zero-shot, what the team tried to raise that accuracy, and the form harness and visitor-chat
rules that came out of it. `docs/language.md` and `docs/interview.md` hold the full measurements.

All measurements ran on the team's GN100 and Veriton servers with the models the phone uses (llama.cpp,
Q4_K_M GGUF); none ran on a phone.

## Zero-shot results

Ten typed Kiswahili requests, run twice each, went straight to each model with the agent's tools.

| Model | Requests understood or first action right |
| --- | --- |
| Qwen3 1.7B | About 1 of 20 |
| Qwen3 4B | No tool calls; replies looped |
| Gemma 3 4B | No tool calls; tool names written as text |
| Sunflower-Gemma4-E2B | Fluent Kiswahili, no tool calls |
| Gemma 4 E2B and E4B, tool call optional | 0 of 20 |
| Gemma 4 E4B, tool call required | About 16 of 20 |

Without checks, the models also invented values: Qwen3 1.7B saved capacity 50 and "Daily" that Noor
never gave, models wrote "TBD" into empty fields, and after an approval request one replied "Your
profile draft has been approved" before Noor had approved anything.

## Efforts to raise field correctness

| Change | Effect measured |
| --- | --- |
| Every turn must call a tool (`tool_choice: required`), with a `reply_to_operator` tool for plain answers | Gemma 4 went from 0 of 20 to most runs with the right first action |
| The agent works in English; NLLB-200 600M translates Kiswahili in and out | 26 of 29 checks on prices, counts, times, dates, negation and places, against 20 to 23 for most other translation models |
| App code converts Kiswahili clock times ("saa tatu asubuhi") to digits before translation | Every translation model had rendered some of these times as the literal hour |
| The harness rejects placeholders, calls whose preconditions fail, and repeats of a call already waiting for approval | Invented "TBD" values and repeated approval requests stopped in the following runs |
| The app writes the follow-up questions, approval requests and confirmations as fixed Kiswahili lines | The model no longer states an approval that has not happened |
| Typed pipeline: clock conversion, NLLB 600M and Gemma 4 E2B | All 9 messages stating a tour detail saved the right value in both runs; conversational turns stayed weak |
| Spoken interview: speech to text, normalisation of split day names and spoken digit runs, then the typed pipeline | 70% of fields correct across 8 synthetic personas |
| Fine-tuning the w2v-BERT speech model on synthetic Kiswahili clips | Word error rate on held-out persona clips fell from 24.5% to 15.7%, on synthetic voices only |

At 70% field correctness for speech, and with conversational turns still unreliable when typed,
roughly one value in three from a spoken interview would still have needed Noor to catch it in the
read-back.

## Form harness

The models alone did not reach the accuracy a public price list needs, so the team moved fact
collection into a form (`app/src/survey/`). The models now write prose around facts that come from
form controls:

- Noor enters the business name, phone, services, durations, prices, group sizes, days and time
  slots through form controls in the chosen language. Code validates each value; a local phone
  number gains its country code in code.
- No number passes through a model. The page template draws every price, duration, capacity and
  time from the form.
- Qwen2.5-Coder writes only the headline, introduction and service blurbs, in English, under a JSON
  schema. A check rejects copy that contains a number, markup, non-Latin text, or a capitalised name
  not in the form. After three rejected attempts the page uses Noor's own words.
- NLLB translates the English copy into the chosen language.

Across 6 businesses run 3 times each, all 18 pages had every number right and one language only; 13
used model copy and 5 fell back to Noor's words, mostly because the name check rejected ordinary
capitalised words such as "Cuisine".

## Visitor chat rules

The chat on Noor's website answers from the published facts only and passes anything else to Noor.

- **Isolation:** the chat model receives the page's public facts and published reviews as text, and
  nothing else. It has no tools, no access to Noor's accounts, bookings or records, and treats the
  visitor's words as data, never as instructions.
- **Strict answers:** the system prompt limits the reply to one or two sentences from the facts and
  requires the exact reply "I don't know" when the facts do not say. Two worked turns show both
  cases. Decoding is greedy, so the same question gets the same answer.
- **Grounding check:** code marks an answer as unknown when it says "I don't know", comes back
  empty, or repeats a word from the question that the facts never mention, such as "parking".
- **Routing to Noor:** an unknown answer becomes a question on Noor's activity list, marked "the
  site's chat could not answer it", and Wren's weekly summary names what visitors asked that the
  website does not answer.

The demonstration Space runs Qwen2.5 0.5B Instruct for this chat, in English, with NLLB for a
Kiswahili site (`docs/space.md`). On the phone-built Apps Script site, the page matches each
question to an answer Noor approved, using a multilingual embedding model in the visitor's browser,
and sends any question below the match threshold to the spreadsheet's Questions tab for Noor's
weekly review (`docs/architecture.md` section 5). The chat's answer accuracy has not been measured.

## Limits

- The samples are small: 10 requests, 14 translation sentences and 8 personas.
- Every voice in the speech benchmark is synthetic, and the fine-tuned speech model trained on clips
  from the same voice generator.
- No Kiswahili speaker has reviewed the fixed lines, the form labels or the translation references.
