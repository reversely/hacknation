# Technical video script

The brief asks: "Please explain in 60 sec what was challenging to build, how you overcame the
challenges and what are remaining limitations." The voice-over is the team's own text, with the
figures checked against the sources below and one sentence added on the remaining limitation.

During our build, we quickly ran into a problem: small, local models don't work very well on obscure
languages.

Growing up speaking dialects like Hokkien and Hakka, with limited datasets we've essentially taken it
for granted that AI won't be able to interact appropriately with these languages.

In fact, when we first started working on this hackathon with Swahili prompts on small models, the
first model we tried understood only about 1 in 20 Swahili requests, and 47% of our chatbot's answers
to visitor questions were flat out incorrect. But we believe that people speaking rare languages
deserve better AI.

Using human-in-the-loop coding implementation, we designed agentic harnesses that minimized
hallucinations from 47% to under 2% in essential functions such as describing the business' core
functions & location.

Voice is still ahead of us: our spoken Swahili interview gets 70% of details right, so real recorded
speech is our next step.

We believe that responsible, thoughtful implementation of AI can help provide accessible, accurate
and inclusive access to Internet resources across the globe, and we hope our tool is a strong
demonstration of this principle put in practice.

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
