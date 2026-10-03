import { google } from 'googleapis';
import { columns, fromRow, SHEET_TABS, toRow, type Cell, type FarmProfile, type SheetTab } from '@noor/contracts';

function clients() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Sheets service account is not configured');
  const account = JSON.parse(raw) as { client_email: string; private_key: string };
  const auth = new google.auth.JWT({
    email: account.client_email,
    key: account.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
  });
  return { sheets: google.sheets({ version: 'v4', auth }), drive: google.drive({ version: 'v3', auth }) };
}

const spreadsheetName = 'Noor Farm Business Records';
const tabs = Object.keys(SHEET_TABS) as SheetTab[];

async function findSpreadsheet(create: boolean) {
  const { sheets, drive } = clients();
  if (process.env.GOOGLE_SHEETS_SPREADSHEET_ID) return { sheets, id: process.env.GOOGLE_SHEETS_SPREADSHEET_ID };
  const found = await drive.files.list({
    q: `name = '${spreadsheetName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 10,
  });
  let id = found.data.files?.[0]?.id;
  if (!id && create) {
    const created = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: spreadsheetName },
        sheets: tabs.map((title, index) => ({ properties: { title, index } })),
      },
    });
    id = created.data.spreadsheetId ?? undefined;
  }
  if (!id) return null;
  return { sheets, id };
}

export async function checkSheetConnection(): Promise<'OK' | 'NOT_CONFIGURED' | 'FAILED'> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return 'NOT_CONFIGURED';
  try {
    const client = await findSpreadsheet(false);
    if (!client) return 'NOT_CONFIGURED';
    await client.sheets.spreadsheets.get({ spreadsheetId: client.id, fields: 'spreadsheetId' });
    return 'OK';
  } catch {
    return 'FAILED';
  }
}

export async function setupBusinessSheet() {
  const client = await findSpreadsheet(true);
  if (!client) throw new Error('Could not locate or create the business spreadsheet');
  const { sheets, id } = client;
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties.title' });
  const existing = new Set((metadata.data.sheets ?? []).map((sheet) => sheet.properties?.title));
  const missing = tabs.filter((tab) => !existing.has(tab));
  if (missing.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: missing.map((title, index) => ({ addSheet: { properties: { title, index } } })) },
    });
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: 'RAW',
      data: tabs.map((tab) => ({ range: `${tab}!A1`, values: [columns(tab)] })),
    },
  });
  // Read back the schema headers to ensure both write and read access work.
  const verify = await sheets.spreadsheets.values.batchGet({ spreadsheetId: id, ranges: tabs.map((tab) => `${tab}!1:1`) });
  const headers = verify.data.valueRanges ?? [];
  if (headers.length !== tabs.length || headers.some((range, index) => JSON.stringify(range.values?.[0]) !== JSON.stringify(columns(tabs[index])))) {
    throw new Error('Could not verify all spreadsheet tabs');
  }
  return { spreadsheetId: id, tabs };
}

export async function readApprovedFarm() {
  const profiles = await readSheetRows('Farm') as FarmProfile[];
  return profiles
    .filter((profile) => profile.status === 'APPROVED')
    .sort((a, b) => b.version - a.version)[0] ?? null;
}

export async function readSheetRows(tab: SheetTab) {
  const client = await findSpreadsheet(false);
  if (!client) return [];
  const { sheets, id } = client;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${tab}!A2:Z` });
  return (response.data.values ?? []).filter((row) => row.length).map((row) => fromRow(tab, row as Cell[]));
}

export class VersionConflictError extends Error {}

export async function writeSheetRow(tab: SheetTab, input: unknown, expectedVersion: number | null) {
  const client = await findSpreadsheet(false);
  if (!client) throw new Error('The business spreadsheet has not been set up');
  const record = SHEET_TABS[tab].parse(input);
  const { sheets, id } = client;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${tab}!A:Z` });
  const rows = response.data.values ?? [];
  const existing = rows.slice(1).findIndex((row) => row[0] === record.id);
  if (existing >= 0) {
    const current = fromRow(tab, rows[existing + 1] as Cell[]);
    const repeatedCreate = expectedVersion === null && current.version === record.version &&
      JSON.stringify(toRow(tab, current as never)) === JSON.stringify(toRow(tab, record as never));
    if (repeatedCreate) return current;
    if (expectedVersion === null || current.version !== expectedVersion || record.version !== expectedVersion + 1) {
      throw new VersionConflictError('The record changed since it was read');
    }
  } else if (expectedVersion !== null || record.version !== 0) {
    throw new VersionConflictError('A new record must start at version zero');
  }
  const rowIndex = existing < 0 ? rows.length + 1 : existing + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${tab}!A${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [toRow(tab, record as never)] },
  });
  return record;
}

export function isSheetTab(tab: string): tab is SheetTab {
  return tabs.includes(tab as SheetTab) && Boolean(SHEET_TABS[tab as SheetTab]);
}
