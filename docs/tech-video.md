# Technical video script

The brief asks for 60 seconds on what was challenging to build, how the team overcame it, and what
limitations remain. The script runs 159 words, which fits 60 seconds at a brisk 160 words a minute. Each
segment names the screen to record; every chart comes from the Space's chat evaluation page
(`https://reversely-wren.hf.space/?view=evaluation`), and every figure from `docs/chat-evaluation.md`,
`docs/interview.md` and the sources cited below.

| Time | Screen | Voice-over |
| --- | --- | --- |
| 0:00–0:08 | Evaluation page, Why it matters | Kenya's coffee auction price fell 27.5% in early 2026, while 2.5 million international visitors arrived in 2025. Wren lets a smallholder sell farm tours from a phone. |
| 0:08–0:22 | Four questions, three setups: "Is lunch included?" and the discount example | The hard part was trust. A model small enough for a phone makes things up. In our first chat setup, 27 of 58 replies said something false: lunch included, a group discount nobody offered. |
| 0:22–0:44 | From a conversation to a form, then Replies with nothing false | So facts never pass through the model. Prices, times and the phone number come from a form. The model writes only short copy, and code checks every reply: an unknown topic, a new number or a promise goes to the owner's phone instead. Accuracy rose from 53% to 98%, every reply checked by hand. |
| 0:44–1:00 | Next steps | What remains is voice. Our spoken Kiswahili interview got 70% of fields right, and a fine-tune cut speech errors from 24.5% to 15.7%. That is not yet enough to trust a price heard on a farm, so next we record real speech, with consent. |

## Sources for the context figures

- Coffee auction price, US$7.82/kg in January to US$5.67/kg in March 2026, a 27.5% fall calculated
  from the table; the figures are provisional: KNBS, *Leading Economic Indicators, June 2026*,
  Table 6, p. 13.
- International visitor arrivals, 2,550,600 in 2025, including 1,219,300 for holidays: KNBS,
  *Economic Survey 2026: Popular Version*, tourism section, p. 12.
- More than 800,000 smallholder farmers in Kenya's coffee sector: FAO Kenya, *Investment roundtable on
  coffee value chains in Kenya takes shape*, 21 July 2025.

## Claims kept out of the script

The pitch draft says Wren is free and that operators can describe their farm in Kikuyu. The app
supports Kiswahili and English, and the repository records no pricing decision, so both stay out
until the team confirms them.
