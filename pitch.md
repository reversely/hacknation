# Wren: a phone-based business assistant for small tourism operators

*Small AI for Development Hackathon — Tourism (Annex C). Written responses to the brief, grounded in the current Wren project scope and architecture.*

## 1. Problem statement: who is it for, and what problem does it solve?

Wren is designed for Noor, a fictional small tour operator in Kenya's coffee-growing highlands. The challenge brief does not specify a country or make Noor a real person, so Kenya and the Mount Kenya/Aberdare setting are explicit stand-ins, not facts supplied by the brief.

Noor welcomes a small number of visitors, but managing a tour still means answering questions, translating messages, collecting booking details, keeping dates straight and making the farm easy to find. Those tasks compete with the work of running the farm. A phone-first tool can reduce repeated administration while leaving decisions about visitors and bookings with Noor.

The need is consistent with the wider context, while the evidence has limits. GSMA's 2026 report estimates high mobile ownership among Kenyan women but much lower mobile internet use; its figures describe a national adult survey, not rural farm operators. KIPPRA's study reports uneven digital technology use among Kenyan MSMEs, including food and accommodation businesses, but does not establish the size of the problem for small rural tour operators. Travel and tourism is economically significant: WTTC estimates that the sector supported 1.8 million jobs and contributed 9.3% of Kenya's GDP in 2025. WTTC is an industry council and describes modelled sector-wide impact, not the results Wren itself can deliver.

## 2. Proposed solution: what does Wren do?

Wren is a phone app with a conversational coordinator and task-specific tools. Its MVP is agentic website creation and maintenance: Wren helps Noor create and update an approved farm website, and the site lets visitors request bookings, find answers to basic questions and leave reviews. Wren analyzes review sentiment so Noor can see what visitors value or where they have concerns. Booking requests become tentative holds in a dedicated Google Calendar for Noor to review and confirm.

For the demonstration, the language pair is Kiswahili and English. Noor can review Wren's proposed action in Kiswahili, while the visitor-facing reply is in English. Kikuyu is Noor's possible home language in the Kenyan stand-in scenario, but the brief does not establish it and Wren's Kikuyu support has not been tested. We will say that plainly rather than imply language coverage we have not shown.

The workflow is:

1. Noor provides her farm information and reviews the structured profile. Wren asks about missing facts instead of making them up.
2. Wren generates a website from approved public information. Noor previews and approves it before publication; later profile changes can be used to prepare approved updates.
3. Visitors use the website to request a tour, ask a basic question or leave a review. The site uses Noor's approved profile to answer basic questions; questions outside that information need Noor's attention.
4. For a booking request, Wren checks capacity and creates a tentative hold in the Wren tours Google Calendar when a slot is available. The visitor is told the request is pending Noor's decision, not that the booking is confirmed.
5. Wren analyzes each review's sentiment and shows the result with its source review. Noor reviews holds and other consequential actions, then confirms or declines bookings. Wren rechecks availability before confirmation.

## 3. AI capabilities: what does AI do, and what remains under human control?

Small models help classify a request, extract fields such as date and party size, translate between Kiswahili and English, and draft a reply from Noor's approved facts. Website copy generation is constrained to structured content rendered in an app-owned template; the model does not generate executable site code.

Application code validates model outputs, checks calendar capacity, enforces approval rules and records actions. Visitor submissions are treated as data, not instructions to the agent. Noor's Google tokens stay in secure device storage and are not passed to the model. Farm information and website content go to Noor's Google account; workflow records are kept in the phone's SQLite store. Wren does not put an operator's data through a shared team backend.

The key guardrail is the distinction between a proposal and an action. Answers must come from Noor's approved profile, and questions it cannot answer should be surfaced to Noor. A calendar hold is tentative; booking confirmation, website publication and other consequential changes require her approval. Sentiment is an aid to reviewing feedback, not an objective judgment about a visitor. Offline work may be saved locally or queued, but it does not publish a page or reserve a calendar slot until the relevant online action succeeds.

## 4. Local fit: how does Wren work for phone users with limited connectivity?

