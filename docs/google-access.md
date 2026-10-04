# Google access

Wren acts in Noor's personal Google account through one OAuth client that the team registers in a
Google Cloud project. Noor signs in once and grants each permission at the onboarding step that
needs it. This file lists the client, the scopes and the token rules. `docs/architecture.md`
sections 2 and 4 give the design.

## OAuth client

- The team's Google Cloud project holds an iOS client and a web client. Their IDs live in
  `app/src/gmail/gmailConnector.ts`, and the iOS client's reversed ID appears as `iosUrlScheme` in
  `app/app.json`.
- The app signs in with `@react-native-google-signin/google-signin`, an existing dependency.
- The iOS client's bundle ID must match the app's bundle ID.

## Scopes

Each onboarding step adds its scopes with `GoogleSignin.addScopes()`, so Noor sees one short request
per step.

| Scope | Onboarding step | Use |
| --- | --- | --- |
| `gmail.readonly` | 2, mailbox | Import enquiries (`docs/messaging.md`) |
| `gmail.send` | 2, mailbox | Send approved replies |
| `drive.file` | 3, spreadsheet | Create the business spreadsheet and read and write that file only; the Sheets API accepts this scope for files the app created |
| `script.projects`, `script.deployments` | 3, spreadsheet | Create and deploy the bound Apps Script, when the Apps Script API setup is chosen (`docs/website-creator.md`) |
| `calendar.app.created` | 6, calendar | Create the "Wren tours" calendar and manage its events, with no access to Noor's other calendars (`docs/bookings.md`) |

Full scope names start with `https://www.googleapis.com/auth/`.

## Tokens

- The Google Sign-In SDK keeps the refresh token in the iOS Keychain or the Android account store.
  Before each batch of calls the app asks the SDK for a current access token with
  `GoogleSignin.getTokens()`.
- No token reaches the model, SQLite, the spreadsheet, the activity log or any prompt.
- Connectors read the token at call time and send it only over HTTPS to Google.

## Testing status

The OAuth client stays in Google's "Testing" publishing status for the hackathon. In that status
Google accepts at most 100 listed test users, so Noor's demonstration account and each team member's
account must appear on the test-user list. Google also expires each refresh token 7 days after
consent, so the demonstration needs a fresh sign-in within the week before it. Publishing for other
operators requires Google's verification, and `gmail.readonly` falls in Google's restricted class,
which adds a security assessment.

## Calendar smoke test with OAuth 2.0 Playground

For a temporary Playground test, use the existing **Web application** OAuth client (the web client
ID configured in `app/src/gmail/gmailConnector.ts`). In Google Cloud Console, open **APIs & Services
> Credentials**, edit that client, and add this one value under **Authorized redirect URIs**:

```text
https://developers.google.com/oauthplayground
```

Leave **Authorized JavaScript origins** empty. Enable **Google Calendar API** in the same Cloud
project. On the OAuth consent screen, add
`https://www.googleapis.com/auth/calendar.app.created` as a data-access scope and make the Google
account used for the test a test user if the app is in Testing mode. Do not add API request URLs as
redirect URIs; the Playground redirect above is the only redirect URI needed for this test.

In [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), open the gear menu, select
**Use your own OAuth credentials**, and enter the Web client ID and its client secret. In Step 1,
request this scope and authorize it:

```text
https://www.googleapis.com/auth/calendar.app.created
```

Exchange the code in Step 2. In Step 3, create the test calendar with:

```http
POST https://www.googleapis.com/calendar/v3/calendars
Content-Type: application/json

{"summary":"Wren tours","timeZone":"Africa/Nairobi"}
```

Copy the response's `id`, then create a tentative hold:

```http
POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events?sendUpdates=none
Content-Type: application/json

{"summary":"Playground smoke test (delete me)","description":"Temporary Wren calendar API check.","start":{"dateTime":"2026-10-10T09:00:00+03:00","timeZone":"Africa/Nairobi"},"end":{"dateTime":"2026-10-10T09:30:00+03:00","timeZone":"Africa/Nairobi"},"status":"tentative","extendedProperties":{"private":{"booking_id":"playground-smoke-test"}}}
```

The `events.insert` response should include an event `id` and `status: tentative`. Delete the test
event with `DELETE /calendars/{calendarId}/events/{eventId}`, then delete the empty test calendar
with `DELETE /calendars/{calendarId}`. In the app, the Calendar setup step requests this scope,
creates the calendar through `CalendarConnector.createWrenCalendar()`, and saves the returned ID
for the booking outbox.
