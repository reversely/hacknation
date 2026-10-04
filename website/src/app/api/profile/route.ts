import { NextResponse } from 'next/server';
import { PublicProfileResponse } from '@wren/contracts';
import { readApprovedFarm } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const profile = await readApprovedFarm();
    if (!profile) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No approved farm profile is available' } }, { status: 404 });
    const publicProfile = PublicProfileResponse.parse(profile);
    return NextResponse.json(publicProfile, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM_FAILED', message: 'The public profile could not be loaded' } }, { status: 503 });
  }
}
