import {NextRequest,NextResponse} from 'next/server';
import {validCallbackToken} from '@/lib/voice/exotel';
import {refreshSupportCall} from '@/lib/voice/supportCalls';
import {refreshCall} from '@/lib/voice/calls';
export async function POST(req:NextRequest){
 const id=req.nextUrl.searchParams.get('id')||'', token=req.nextUrl.searchParams.get('token')||'';
 const scope=req.nextUrl.searchParams.get('scope')==='support'?'support':'pickup';
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(id) || !validCallbackToken(id,token,scope))return NextResponse.json({success:false},{status:401});
 try {if(scope==='support')await refreshSupportCall(id,true);else await refreshCall(id,true);return NextResponse.json({success:true});}catch{return NextResponse.json({success:false},{status:503});}
 // Callback payload is never trusted. Fetch the known Call SID from the authenticated provider API.
}
