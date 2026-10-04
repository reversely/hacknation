<p align="center">
  <img src="assets/WREN%20big%20logo%20black.png" alt="Wren" width="280">
</p>

<p align="center">
  <b>Small AI for small businesses.</b><br>
  A phone agent that sets up and runs a farm-tour business's website, built with small local models.
</p>

<p align="center">
  <a href="https://huggingface.co/spaces/reversely/wren"><b>Try the demo on Hugging Face</b></a>
</p>

![The Wren demonstration Space: the operator's phone in Kiswahili beside its English twin](docs/images/space.jpg)

## Who it is for

Wren serves Noor, a small tour operator on a coffee farm in Kenya's highlands. Noor has a phone,
limited internet and little time away from the farm. Wren lets Noor describe the business once, in
Kiswahili, and then builds the farm's website, takes booking requests, answers visitors' questions
and reads their reviews. Every booking waits for Noor's approval.

![Why it matters: Kenya's coffee auction price fell 27.5% from January to March 2026, more than 800,000 smallholders grow coffee, and 2.55 million international visitors arrived in 2025](docs/images/why.jpg)

Sources: KNBS, *Leading Economic Indicators, June 2026*, Table 6 (provisional); FAO Kenya, 21 July
2025; KNBS, *Economic Survey 2026: Popular Version*, p. 12.

## How it works

**1. Noor describes the business.** A short form in Kiswahili collects the farm's name, phone,
services, prices, durations, group sizes and open days. No model touches a number: prices and times
go from the form straight to the page.

<img src="docs/images/form.jpg" alt="The onboarding form in Kiswahili, with its English twin" width="420">

**2. Small models write the site.** NLLB-200 translates Noor's words into English, Qwen2.5-Coder
1.5B writes the headline and service descriptions as JSON, and checks in code reject any name or
number the form does not contain. After three rejected drafts the page uses Noor's own words.

<img src="docs/images/trace.jpg" alt="The agent trace: the coding model's JSON output and the copy check" width="420">

**3. The farm is online.** The site shows the farm in the visitor's language, with Kiswahili,
English and six more.

![The created farm website](docs/images/site.jpg)

**4. Visitors book, ask and review.** The calendar opens only the days Noor chose, and each request
gets a reference code. The site's chat answers from the site's facts only and passes anything else
to Noor.

| Booking request | Visitor chat, asked in Chinese |
| --- | --- |
| ![A booking request with its reference code](docs/images/booking.jpg) | ![The visitor chat answering a question in Chinese](docs/images/chat.jpg) |

**5. Noor reviews it all on the phone.** The dashboard counts bookings, guests, questions and
reviews, lists insights from the reviews, and holds every booking request and review for Noor's
approval.

<img src="docs/images/dashboard.jpg" alt="The operator dashboard in Kiswahili and English" width="420">

## Accuracy

Small models on their own got too many facts wrong, so Wren collects facts through a form and
wraps the visitor chat in strict rules and checks.

| Visitor chat, 58 questions graded by hand | Hallucinated replies |
| --- | --- |
| First prompt | 27 of 58 (47%) |
| Guidelines only | 21 of 58 (36%) |
| Guidelines and checks | 1 of 58 (2%) |

The first agent model tried, Qwen3 1.7B, understood about 1 in 20 typed Kiswahili requests. The full
results are in [docs/chat-evaluation.md](docs/chat-evaluation.md) and
[docs/accuracy.md](docs/accuracy.md).

## Models

| Role | Model |
| --- | --- |
| Translation | NLLB-200 distilled 600M |
| Website copy | Qwen2.5-Coder 1.5B Instruct |
| Agent on the phone | Gemma 4 E2B Instruct |
| Visitor chat in the demonstration | Qwen2.5 0.5B Instruct |

On the phone the agent and coding models run through llama.cpp as 4-bit GGUF files; the
translation model needs a second runtime, which is still being chosen. The Hugging Face
demonstration runs the models in full precision on a shared GPU. NLLB-200 carries a non-commercial
licence.

Built for the Hack-Nation x World Bank Small AI for Development hackathon, tourism track,
October 2026.
