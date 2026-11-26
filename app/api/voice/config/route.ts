import {NextResponse} from 'next/server';
import {voiceConfig} from '@/lib/voice/exotel';
export function GET(){const c=voiceConfig();return NextResponse.json({success:true,data:{enabled:c.enabled,ready:c.enabled&&c.ready}},{headers:{'Cache-Control':'no-store'}});}
