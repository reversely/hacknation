import { columns, toRow, type FarmProfile } from '@wren/contracts';

export const SCRIPT_SCOPE = 'https://www.googleapis.com/auth/script.projects';
export const DEPLOY_SCOPE = 'https://www.googleapis.com/auth/script.deployments';
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const SPREADSHEET_ID_KEY = 'spreadsheet_id';
export const SCRIPT_ID_KEY = 'website_script_id';
export const DEPLOYMENT_ID_KEY = 'website_deployment_id';
export const WEBSITE_URL_KEY = 'website_url';

const SCRIPTS_API = 'https://script.googleapis.com/v1';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPES = [DRIVE_FILE_SCOPE, SCRIPT_SCOPE, DEPLOY_SCOPE];

type Auth = Pick<typeof import('@react-native-google-signin/google-signin').GoogleSignin,
  'hasPreviousSignIn' | 'signIn' | 'addScopes' | 'getTokens'>;
type Meta = { getMeta(key: string): string | null; setMeta(key: string, value: string): void };
type Fetcher = typeof fetch;

type ScriptFile = { name: string; type: 'SERVER_JS' | 'HTML' | 'JSON'; source: string };

export class AppsScriptWebsiteConnector {
  constructor(private readonly auth: Auth, private readonly meta: Meta, private readonly fetcher: Fetcher = fetch) {}

  async ensureSpreadsheet(profile: FarmProfile | null): Promise<string> {
    await this.authorize();
    let id = this.meta.getMeta(SPREADSHEET_ID_KEY);
    if (!id) {
      const created = await this.api<{ spreadsheetId?: string }>(SHEETS_API, {
        method: 'POST', body: JSON.stringify({ properties: { title: 'Wren Farm' }, sheets: [{ properties: { title: 'Farm' } }] }),
      });
      if (!created.spreadsheetId) throw new Error('Google created a spreadsheet without returning its ID. Retry setup.');
      id = created.spreadsheetId;
      this.meta.setMeta(SPREADSHEET_ID_KEY, id);
    }
    await this.api(`${SHEETS_API}/${encodeURIComponent(id)}/values/Farm!A1?valueInputOption=RAW`, {
      method: 'PUT', body: JSON.stringify({ values: [columns('Farm'), ...(profile?.status === 'APPROVED' ? [toRow('Farm', profile)] : [])] }),
    });
    return id;
  }

  async deployWebsite(): Promise<string> {
    await this.authorize();
    const spreadsheetId = this.meta.getMeta(SPREADSHEET_ID_KEY);
    if (!spreadsheetId) throw new Error('Set up the Farm spreadsheet before building the website.');
    const existingUrl = this.meta.getMeta(WEBSITE_URL_KEY);
    if (existingUrl) return existingUrl;

    let scriptId = this.meta.getMeta(SCRIPT_ID_KEY);
    if (!scriptId) {
      const project = await this.api<{ scriptId?: string }>(`${SCRIPTS_API}/projects`, {
        method: 'POST', body: JSON.stringify({ title: 'Wren Farm Website', parentId: spreadsheetId }),
      });
      if (!project.scriptId) throw new Error('Google created the website project without returning its ID. Retry setup.');
      scriptId = project.scriptId;
      this.meta.setMeta(SCRIPT_ID_KEY, scriptId);
    }

    await this.api(`${SCRIPTS_API}/projects/${encodeURIComponent(scriptId)}/content`, {
      method: 'PUT', body: JSON.stringify({ files: websiteFiles(spreadsheetId) }),
    });
    const version = await this.api<{ versionNumber?: number }>(`${SCRIPTS_API}/projects/${encodeURIComponent(scriptId)}/versions`, {
      method: 'POST', body: JSON.stringify({ description: 'Wren public farm website' }),
    });
    if (!version.versionNumber) throw new Error('Google did not return the website version number. Retry setup.');
    const deployment = await this.api<{ deploymentId?: string; entryPoints?: Array<{ webApp?: { url?: string } }> }>(
      `${SCRIPTS_API}/projects/${encodeURIComponent(scriptId)}/deployments`, {
        method: 'POST', body: JSON.stringify({ versionNumber: version.versionNumber, manifestFileName: 'appsscript', description: 'Wren public website' }),
      },
    );
    const url = deployment.entryPoints?.find((entry) => entry.webApp?.url)?.webApp?.url;
    if (!deployment.deploymentId || !url) throw new Error('Google deployed the project without returning its public website address. Retry setup.');
    this.meta.setMeta(DEPLOYMENT_ID_KEY, deployment.deploymentId);
    this.meta.setMeta(WEBSITE_URL_KEY, url);
    return url;
  }

  private async authorize(): Promise<void> {
    if (!this.auth.hasPreviousSignIn()) await this.auth.signIn();
    await this.auth.addScopes({ scopes: SCOPES });
    await this.auth.getTokens();
  }

