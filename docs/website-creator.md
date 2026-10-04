# Website Creator contract

The Website Creator gives visitors who find the farm online one page with its description,
offerings, prices and a "Book on WhatsApp" button. The local coding model fills the page, Noor
approves it, and an Apps Script in Noor's Google account serves it. This file specifies each step.
`docs/architecture.md` section 5 gives the design.

## Generation

The Website Creator loads Qwen2.5-Coder-1.5B-Instruct with a 4,096-token context to fill one HTML
template stored in the app. Input is the approved Farm record's public fields and the current
template. The model returns a JSON object with the page's copy and presentation choices. The app
rejects secret-like values, profile fields outside the approved record, and any script, iframe or
external resource in the result.

## Preview and publication

The app renders the filled page in a WebView for an offline preview. Publication requires an
explicit approval that the app records; the model cannot create that approval. Publishing writes
the page to the Farm row of the business spreadsheet.

The phone writes the row with the Sheets API (`spreadsheets.values.update` on the Farm tab) using
the `drive.file` scope (`docs/google-access.md`). The model's copy and presentation choices go in a
nullable `page` field appended to the end of the Farm record, which #34 adds to
`packages/contracts`.

## Serving

An Apps Script bound to the business spreadsheet runs as Noor and serves the page as a web app at
its `script.google.com` URL. The script holds three files:

| File | Content |
| --- | --- |
| `appsscript.json` | `"webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }` and `"oauthScopes": ["https://www.googleapis.com/auth/spreadsheets.currentonly"]` |
| `Code.gs` | `doGet()` reads the Farm tab of its own spreadsheet, takes the `APPROVED` row with the highest `version`, and returns the page template evaluated with that row |
| `page.html` | The HTML template; every profile value enters through HtmlService's escaping `<?= ?>` tags |

`doGet()` sets the page title to the farm name and adds a `viewport` meta tag for phone widths. The
`spreadsheets.currentonly` scope limits the script to its own spreadsheet. The script serves no
other tab. Google shows visitors of a personal account's web app a banner saying another user made
the page.

## Spreadsheet and script setup

Onboarding step 3 creates the spreadsheet with `POST https://sheets.googleapis.com/v4/spreadsheets`
and a Farm tab. The script then reaches the spreadsheet in one of two ways. The choice waits on the
user (`docs/architecture.md` section 10, #19).

Apps Script API, from the phone:

1. Noor switches on "Google Apps Script API" at script.google.com/home/usersettings. The app opens
   that page; no API call can switch it on.
2. `POST https://script.googleapis.com/v1/projects` with `{ "title": "Wren site", "parentId":
   "<spreadsheet ID>" }` creates a script bound to the spreadsheet.
3. `PUT /v1/projects/{scriptId}/content` uploads the three files.
4. `POST /v1/projects/{scriptId}/versions`, then `POST /v1/projects/{scriptId}/deployments` with
   that version, deploys the web app. The deployment's `entryPoints[].webApp.url` gives the site
   address, which the app saves.
5. Noor opens the address once and grants the script its spreadsheet access. Until Noor does,
   visitors see an authorization error.

Template copy:

1. The team shares a template spreadsheet that already carries the bound script.
2. The app copies it into Noor's Drive; the bound script travels with the copy.
3. Noor opens the copy's script editor, deploys it as a web app, grants access, and pastes the
   address into Wren. The Apps Script editor runs in a desktop browser, so this step suits the
   weekend session on the daughter's phone poorly and a computer well.
