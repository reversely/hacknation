import { NextRequest, NextResponse } from 'next/server';
import { HealthResponse } from '@noor/contracts';
import { checkSheetConnection } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = process.env.DEVICE_TOKEN;
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'A valid device token is required' } }, { status: 401 });
  }
  const payload = HealthResponse.parse({
    server_time: new Date().toISOString(),
    services: {
      sheets: await checkSheetConnection(),
      // These connectors are outside this deployment slice, so credentials alone cannot report success.
      calendar: 'NOT_CONFIGURED',
      whatsapp: 'NOT_CONFIGURED',
    },
  });
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