The app keeps drafts, profile information and workflow state on the phone, so Noor can prepare work without a live connection. Network-dependent steps—Google authorization, publishing the site and syncing a calendar hold—need connectivity. Wren should show which work is local, queued, completed or failed instead of implying an offline change has reached visitors.

This design addresses the costs of repeated translation and record keeping without assuming that Noor lacks a phone. GSMA's 2026 survey points to affordability as a barrier to greater mobile internet use among Kenyan women; it does not prove that every user or every farm faces the same constraint. We will present offline operation as a design choice for intermittent access, not as evidence that Wren has already increased bookings or income.

## 5. Prototype and demonstration: what can be shown, and what still needs validation?

The end-to-end demonstration should show Noor reviewing a farm profile, generating and previewing the website, publishing it, and walking through a visitor booking request, a basic site question and a review. It should show the tentative Calendar hold, sentiment tied to the source review, and Noor confirming or declining the booking in the review queue. Website publishing, the visitor booking and question flows, review capture and sentiment analysis must be demonstrated before we describe them as working features.

The project architecture specifies an Expo development build with embedded `llama.rn`/llama.cpp and local GGUF models. The voice interview benchmark reports 70% field accuracy on eight synthetic personas, against a 71% ceiling; this is a small engineering evaluation, not evidence of reliable performance with real operators. The selected speech, translation and text-to-speech models include non-commercial licenses, which limits commercial release. Google account provisioning, phone performance, offline end-to-end operation and the website visitor flows must be demonstrated before we describe them as working features. The architecture leaves the website's question-answering and review storage implementation open, so those details remain implementation work.

## 6. Localization: what does adapting AI to this setting require?

Localization means fitting the tool to Noor's language, phone and working conditions. It means asking for missing information in a way she can review, showing her what will be sent, keeping the booking decision hers, and making connectivity limits visible. It also means being honest about the gap between Kiswahili support tested on a handful of examples and reliable support across real visitors, dialects and Kikuyu. The right next step is to test with a Kiswahili speaker and real, consented enquiry examples before claiming broader impact.

## Evidence and sources

| Evidence | Source and limit |
| --- | --- |
| Kenyan women's mobile ownership and mobile internet use | [GSMA, The Mobile Gender Gap Report 2026](https://www.gsma.com/wp-content/uploads/2026/06/The-Mobile-Gender-Gap-Report-2026.pdf). National survey estimates for adults; not specific to rural women or tourism operators. |
| Digital technology use among Kenyan MSMEs, including food and accommodation | [KIPPRA, Digital Technology Utilization in Kenya's Formal and Informal MSMEs (DP338)](https://kippra.or.ke/download/digital-technology-utilization-in-kenyas-formal-and-informal-micro-small-and-medium-size-enterprises-dp338/). Sector-level research; does not quantify Wren's target subgroup. |
| Kenya travel and tourism contribution in 2025 | [WTTC, Kenya tourism economic impact (2026)](https://wttc.org/news/kenya-boosts-africas-tourism-growth-emerging-as-a-leading-sustainable-tourism-powerhouse). WTTC estimates supported jobs and economic contribution; it is not an official government count or evidence of Wren's impact. |
| Kenyan coffee smallholder background | [Thiriku Cooperative case study](https://storymaps.arcgis.com/stories/6eeb1617bf3e4ffd87c047487ffed7d4). Context only; it does not establish Noor's fictional farm details. |
| Wren's language pipeline checks | [Project language notes](docs/language.md). Small, synthetic engineering sample; not an independent or representative evaluation. |

### Data limitations and next checks

- Noor, the farm and demonstration enquiries are fictional or synthetic; there is no real customer dataset in this submission.
- National mobile data and Kenya-wide MSME research cannot establish the experience of a particular rural woman tour operator.
- The stated project language results come from a small scripted sample. A Kiswahili speaker should review the visitor-facing text, and real-world accuracy needs a larger, consented evaluation.
- Wren has no measured evidence yet that it shortens reply times, increases bookings, grows revenue or improves reviews. Compare the same enquiry handled manually and with Wren before making those claims.
- The Kenyan coffee-highlands setting and Kikuyu-at-home assumption are illustrative; the brief does not specify Noor's location or language.

