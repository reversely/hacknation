# Website Creator contract

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

## Serving

An Apps Script bound to the business spreadsheet runs as Noor and serves the page as a web app at
its `script.google.com` URL. The script reads only an `APPROVED` Farm row and inserts every profile
value with HtmlService's escaping `<?= ?>` tags. It serves no other tab. The Google token stays in
the phone's secure storage and travels only over HTTPS to Google. How the spreadsheet and script are
created is open (`docs/architecture.md` section 10).
