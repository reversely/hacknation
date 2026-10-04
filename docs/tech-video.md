# Technical video script

The brief asks: "Please explain in 60 sec what was challenging to build, how you overcame the
challenges and what are remaining limitations." The script records the demonstration Space
(`https://reversely-wren.hf.space/`) and its chat evaluation page (`?view=evaluation`). It opens on
why the team took on a less-resourced language, then the challenge, how the harness overcame it, and
what remains. Each figure is said once, beside the challenge it is evidence for; the first-person
lines are the team's own voice.

| Time | Part | Evidence on screen | Voice-over |
| --- | --- | --- | --- |
| 0:00–0:10 | Why | Demo, step 01: the Kiswahili phone and its English twin | We grew up speaking Hokkien and Hakka, and took it for granted that AI wouldn't handle languages with little data. Building Wren for Kiswahili-speaking farmers, we hit the same wall. |
| 0:10–0:22 | Challenge | Demo, step 10: the chat; cut to the evaluation hero | Small local models struggle with less-resourced languages: the first one we tried understood about 1 in 20 typed Kiswahili requests, and our first chat setup gave a false reply 47% of the time. |
| 0:22–0:42 | How we overcame it | Demo, step 07: the agent trace; step 13: the approval cards; the accuracy chart | So we built harnesses around the models, with a person in the loop. Prices, times and location come from a form, never a model. Code checks every reply, and anything unsupported goes to the farmer's phone for approval. False replies fell from 47% to under 2%. |
| 0:42–0:52 | Remaining limitation | Evaluation page, Next steps | Voice isn't there yet: our spoken Kiswahili interview gets 70% of fields right, so real recorded speech comes next. |
| 0:52–1:00 | Close | The Wren wordmark | We believe people who speak less-resourced languages deserve accurate AI, and that careful implementation can deliver it. |

## Sources for the figures

- About 1 in 20 typed Kiswahili requests understood by Qwen3 1.7B on llama.cpp, the first agent model
  tried: `docs/architecture.md`.
- False replies, 27 of 58 (47%) for the chat's first setup and 1 of 58 (under 2%) with the harness, on
  58 visitor questions written in English: `docs/chat-evaluation.md`.
- 70% of interview fields correct for the phone stack: `docs/interview.md`.

## Recording notes

- Run the cache warm-up on the day (`space/web/scripts/warm-cache.ts`) and record signed in to
  Hugging Face, so every step answers from the cache or the account's GPU allowance.
- Use the walkthrough's Show me and Next buttons from step 08 onward; they enter the inputs the
  warm-up cached.
- The 47% comes from visitor questions written in English, not from Kiswahili prompts; the Kiswahili
  figure is the 1 in 20.
