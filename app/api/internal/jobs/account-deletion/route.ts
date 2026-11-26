import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processAccountDeletions } from '@/lib/accountDeletion';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const actual = Buffer.from(req.headers.get('authorization') || '');
  const wanted = Buffer.from(`Bearer ${expected}`);
  if (!expected || actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  try {
    const result = await processAccountDeletions();
    return NextResponse.json({ success: result.failed === 0, data: result }, { status: result.failed ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ success: false, message: 'Deletion job failed; retry required.' }, { status: 503 });
  }
}
// Vercel Cron invokes GET with the same authorization secret.
export const GET = POST;