  private async api<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      const { accessToken } = await this.auth.getTokens();
      response = await this.fetcher(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...init.headers } });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Apps Script API')) throw error;
      throw new Error('Google authorization or network access failed. Reconnect Google and retry.');
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      if (response.status === 403 && /Apps Script API.*disabled|has not been used|is disabled/i.test(detail)) {
        throw new Error('Enable the Google Apps Script API in Google account settings, then return and retry.');
      }
      throw new Error(`Google website setup failed (HTTP ${response.status}). Check the granted permissions and Apps Script API setting, then retry.`);
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }
}

export function websiteFiles(spreadsheetId: string): ScriptFile[] {
  return [
    { name: 'appsscript', type: 'JSON', source: JSON.stringify({
      timeZone: 'Africa/Nairobi', exceptionLogging: 'STACKDRIVER', runtimeVersion: 'V8',
      oauthScopes: [SHEETS_SCOPE], webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' },
    }) },
    { name: 'Code', type: 'SERVER_JS', source: serverSource(spreadsheetId) },
    { name: 'page', type: 'HTML', source: pageSource },
  ];
}

function serverSource(spreadsheetId: string): string {
  return `const SPREADSHEET_ID = ${JSON.stringify(spreadsheetId)};
function doGet() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Farm');
  if (!sheet || sheet.getLastRow() < 2) return HtmlService.createHtmlOutput('<p>Farm website coming soon.</p>');
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const approved = values.map(function(row) { const record = {}; headers.forEach(function(key, i) { record[key] = row[i]; }); return record; })
    .filter(function(record) { return record.status === 'APPROVED'; })
    .sort(function(a, b) { return Number(b.version) - Number(a.version); })[0];
  if (!approved) return HtmlService.createHtmlOutput('<p>Farm website coming soon.</p>');
  approved.offerings = parseCell(approved.offerings, []);
  approved.description = parseCell(approved.description, {});
  approved.meeting_instructions = parseCell(approved.meeting_instructions, {});
  approved.policies = parseCell(approved.policies, {});
  approved.page = parseCell(approved.page, {});
  const template = HtmlService.createTemplateFromFile('page');
  template.farm = approved;
  template.page = approved.page || {};
  return template.evaluate().setTitle(String(approved.name)).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function parseCell(value, fallback) { if (!value) return fallback; try { return JSON.parse(value); } catch (error) { return fallback; } }
`;
}

const pageSource = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?= farm.name ?></title><style>
*{box-sizing:border-box}body{margin:0;background:#eef4e9;color:#1d2c20;font:16px/1.6 system-ui,sans-serif}main{width:min(100% - 32px,780px);margin:auto;padding:32px 0 48px}.hero,.card{padding:24px;border-radius:18px;background:#fbfdf8;margin-bottom:14px}.hero{text-align:center}h1{font-size:clamp(2rem,8vw,3.5rem);line-height:1.1}h2{margin-bottom:10px}.button{display:inline-block;padding:12px 20px;border-radius:24px;background:#315c3a;color:white;text-decoration:none;font-weight:bold}.card{overflow-wrap:anywhere}.price{font-weight:bold;color:#315c3a}
</style></head><body><main><header class="hero"><p><?= farm.name ?></p><h1><?= page.headline ? page.headline.en : 'A day on the farm' ?></h1><p lang="sw"><strong><?= page.headline ? page.headline.sw : '' ?></strong></p><p><?= page.introduction ? page.introduction.en : farm.description.en ?></p><p lang="sw"><?= page.introduction ? page.introduction.sw : farm.description.sw ?></p><a class="button" href="https://wa.me/<?= String(farm.whatsapp_number).replace(/\\D/g, '') ?>">Book on WhatsApp / Weka nafasi</a></header>
<section><h2>Experiences / Ziara</h2><? for (var i = 0; i < farm.offerings.length; i++) { var offer = farm.offerings[i]; ?><article class="card"><h3><?= offer.name.en ?></h3><p><?= offer.description.en ?></p><p lang="sw"><strong><?= offer.name.sw ?></strong> — <?= offer.description.sw ?></p><p class="price"><?= offer.price.currency ?> <?= Number(offer.price.amount).toLocaleString('en') ?> · <?= offer.duration_minutes ?> min · <?= offer.capacity ?> guests</p></article><? } ?></section>
<section><h2>Plan your visit / Panga ziara yako</h2><p><?= farm.meeting_instructions.en ?></p><p lang="sw"><?= farm.meeting_instructions.sw ?></p></section><section><h2>Good to know / Muhimu kujua</h2><p><?= farm.policies.en ?></p><p lang="sw"><?= farm.policies.sw ?></p></section></main></body></html>`;
