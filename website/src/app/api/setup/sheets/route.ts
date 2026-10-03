import { NextRequest, NextResponse } from 'next/server';
import { setupBusinessSheet } from '@/lib/sheets';

export async function POST(request: NextRequest) {
  const expected = process.env.DEVICE_TOKEN;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'A valid device token is required' } }, { status: 401 });
  }
  try {
    const result = await setupBusinessSheet();
    return NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM_FAILED', message: 'Google Sheets setup failed; check the backend connection' } }, { status: 502 });
  }
}
