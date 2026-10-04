# Technical video script

The brief asks: "Please explain in 60 sec what was challenging to build, how you overcame the
challenges and what are remaining limitations." The script records the demonstration Space
(`https://reversely-wren.hf.space/`), takes the challenges in the order the demonstration reaches
them, and cuts to the chat evaluation page (`?view=evaluation`) for the figures. The voice-over runs
156 words, which fits 60 seconds at a brisk 160 words a minute. Every figure comes from
`docs/chat-evaluation.md` and `docs/interview.md`.

| Time | Part | Screen | On-screen figure | Voice-over |
| --- | --- | --- | --- | --- |
| 0:00–0:07 | Setting | Demo, steps 01 to 03: the Kiswahili phone and its English twin | | Wren sets up a farm-tour business on a phone, in the owner's own language. Noor works in Kiswahili; the twin shows English. |
| 0:07–0:20 | Challenge, then fix | Demo, step 07: the agent trace streaming the coder's JSON and the copy check | No model touches prices, times or the phone number | First challenge: models small enough for a phone invent facts. So prices, times and the phone number come from the form, never from a model. The coding model writes only short copy, and code rejects any name or number the form doesn't hold. |
| 0:20–0:38 | Challenge, then fix | Demo, step 10: the chat answers a suggested question, then hands the parking question to the owner; cut to "Replies with nothing false" | 53% → 98% accurate, 58 questions | Second: the visitor chat. Our first setup gave a false reply to 27 of 58 questions, like a discount nobody offered. Checks in code now send anything the facts don't support to the owner. Accuracy rose from 53% to 98%, every reply checked by hand. |
| 0:38–0:48 | Fix | Demo, step 13: the phone dashboard and an approval card | | And nothing reaches a visitor unapproved: bookings, questions and reviews wait on Noor's phone. |
| 0:48–1:00 | Remaining limitation | Evaluation page, Next steps | 70% of interview fields; 24.5% → 15.7% speech errors | What remains is voice. Our spoken Kiswahili interview got 70% of fields right, and fine-tuning cut speech errors to 15.7%. Until real recorded speech closes that gap, the form takes the facts. |

## Recording notes

- Run the cache warm-up on the day (`space/web/scripts/warm-cache.ts`) and record signed in to
  Hugging Face, so every step answers from the cache or the account's GPU allowance.
- Use the walkthrough's Show me and Next buttons from step 08 onward; they enter the inputs the
  warm-up cached.
- The figures shown on screen are the page's own; no figure in the voice-over appears without its
  source chart on screen or in the demonstration.
