import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
export class PickupOtpError extends Error {constructor(message:string,public status=409){super(message);}}
const OTP_STATUSES=['AGENT_ARRIVED','WASTE_VERIFICATION','WEIGHING'];
export function pickupCode(orderId:string,nonce:string,agentId:string){
 const secret=process.env.JWT_SECRET?.trim();if(!secret || secret.length<32)throw new PickupOtpError('Pickup verification is temporarily unavailable.',503);
 const hex=createHmac('sha256',secret).update('junkitout:pickup-start:v1:'+orderId+':'+nonce+':'+agentId).digest('hex');
 return (100000+(parseInt(hex.slice(0,12),16)%900000)).toString();
}
export async function initializePickupGate(tx:any,orderId:string){
 return tx.pickupGate.upsert({where:{orderId},update:{},create:{orderId,nonce:randomBytes(32).toString('hex'),arrivedAt:new Date()}});
}
export async function requirePickupVerified(tx:any,orderId:string,agentId:string|null){
 const gate=await tx.pickupGate.findUnique({where:{orderId}});
 if(!agentId || !gate?.verifiedAt || gate.verifiedAgentId!==agentId)throw new PickupOtpError('Enter the customer’s pickup OTP after arrival before starting weighing or completion.');
}
export async function customerPickupOtp(tx:any,orderId:string,customerId:string){
 const order=await tx.order.findUnique({where:{id:orderId},select:{customerId:true,status:true,agentId:true,pickupGate:true}});
 if(!order || order.customerId!==customerId)throw new PickupOtpError('Pickup not found.',404);
 const gate=order.pickupGate;
 if(!OTP_STATUSES.includes(order.status)||!order.agentId||!gate)return {available:false,verified:false,code:null};
 if(gate.verifiedAt && gate.verifiedAgentId===order.agentId)return {available:false,verified:true,code:null};
 return {available:true,verified:false,code:pickupCode(orderId,gate.nonce,order.agentId)};
}
export async function verifyPickupOtp(db:any,orderId:string,agentId:string,code:unknown){
 if(typeof code!=='string'||!/^\d{6}$/.test(code))throw new PickupOtpError('Enter the six-digit pickup OTP shown on the customer’s tracking page.',400);
 const outcome=await db.$transaction(async(tx:any)=>{
  const order=await tx.order.findUnique({where:{id:orderId},select:{agentId:true,status:true,pickupGate:true}});
  if(!order||order.agentId!==agentId)return {error:'This pickup is not assigned to you.',status:403};
  if(!OTP_STATUSES.includes(order.status))return {error:'Mark arrival at the customer’s location before entering the pickup OTP.',status:409};
  const gate=order.pickupGate;
  if(!gate)return {error:'Pickup arrival has not been confirmed. Refresh the pickup.',status:409};
  if(gate.verifiedAt && gate.verifiedAgentId===agentId)return {verified:true};
  const now=new Date();if(gate.lockedUntil && gate.lockedUntil>now)return {error:'Too many incorrect attempts. Wait five minutes before trying again.',status:429};
  const expected=pickupCode(orderId,gate.nonce,order.agentId);
  if(!timingSafeEqual(Buffer.from(code),Buffer.from(expected))){
   const failed=(gate.lockedUntil && gate.lockedUntil<=now)?1:gate.failedAttempts+1;
   await tx.pickupGate.update({where:{orderId},data:{failedAttempts:failed,lockedUntil:failed>=5?new Date(now.getTime()+5*60000):null}});
   return {error:failed>=5?'Too many incorrect attempts. Wait five minutes before trying again.':'Incorrect pickup OTP. Ask the customer to check the tracking page.',status:failed>=5?429:400};
  }
  await tx.pickupGate.update({where:{orderId},data:{verifiedAt:now,verifiedAgentId:agentId,failedAttempts:0,lockedUntil:null}});
  await tx.order.update({where:{id:orderId},data:{status:'WASTE_VERIFICATION'}});
  await tx.orderStatusHistory.create({data:{orderId,oldStatus:order.status,newStatus:'WASTE_VERIFICATION',notes:'Customer pickup OTP verified at doorstep.'}});
  return {verified:true};
 });
 if(outcome.error)throw new PickupOtpError(outcome.error,outcome.status);
 return {verified:true};
}
