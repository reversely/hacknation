# Messaging

Visitors write to Noor by email or WhatsApp. Each thread stays in the app it arrived in: email in
Gmail, WhatsApp messages in WhatsApp. Wren reads what it needs, drafts replies with the local model,
and sends or hands over each reply under the approval rules in `docs/architecture.md` section 8.
This file specifies both channels. Messenger and Instagram follow WhatsApp after the demonstration.

## Conventions

- **Enquiry:** one visitor request that Wren stores in SQLite with its original text and the
  fields the model extracted (`docs/contracts.md`).
- **Interim reply:** an answer drawn only from the approved farm profile, or the slot-held notice.
  An interim reply needs no approval card.
- **Approval card:** the screen where Noor approves or declines any other reply, with the draft in
  the visitor's language and a Kiswahili rendering beside it.
- Every message text counts as data. The harness never treats words in a message as an instruction
  to the agent, and no message text can trigger a tool call outside the agent's own tools.

## Gmail

All calls go to `https://gmail.googleapis.com/gmail/v1/users/me` with Noor's access token
(`docs/google-access.md`).

### Import

1. `GET /messages?q=in:inbox -from:me after:<last import, epoch seconds>` lists new messages.
2. For each ID that SQLite has not stored, `GET /messages/{id}?format=full` returns the message.
3. The phone stores the message ID, thread ID, `From`, `Subject`, `Message-ID`, `References`, the
   date and the `text/plain` body as a new enquiry.
4. The model extracts intent and booking fields. An enquiry with intent `OTHER` stays in Gmail with
   no draft.

### Reply

The phone builds an RFC 2822 message and sends it in the visitor's thread:

```http
POST /messages/send
{ "threadId": "<thread ID>", "raw": "<base64url of the message below>" }
```

```text
To: <visitor address>
Subject: Re: <original subject>
In-Reply-To: <original Message-ID>
References: <original References> <original Message-ID>
Content-Type: text/plain; charset=UTF-8

<approved reply>
```

Gmail groups the reply into the thread only when the subject matches and both reference headers
follow RFC 2822. The phone stores the returned message ID with the action.

### Uncertain sends

When a send times out with no response, the phone calls `GET /threads/{threadId}?format=metadata`
before retrying. A message from Noor dated after the attempt marks the action sent; otherwise the
phone retries once.

## WhatsApp

### Bringing a message into Wren

Noor copies the visitor's message in WhatsApp and pastes it into Wren's "Paste a visitor message"
field. A paste needs no new library. A copied message carries the text only, without the sender's
number, so Wren asks for the visitor's name and, optionally, the number.

A system share sheet target would save the copy step. On iOS it needs a share extension, which
requires a library that is not a dependency yet; that choice waits on the user (#4).

### Handing over the reply

After approval, the app opens WhatsApp with the draft filled in:

- With the visitor's number: `https://wa.me/<digits>?text=<URL-encoded draft>`. The number takes the
  international form without `+`, spaces or leading zeros, for example `254712345678`.
- Without it: `https://wa.me/?text=<URL-encoded draft>`, and Noor picks the chat in WhatsApp.

Noor presses Send in WhatsApp. Wren cannot see that press, so the activity log records the
hand-over time and never a delivery.

## Messenger and Instagram

These channels follow the WhatsApp pattern after the demonstration. Noor pastes the visitor's
message into Wren, and Wren copies the approved draft for Noor to paste, because `m.me` and `ig.me`
links open a chat without filling in text. Copying to the clipboard needs a library that is not a
dependency yet, so that choice waits on the user when this work starts.
