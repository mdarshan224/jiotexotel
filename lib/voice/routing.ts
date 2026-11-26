import {createHmac,timingSafeEqual} from 'node:crypto';
import {exotelRequest,mobileNumber,voiceConfig,VoiceError} from './exotel';
import {canCustomerContactAgent} from '@/lib/orders/lifecycle';
export function routingToken(){const secret=process.env.JWT_SECRET?.trim();if(!secret||secret.length<32)throw new VoiceError('Calling setup is incomplete.');return createHmac('sha256',secret).update('junkitout:exotel:dynamic-routing:v1').digest('hex');}
export function validRoutingToken(token:string){try{const expected=Buffer.from(routingToken()),actual=Buffer.from(token);return actual.length===expected.length&&timingSafeEqual(actual,expected);}catch{return false;}}
export function validFlowUrl(value:unknown){if(typeof value!=='string'||value.length>500)return false;try{const u=new URL(value),sid=voiceConfig().sid;return ['http:','https:'].includes(u.protocol)&&['my.exotel.com','my.exotel.in'].includes(u.hostname)&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname.startsWith(`/${sid}/exoml/start_voice/`)&&/^\d+\/?$/.test(u.pathname.split('/start_voice/')[1]);}catch{return false;}}
export function noDestination(){return {fetch_after_attempt:false,destination:{numbers:[]},record:true,recording_channels:'dual'};}
function destination(to:string){if(to==='+919876543210')return noDestination();return {fetch_after_attempt:false,destination:{numbers:[to]},record:true,recording_channels:'dual',max_ringing_duration:30,max_conversation_duration:600,start_call_playback:{playback_to:'callee',type:'text',value:'Junk It Out is connecting your pickup call. This call is being recorded.'}};}
const digits=(v:unknown)=>String(v||'').replace(/\D/g,'').replace(/^91(?=\d{10}$)/,'').replace(/^0(?=\d{10}$)/,'');
/** Call identity is read with server-side Exotel credentials; callback query From is never trusted. */
export async function resolveVoiceDestination(client:any,input:{sid:string;customField?:string;fallback?:boolean},getProviderCall?:()=>Promise<any>){
 if(!/^[A-Za-z0-9-]{8,128}$/.test(input.sid))return noDestination();
 const raw=getProviderCall?await getProviderCall():await exotelRequest(`Calls/${encodeURIComponent(input.sid)}.json`,undefined,3500);const call=raw.Call,c=voiceConfig();
 if(call?.Sid!==input.sid||call.AccountSid!==c.sid||!['queued','ringing','in-progress'].includes(call.Status))return noDestination();
 let from:string;try{from=mobileNumber(call.From);}catch{return noDestination();}
 if(from==='+919876543210')return noDestination();
 const custom=typeof call.CustomField==='string'?call.CustomField:input.customField;
 if(custom){
  const pickup=await client.voiceCall.findUnique({where:{id:custom},include:{caller:true,order:{include:{customer:{include:{user:true}},agent:{include:{user:true}}}}}});
  if(pickup){const o=pickup.order;if((pickup.gatewaySid&&pickup.gatewaySid!==input.sid)||Date.now()-new Date(pickup.createdAt).getTime()>660000||!o.agent||!canCustomerContactAgent(o.status)||mobileNumber(pickup.caller.phone)!==from)return noDestination();
   const isCustomer=pickup.callerUserId===o.customer.userId,isAgent=pickup.callerUserId===o.agent.userId;if(!isCustomer&&!isAgent)return noDestination();
   if(input.fallback || (isCustomer&&['OFFLINE','SUSPENDED','DEACTIVATED'].includes(o.agent.status))){const config=await client.voiceRoutingConfig.findUnique({where:{id:'current'}});const team=config?.supportFallbackUserId?await client.user.findFirst({where:{id:config.supportFallbackUserId,role:{in:['ADMIN','SUPER_ADMIN']},deletionDueAt:null}}):null;if(!team||mobileNumber(team.phone)===from)return noDestination();return destination(mobileNumber(team.phone));}
   await client.voiceCall.updateMany({where:{id:pickup.id,OR:[{gatewaySid:null},{gatewaySid:input.sid}]},data:{gatewaySid:input.sid,status:'in-progress'}});return destination(mobileNumber(isCustomer?o.agent.user.phone:o.customer.user.phone));}
  const support=await client.supportCall.findUnique({where:{id:custom},include:{customer:{include:{user:true}}}});
  if(support){const hash=createHmac('sha256',process.env.JWT_SECRET!.trim()).update('junkitout:support-team:'+from).digest('hex');if(support.teamPhoneHash!==hash||(support.gatewaySid&&support.gatewaySid!==input.sid)||Date.now()-new Date(support.createdAt).getTime()>660000||support.customer.user.deletionDueAt)return noDestination();await client.supportCall.updateMany({where:{id:support.id,OR:[{gatewaySid:null},{gatewaySid:input.sid}]},data:{gatewaySid:input.sid,status:'in-progress'}});return destination(mobileNumber(support.customer.user.phone));}
  return noDestination();
 }
 // A plain incoming call must have reached our actual business virtual number.
 if(digits(call.To)!==digits(c.callerId)||!['incoming','inbound','inbound-dial'].includes(String(call.Direction||'')))return noDestination();
 const variants=[from,from.slice(3),'91'+from.slice(3),'0'+from.slice(3)];
 const orders=await client.order.findMany({where:{status:{in:['BOOKING_RECEIVED','AGENT_BEING_ASSIGNED','AGENT_ASSIGNED','AGENT_ACCEPTED','AGENT_ON_WAY','AGENT_ARRIVED','WASTE_VERIFICATION','WEIGHING']},OR:[{customer:{user:{phone:{in:variants}}}},{agent:{user:{phone:{in:variants}}}}]},include:{customer:{include:{user:true}},agent:{include:{user:true}}},take:3});
 // Never guess between multiple active pickups. A future IVR can disambiguate; today the app call button is the safe fallback.
 if(orders.length!==1)return noDestination();const order=orders[0];
 const customer=mobileNumber(order.customer.user.phone)===from;
 const userId=customer?order.customer.userId:order.agent!.userId;
 await client.voiceCall.upsert({where:{attemptKey:'inbound:'+input.sid},update:{},create:{orderId:order.id,callerUserId:userId,attemptKey:'inbound:'+input.sid,gatewaySid:input.sid,status:'in-progress'}});
 let other=order.agent?mobileNumber(customer?order.agent.user.phone:order.customer.user.phone):'';
 let fallbackRouted=false;
 if(!order.agent||input.fallback||(customer&&['OFFLINE','SUSPENDED','DEACTIVATED'].includes(order.agent.status))){
  const config=await client.voiceRoutingConfig.findUnique({where:{id:'current'}});
  const team=config?.supportFallbackUserId?await client.user.findFirst({where:{id:config.supportFallbackUserId,role:{in:['ADMIN','SUPER_ADMIN']},deletionDueAt:null}}):null;
  if(!team){await client.voiceCall.updateMany({where:{gatewaySid:input.sid},data:{status:'NO_DESTINATION'}});return noDestination();}other=mobileNumber(team.phone);if(other===from)return noDestination();fallbackRouted=true;
 }
 await client.auditLog.create({data:{userId,action:fallbackRouted?'VOICE_FALLBACK_ROUTED':'VOICE_PICKUP_ROUTED',userName:'Voice routing',oldValue:order.id,newValue:input.sid}});
 return destination(other);
}
