import {db} from '@/lib/db';
import {canCustomerContactAgent} from '@/lib/orders/lifecycle';
import {connectNumbers,getCallDetails,mobileNumber,voiceConfig,VoiceError} from './exotel';
import type {JwtPayload} from '@/lib/auth/jwt';
export const activeCallStatuses=['CREATING','UNKNOWN','queued','in-progress'];
export async function callParticipants(client: any,orderId:string,auth:JwtPayload,requireActive=true) {
 const order=await client.order.findUnique({where:{id:orderId},include:{customer:{include:{user:true}},agent:{include:{user:true}}}});
 const customer=auth.role==='CUSTOMER' && order?.customerId===auth.customerId;
 const agent=auth.role==='AGENT' && Boolean(order?.agentId && order.agentId===auth.agentId);
 if(!order || (!customer && !agent))throw new VoiceError('This pickup is not assigned to your account.',403);
 if(!order.agent?.user || (requireActive && !canCustomerContactAgent(order.status)))throw new VoiceError('Calling is available only during an active assigned pickup.',409);
 const from=customer?order.customer.user.phone:order.agent.user.phone;
 const to=customer?order.agent.user.phone:order.customer.user.phone;
 if([mobileNumber(from),mobileNumber(to)].includes('+919876543210'))throw new VoiceError('The review login cannot place real phone calls. Use a verified customer account.',400);
 return {order,from:mobileNumber(from),to:mobileNumber(to)};
}
export async function startOrderCall(orderId:string,auth:JwtPayload,attempt:string) {
 const config=voiceConfig();
 if(!config.enabled || !config.ready)throw new VoiceError('Calling has not been activated yet.');
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(attempt))throw new VoiceError('Invalid call request.',400);
 const key=auth.userId+':'+orderId+':'+attempt;
 const claim=await db.$transaction(async tx=>{
  const participants=await callParticipants(tx,orderId,auth);
  if(participants.from===participants.to)throw new VoiceError('The caller and recipient must have different registered numbers.',400);
  const previous=await tx.voiceCall.findUnique({where:{attemptKey:key}});
  if(previous)return {call:previous,replay:true,...participants};
  const now=Date.now();
  const recent=await tx.voiceCall.findFirst({where:{orderId,createdAt:{gt:new Date(now-660000)},OR:[{status:{in:activeCallStatuses}},{createdAt:{gt:new Date(now-45000)}}]},orderBy:{createdAt:'desc'}});
  if(recent)throw new VoiceError('A call is already starting or was recently requested. Check its status before trying again.',429);
  const hour=new Date(now-3600000);
  const [mine,orderCount]=await Promise.all([tx.voiceCall.count({where:{callerUserId:auth.userId,createdAt:{gt:hour}}}),tx.voiceCall.count({where:{orderId,createdAt:{gt:hour}}})]);
  if(mine>=5 || orderCount>=10)throw new VoiceError('Calling limit reached. Please contact dispatch for help.',429);
  const call=await tx.voiceCall.create({data:{orderId,callerUserId:auth.userId,attemptKey:key}});
  return {call,replay:false,...participants};
 });
 if(claim.replay)return claim.call;
 // Deliberately outside the transaction; never retry a possibly accepted provider POST.
 try {
  const result=await connectNumbers({id:claim.call.id,from:claim.from,to:claim.to});
  return await db.voiceCall.update({where:{id:claim.call.id},data:{gatewaySid:result.sid,status:result.status}});
 }catch(error){
  await db.voiceCall.update({where:{id:claim.call.id},data:{status:'UNKNOWN'}});
  throw error;
 }
}
export async function refreshCall(id:string,force=false) {
 const call=await db.voiceCall.findUnique({where:{id}});
 if(!call)throw new VoiceError('Call not found.',404);
 if(!call.gatewaySid || !activeCallStatuses.includes(call.status) || (!force && Date.now()-call.updatedAt.getTime()<5000))return call;
 const result=await getCallDetails(call.gatewaySid);
 // A delayed poll must not overwrite a terminal state committed by another request.
 await db.voiceCall.updateMany({where:{id,status:{in:activeCallStatuses}},data:result});
 return db.voiceCall.findUniqueOrThrow({where:{id}});
}
export function publicCall(call:{id:string;status:string;duration:number|null;createdAt:Date}) {return {id:call.id,status:call.status,duration:call.duration,createdAt:call.createdAt};}
