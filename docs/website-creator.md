# Website Creator contract

The Website Creator gives visitors who find the farm online one page with its description,
offerings, prices and a "Book on WhatsApp" button. The local coding model fills the page, Noor
approves it, and an Apps Script in Noor's Google account serves it. This file specifies each step.
`docs/architecture.md` section 5 gives the design.

## Generation

The Website Creator loads Qwen2.5-Coder-1.5B-Instruct with a 4,096-token context to write short
page copy and choose a theme and section order. Input is the approved Farm record's public fields,
passed as untrusted data. The model returns a small JSON object; it cannot write HTML. The app
validates the exact schema and rejects markup, URLs and secret-like text. A fixed HTML template in
the app renders the copy and structured public profile fields with HTML escaping.

## Preview and publication

The app renders the page in a WebView for an offline preview. Publication requires a second,
explicit operator confirmation; the model cannot create that approval. Publishing queues the
updated Farm record locally and writes it to the Farm row when Google access and internet are
available. It increments the profile version and preserves the existing profile fields.

The phone writes the row with the Sheets API (`spreadsheets.values.update` on the Farm tab) using
the `drive.file` scope (`docs/google-access.md`). The model's copy and presentation choices go in a
nullable `page` field appended to the end of the Farm record, which #34 adds to
`packages/contracts`.

## Serving

An Apps Script bound to the business spreadsheet runs as Noor and serves the page as a web app at
its `script.google.com` URL. The script holds three files:

| File | Content |
| --- | --- |
| `appsscript.json` | `"webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }` and the `https://www.googleapis.com/auth/spreadsheets` scope |
| `Code.gs` | `doGet()` reads the Farm tab of its own spreadsheet, takes the `APPROVED` row with the highest `version`, and returns the page template evaluated with that row |
| `page.html` | The HTML template; every profile value enters through HtmlService's escaping `<?= ?>` tags |

`doGet()` sets the page title to the farm name and adds a `viewport` meta tag for phone widths. It
opens the bound spreadsheet by its ID and reads only the Farm tab. Apps Script does not expose
`getActiveSpreadsheet()` to a web app, and `openById()` requires the broader `spreadsheets` scope;
Google prompts Noor to authorize the script when it first runs. The public response contains only
the highest-version approved Farm row. Google shows visitors of a personal account's web app a
banner saying another user made the page.

## Spreadsheet and script setup

The selected method is automatic provisioning through the Apps Script API (architecture section
10, decision 3 resolved). After Google sign-in and consent, Wren creates the spreadsheet and Farm
tab, then creates the bound script with `POST https://script.googleapis.com/v1/projects` and the
spreadsheet ID as `parentId`. The app uploads checked-in Apps Script and HTML template sources and
the manifest through `PUT /v1/projects/{scriptId}/content`, creates a version, and deploys a
web app. It saves the deployment's `entryPoints[].webApp.url` in local setup state and the Farm
record.

Before provisioning, Noor must enable "Google Apps Script API" at
`script.google.com/home/usersettings`; Wren can open this page but Google requires the account owner
to enable it. Noor also approves OAuth scopes, and may need to authorize the deployed script once
to read the Farm tab. The phone uses `drive.file` to create and write the spreadsheet; the deployed
script separately requests `spreadsheets` because Apps Script web apps cannot use the narrower
`spreadsheets.currentonly` scope with `openById`. Setup should report each pause clearly and resume
after she returns.
There is no manual template-copy/editor workflow in the selected design.
