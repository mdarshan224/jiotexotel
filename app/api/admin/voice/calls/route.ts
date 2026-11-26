import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {requireSupportAdmin,startSupportCall,refreshSupportCall,publicSupportCall} from '@/lib/voice/supportCalls';
import {VoiceError,voiceConfig} from '@/lib/voice/exotel';
import {db} from '@/lib/db';
function failure(e:unknown){return NextResponse.json({success:false,message:e instanceof VoiceError?e.message:'Calling is temporarily unavailable. Check recent calls before retrying.'},{status:e instanceof VoiceError?e.status:503});}
export async function POST(req:NextRequest){
 try{
  if(!hasTrustedOrigin(req) || req.headers.get('sec-fetch-site')==='cross-site')throw new VoiceError('Request not allowed.',403);
  const auth=await getAuthUser(req);requireSupportAdmin(auth);
  const body=await req.json().catch(()=>({}));
  if(typeof body.customerId!=='string' || typeof body.teamPhone!=='string' || typeof body.attemptId!=='string')throw new VoiceError('Select a customer and enter your team mobile number.',400);
  const call=await startSupportCall(auth,{customerId:body.customerId,teamPhone:body.teamPhone,attemptId:body.attemptId});
  return NextResponse.json({success:true,data:publicSupportCall(call)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
export async function GET(req:NextRequest){
 try{
  requireSupportAdmin(await getAuthUser(req));
  const callId=req.nextUrl.searchParams.get('callId');
  if(callId){const call=await refreshSupportCall(callId);return NextResponse.json({success:true,data:publicSupportCall(call)},{headers:{'Cache-Control':'no-store'}});}
  const rows=await db.supportCall.findMany({include:{customer:{select:{user:{select:{name:true,phone:true}}}},caller:{select:{name:true}}},orderBy:{createdAt:'desc'},take:50});
  const c=voiceConfig();
  return NextResponse.json({success:true,data:rows.map(row=>({...publicSupportCall(row),customerName:row.customer.user.name,customerPhone:row.customer.user.phone,initiatedBy:row.caller.name})),callingReady:c.enabled&&c.ready},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
