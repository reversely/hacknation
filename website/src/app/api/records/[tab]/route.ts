import { NextRequest, NextResponse } from 'next/server';
import { isSheetTab, readSheetRows, VersionConflictError, writeSheetRow } from '@/lib/sheets';

function authorized(request: NextRequest) {
  const expected = process.env.DEVICE_TOKEN;
  return Boolean(expected && request.headers.get('authorization') === `Bearer ${expected}`);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tab: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'A valid device token is required' } }, { status: 401 });
  const { tab } = await params;
  if (!isSheetTab(tab)) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Unknown record collection' } }, { status: 404 });
  try {
    return NextResponse.json({ records: await readSheetRows(tab) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM_FAILED', message: 'Records could not be read' } }, { status: 502 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ tab: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'A valid device token is required' } }, { status: 401 });
  const { tab } = await params;
  if (!isSheetTab(tab)) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Unknown record collection' } }, { status: 404 });
  try {
    const input = await request.json() as { record?: unknown; expected_version?: unknown };
    const expectedVersion = input.expected_version;
    if (!(expectedVersion === null || (typeof expectedVersion === 'number' && Number.isInteger(expectedVersion) && expectedVersion >= 0))) {
      return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'expected_version must be a non-negative integer or null' } }, { status: 400 });
    }
    const record = await writeSheetRow(tab, input.record, expectedVersion as number | null);
    return NextResponse.json({ record }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json({ error: { code: 'VERSION_CONFLICT', message: error.message } }, { status: 409 });
    }
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'The record is invalid or could not be saved' } }, { status: 400 });
  }
}
