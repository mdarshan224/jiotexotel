import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {db} from '@/lib/db';
import {VoiceError} from '@/lib/voice/exotel';
import {startOrderCall,callParticipants,publicCall,refreshCall} from '@/lib/voice/calls';
async function run(req:NextRequest,context:{params:Promise<{id:string}>},create:boolean) {
 try {
  if(create && (!hasTrustedOrigin(req) || req.headers.get('sec-fetch-site')==='cross-site'))throw new VoiceError('Request not allowed.',403);
  const auth=await getAuthUser(req);
  if(!auth)throw new VoiceError('Please sign in again.',401);
  const {id}=await context.params;
  if(create){
   const body=await req.json().catch(()=>({}));
   const call=await startOrderCall(id,auth,typeof body.attemptId==='string'?body.attemptId:'');
   return NextResponse.json({success:true,data:publicCall(call)},{headers:{'Cache-Control':'no-store'}});
  }
  await callParticipants(db,id,auth,false);
  const callId=req.nextUrl.searchParams.get('callId');
  const call=await db.voiceCall.findFirst({where:{orderId:id,callerUserId:auth.userId,...(callId?{id:callId}:{})},orderBy:{createdAt:'desc'}});
  const result=call?await refreshCall(call.id):null;
  return NextResponse.json({success:true,data:result?publicCall(result):null},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({success:false,message:error instanceof VoiceError?error.message:'Calling is temporarily unavailable. Please check status before retrying.'},{status:error instanceof VoiceError?error.status:503});}
}
export const POST=(req:NextRequest,context:{params:Promise<{id:string}>})=>run(req,context,true);
export const GET=(req:NextRequest,context:{params:Promise<{id:string}>})=>run(req,context,false);
