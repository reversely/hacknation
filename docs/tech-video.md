# Technical video script

The brief asks: "Please explain in 60 sec what was challenging to build, how you overcame the
challenges and what are remaining limitations." The script records the demonstration Space
(`https://reversely-wren.hf.space/`) and its chat evaluation page (`?view=evaluation`). It opens
with the problem and its figures, takes the build challenges in the order the demonstration reaches
them, and ends on what remains. The voice-over runs 148 words, about 60 seconds at 150 words a
minute. Each figure is said once, beside the challenge it is evidence for.

| Time | Challenge | Evidence on screen | Voice-over |
| --- | --- | --- | --- |
| 0:00–0:16 | The operator's: falling prices, and no time or computer to sell tours | Evaluation page, Why it matters: the challenges beside the 27.5% and 2.55 million cards | Kenya's coffee auction price fell 27.5% in early 2026, yet 2.5 million international visitors arrived in 2025. Noor could sell them farm tours, but has a phone, patchy internet, no computer, and no time for bookings or messages. |
| 0:16–0:24 | What Wren does about it | Demo, steps 01 to 03: the Kiswahili phone and its English twin | With Wren, Noor answers enquiries quickly, sees what reviews say, and runs the farm's website from the phone, in Kiswahili. |
| 0:24–0:35 | Building: small models invent facts | Demo, step 07: the agent trace, with the coder's JSON and the copy check | The hard part: models small enough for a phone invent facts. So prices, times and the phone number come from a form, never a model, and code checks the short copy it writes. |
| 0:35–0:46 | Building: the visitor chat makes things up | Demo, step 10: the chat hands the parking question to Noor; cut to the 53% → 98% chart | The visitor chat used to make things up. Now anything the facts don't support goes to Noor, and accuracy rose from 53% to 98%. |
| 0:46–0:52 | Building: nothing reaches a visitor unapproved | Demo, step 13: the phone dashboard and an approval card | Noor checks in once a week: review insights, bookings and questions, each waiting for approval. |
| 0:52–1:00 | Remaining: voice | Evaluation page, Next steps: the 70% figure | Voice isn't reliable yet: our spoken Kiswahili interview gets 70% of fields right. Real recorded speech comes next. |

## Sources for the figures

- Coffee auction price, US$7.82/kg in January to US$5.67/kg in March 2026, a 27.5% fall calculated
  from the table; the figures are provisional: KNBS, *Leading Economic Indicators, June 2026*,
  Table 6, p. 13.
- International visitor arrivals, 2,550,600 in 2025, including 1,219,300 for holidays: KNBS,
  *Economic Survey 2026: Popular Version*, tourism section, p. 12.
- Chat accuracy: `docs/chat-evaluation.md`. Interview fields: `docs/interview.md`.

## Recording notes

- Run the cache warm-up on the day (`space/web/scripts/warm-cache.ts`) and record signed in to
  Hugging Face, so every step answers from the cache or the account's GPU allowance.
- Use the walkthrough's Show me and Next buttons from step 08 onward; they enter the inputs the
  warm-up cached.
- The pitch draft's claims that Wren is free and works in Kikuyu stay out: the app supports Kiswahili
  and English, and the repository records no pricing decision.
