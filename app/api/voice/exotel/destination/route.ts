import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {validRoutingToken,resolveVoiceDestination,noDestination} from '@/lib/voice/routing';
/** Regular Dial Whom requires plain text; Programmable Connect v1.0 requires JSON. */
export async function GET(req:NextRequest){
 const json=req.nextUrl.searchParams.get('format')==='json'||req.headers.get('exotel-version')==='1.0';
 function reply(data:ReturnType<typeof noDestination>,status=200){const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};return json?NextResponse.json(data,{status,headers}):new NextResponse(data.destination.numbers.join(','),{status,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});}
 if(process.env.EXOTEL_DYNAMIC_ROUTING_ENABLED!=='true')return reply(noDestination(),410);
 if(!validRoutingToken(req.nextUrl.searchParams.get('token')||''))return reply(noDestination(),403);
 try{return reply(await resolveVoiceDestination(db,{sid:req.nextUrl.searchParams.get('CallSid')||req.nextUrl.searchParams.get('Sid')||'',customField:req.nextUrl.searchParams.get('CustomField')||undefined,fallback:req.nextUrl.searchParams.get('mode')==='fallback'}));}catch{return reply(noDestination());}
}
