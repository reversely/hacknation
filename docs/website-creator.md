# Website Creator contract

## Generation

The Website Creator loads Qwen2.5-Coder-1.5B-Instruct with a 4,096-token context to propose edits
to the checked-in Next.js starter. Input is the `PublicProfileResponse` shape and the current page
source in the site workspace.
The model returns a JSON object with a `files` array of `{ path, content }` replacements. The app
accepts only paths under `src/app/` or `public/`, rejects traversal, symlinks, binary content, files over
256 KB, secret-like values, and changes to API routes, package manifests, deployment configuration,
or the workspace boundary. Only profile data returned by the public-profile contract may be placed
in generated pages. The website renders text as React text nodes, never as injected HTML.

## Validation and repair

The hosted preview build runs dependency installation, TypeScript checks, the site checks and the
production build in Vercel's isolated build environment. Its response is reduced to bounded build
diagnostics before it is returned to the coding model. The repair loop has two attempts after the
initial build. Every repair is validated by the same workspace and content rules before upload. A
failed attempt leaves the previous preview untouched and is reported as failed.

## Deployment

The connector uploads a complete source snapshot through Vercel's deployment API. Preview
deployments target `preview`. Production deployments require an explicit app approval receipt;
the model cannot create that receipt. The app records the approval before calling the connector.
The Vercel token stays in secure storage on the phone and is sent only over HTTPS to Vercel.

## Public data and Sheets setup

The public site fetches `/api/profile`, which returns only an approved farm profile projected through
`PublicProfileResponse`. The `POST /api/setup/sheets` endpoint creates or reuses the business
spreadsheet, creates the six contract tabs with their schema headers, and verifies read/write access.
The service account credential and device token remain server-side. The spreadsheet ID is persisted
by searching for the app's business spreadsheet title through the service account's restricted
Drive file scope; operators can also set `GOOGLE_SHEETS_SPREADSHEET_ID` explicitly. The identifier
is never exposed by the public profile route.
