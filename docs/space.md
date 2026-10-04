# Wren demonstration Space

A Hugging Face Space shows Wren on a desktop screen: a phone-sized Wren panel runs the onboarding
flow from the hi-fi design, and a narration panel beside it shows each step the system takes as it
happens. The Space runs in parallel with the phone app and changes nothing in it. It reuses the
app's TypeScript and runs every model inside the Space, with no Google, WhatsApp or ElevenLabs call
at run time. Tickets #43 to #47 build it.

## Conventions

- **Bundle:** the browser application in `space/web/`, written in TypeScript and built with bun.
- **Model server:** the Python Gradio application in `space/app.py` and `space/models/`, which loads
  the models and answers model calls.
- **Model call:** one request from the bundle to the model server.
- **Trace:** the list of steps a user action ran (stage, model, input, output, milliseconds, cache
  hit), which the narration panel renders.
- **Pinned revision:** a model repository commit SHA; no file loads from a branch name.

## Hosting

The Space is `reversely/wren`: Gradio SDK 6.29.1, Python 3.12, ZeroGPU hardware (decided by the user
on 4 October 2026). The storage bucket `reversely/wren-storage` is mounted read-write at `/data`, and
its contents survive restarts and rebuilds. Gradio
serves the bundle as static files and hosts the model calls as API functions decorated with
`@spaces.GPU`. ZeroGPU lends a GPU only for the length of each decorated call and charges that time
to the visitor's daily quota: 2 minutes without an account, 5 with a free account, 40 with PRO
(Hugging Face's ZeroGPU documentation). Each call carries a duration limit from `models.json`; the
default limit is 60 seconds. The Space runs every model in PyTorch through `transformers`, since
ZeroGPU supports only PyTorch.

## Phone panel

The phone panel follows the hi-fi onboarding design. Each screen collects one part of the farm
profile through ordinary form controls, so most of the flow runs without a model.

| Screen | Collects | Model use |
| --- | --- | --- |
| Choose your language | Interface language | None; interface text in each language ships with the Space |
| Sign in to Wren | A mock "Continue with Google" step | None; the Space makes no Google call |
| Tell us about your business | Phone number, optional photos | None |
| Services | For each service: type, duration, price per client, capacity; "Add another service" | None |
| When are you available? | Days of the week and time slots | None |
| Review and create site | A summary of services, schedule and contact details | "Create Business Site" generates the site (below) |
| The site | The generated page with booking requests, visitor questions and reviews | Questions and reviews (below) |

Values from the form controls go straight into the Farm record; no value passes through a model.

## Narration panel

The narration panel fills a timeline from each trace: which screen produced which record field, the
prompt and JSON schema a model received, the model's raw output, the checks the copy passed or
failed, the cache result and the time each step took. It states that the Space runs the models in
full precision, while the phone runs the agent and the coder as 4-bit GGUF files.

## Inference

Inference runs once per distinct input and is cached, so a replayed demonstration spends almost no
GPU time.

| Moment | When | Model | Call | Cached in |
| --- | --- | --- | --- | --- |
| Text the operator types (a custom service name, the business name), shown in the twin phone | Live, as it is entered | NLLB-200 600M | `translate` | Browser, then server |
| Create Business Site: headline and introduction in English, then in the operator's language | Live, once per profile | Qwen2.5-Coder 1.5B, then NLLB-200 600M | `json`, then `translate` | Browser, then server |
| A visitor's question in the site's chat, answered from the site's facts and published reviews | Live | Qwen2.5 0.5B Instruct in English, with NLLB-200 600M for a Kiswahili site | `visitor`, with `translate` | Browser, then server |
| A visitor's review, labelled positive, neutral or negative | Live | Gemma 4 E2B | `chat` | Browser, then server |

Values from the form controls never pass through a model; booking requests turn the availability
slots into held requests without one.

## Visitor's view

After Create site, the page switches to the visitor's view: the farm's site in a laptop frame, in
the site's language, with its own look. The visitor reads about the farm and its contact details,
books a slot, asks the site's chat, and leaves a review. A booking returns a reference code that
encodes the service, date, slot and party size with a check character, so the visitor can look the
booking up again with no backend. Each booking, question reply and review also reaches the
operator's phone for approval; the role switch moves between the two views.

The page contrasts the two sides: the creation side has a dark left panel with serif type and the
phones on a light stage; the visitor side inverts it, with a light left panel, sans-serif type and
the laptop on a dark stage.

## Twin phone

When the operator chooses a language other than English, a second phone beside the first mirrors
it in English: the same screen and the same state (decided by the user on 4 October 2026). When the
operator chooses English, only one phone shows. Each phone uses one language only, as the survey
requires. Labels come from the survey's hand-written strings (`app/src/survey/strings.ts`); text the
operator typed is translated live through `translate`, and the narration shows each translation
with its source, time and cache result.

## Bundle

The bundle imports the app's pure modules directly: `app/src/agent/websiteCreator.ts`,
`app/src/agent/farmRecord.ts` and `app/src/agent/swahiliTime.ts`. `app/src/agent/publication.ts`
reads the app's setup store and phone database, so the bundle needs its pure steps split into a
module without those imports; that file belongs to the coordinator owner, and the split is asked for
on #32. Every model use goes through one `Models` interface, so tests run the bundle against a
scripted implementation.

## Models

`space/models.json` lists every model once: role, repository, pinned revision, files, generation
settings and the GPU time limit for its call. The model server's loader and the narration labels both read it.

| Role | Repository | Revision | Licence | Weights |
| --- | --- | --- | --- | --- |
| Website copy | `Qwen/Qwen2.5-Coder-1.5B-Instruct` | `2e1fd397ee46` | Apache 2.0 | 3.1 GB |
| Translation | `facebook/nllb-200-distilled-600M` | `f8d333a098d1` | CC BY-NC 4.0 | 2.5 GB |
| Agent | `google/gemma-4-E2B-it` | `3e22461f65e8` | Apache 2.0 | 10.2 GB |

Revisions are the first 12 characters of the commit SHA at planning time; `models.json` holds the
full SHA. No repository is gated, so the Space needs no Hugging Face token. Speech to text and text
to speech stay out of the Space, because the onboarding flow is a form.

## Model calls

| Call | Input | Output | Notes |
| --- | --- | --- | --- |
| `json` | prompt, JSON schema, token limit | JSON text | The schema travels in the prompt; `buildSite` validates the reply, retries twice, then falls back to the operator's words |
| `translate` | texts, source, target | texts | Beam 4, no sampling, sentences batched in one GPU call |
| `chat` | messages, token limit | text | Gemma 4 E2B: Wren's draft replies and review sentiment; no sampling |
| `visitor` | messages, token limit | text | Qwen2.5 0.5B Instruct (Apache 2.0; decided by the user on 4 October 2026): the visitor's chat, in English; no sampling |

The bundle calls the model server through Gradio's JavaScript client, `@gradio/client` (ISC licence;
decided by the user on 4 October 2026), with results cached on both sides (Caching).

Prompts and schemas travel in each call; the model server holds none. The visitor prompts live in
`space/web/src/prompts.ts`, shared by the page and `scripts/warm-cache.ts` so both produce the same
cache keys. Each response carries the model's repository and revision, the milliseconds spent and
whether it came from the cache.

## Decisions

1. Constrained decoding for `json`, a new library: `outlines` (Apache 2.0) or `lm-format-enforcer`
   (MIT). Until the user decides, `json` adds no library and relies on the pipeline's validation and
   retries; the narration shows every fallback.
