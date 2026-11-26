import {createHmac} from 'node:crypto';
import {db} from '@/lib/db';
import {getAdminAuthorizationStatus} from '@/lib/auth/middleware';
import type {JwtPayload} from '@/lib/auth/jwt';
import {activeCallStatuses} from './calls';
import {VoiceError,voiceConfig,mobileNumber,connectNumbers,getCallDetails} from './exotel';
export function requireSupportAdmin(auth:JwtPayload|null): asserts auth is JwtPayload {
 const status=getAdminAuthorizationStatus(auth);
 if(status!==200)throw new VoiceError(status===401?'Please sign in as an administrator.':'Administrator access required.',status);
}
export async function startSupportCall(auth:JwtPayload,input:{customerId:string;teamPhone:string;attemptId:string}) {
 requireSupportAdmin(auth);
 const config=voiceConfig();
 if(!config.enabled || !config.ready)throw new VoiceError('Calling has not been activated yet.');
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(input.attemptId))throw new VoiceError('Invalid call request.',400);
 const from=mobileNumber(input.teamPhone);
 if(from==='+919876543210')throw new VoiceError('The review login number cannot be used for real calls.',400);
 const teamPhoneHash=createHmac('sha256',process.env.JWT_SECRET!.trim()).update('junkitout:support-team:'+from).digest('hex');
 const attemptKey=auth.userId+':support:'+input.attemptId;
 const claim=await db.$transaction(async tx=>{
  const customer=await tx.customer.findUnique({where:{id:input.customerId},include:{user:true}});
  if(!customer || customer.user.role!=='CUSTOMER' || customer.user.deletionDueAt)throw new VoiceError('Select an active customer account.',400);
  const to=mobileNumber(customer.user.phone);
  if(to==='+919876543210')throw new VoiceError('The review login cannot receive real support calls.',400);
  if(from===to)throw new VoiceError('Enter a team number different from the customer number.',400);
  const previous=await tx.supportCall.findUnique({where:{attemptKey}});
  if(previous){
   if(previous.customerId!==customer.id || previous.teamPhoneHash!==teamPhoneHash)throw new VoiceError('This request was already used for different call details. Refresh the call form.',409);
   return {call:previous,to,replay:true};
  }
  const now=Date.now();
  const recent=await tx.supportCall.findFirst({where:{AND:[{OR:[{customerId:customer.id},{teamPhoneHash}]},{createdAt:{gt:new Date(now-660000)}},{OR:[{status:{in:activeCallStatuses}},{createdAt:{gt:new Date(now-45000)}}]}]}});
  if(recent)throw new VoiceError('A call for this customer or team number is already starting or was recently requested. Check recent calls first.',429);
  const hour=new Date(now-3600000);
  const [adminCount,customerCount]=await Promise.all([tx.supportCall.count({where:{callerUserId:auth.userId,createdAt:{gt:hour}}}),tx.supportCall.count({where:{customerId:customer.id,createdAt:{gt:hour}}})]);
  if(adminCount>=20 || customerCount>=5)throw new VoiceError('Hourly call limit reached. Please try later.',429);
  const call=await tx.supportCall.create({data:{customerId:customer.id,callerUserId:auth.userId,teamPhoneHash,teamPhoneLast4:from.slice(-4),attemptKey}});
  return {call,to,replay:false};
 });
 if(claim.replay)return claim.call;
 try {
  const result=await connectNumbers({id:claim.call.id,from,to:claim.to,scope:'support'});
  return await db.supportCall.update({where:{id:claim.call.id},data:{gatewaySid:result.sid,status:result.status}});
 }catch(error){await db.supportCall.update({where:{id:claim.call.id},data:{status:'UNKNOWN'}});throw error;}
}
export async function refreshSupportCall(id:string,force=false){
 const call=await db.supportCall.findUnique({where:{id}});
 if(!call)throw new VoiceError('Call not found.',404);
 if(!call.gatewaySid || !activeCallStatuses.includes(call.status) || (!force && Date.now()-call.updatedAt.getTime()<5000))return call;
 const result=await getCallDetails(call.gatewaySid);
 await db.supportCall.updateMany({where:{id,status:{in:activeCallStatuses}},data:result});
 return db.supportCall.findUniqueOrThrow({where:{id}});
}
export function publicSupportCall(call:{id:string;customerId:string;callerUserId:string;status:string;duration:number|null;createdAt:Date;teamPhoneLast4:string}){
 return {id:call.id,customerId:call.customerId,callerUserId:call.callerUserId,status:call.status,duration:call.duration,createdAt:call.createdAt,teamPhoneLast4:call.teamPhoneLast4};
}
