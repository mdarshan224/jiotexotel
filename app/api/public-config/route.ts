import { NextResponse } from 'next/server';
// Explicit allowlist: only browser-safe settings are returned. Provider secrets
// and database/internal job credentials can never enter this response.
export async function GET() {
  return NextResponse.json({ googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '' }, { headers: { 'Cache-Control':'no-store' } });
}
