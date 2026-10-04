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
