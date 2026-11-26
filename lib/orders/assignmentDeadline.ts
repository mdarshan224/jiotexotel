export const ASSIGNMENT_WINDOW_MS=30*60*1000;
export const OPEN_ASSIGNMENT_STATUSES=['BOOKING_RECEIVED','AGENT_BEING_ASSIGNED'];
export function assignmentDeadline(pickupType:string,scheduledFor:unknown,now=new Date()){
 if(pickupType==='SCHEDULED'){
  if(typeof scheduledFor!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(scheduledFor))throw new Error('Select a valid scheduled pickup time.');
  const start=new Date(scheduledFor);if(!Number.isFinite(start.getTime())||start.getTime()<now.getTime()||start.getTime()>now.getTime()+7*86400000)throw new Error('Scheduled pickup time must be in the next seven days.');
  return {scheduledFor:start,assignmentDeadlineAt:new Date(start.getTime()+ASSIGNMENT_WINDOW_MS),timeoutPolicyVersion:1};
 }
 return {scheduledFor:null,assignmentDeadlineAt:new Date(now.getTime()+ASSIGNMENT_WINDOW_MS),timeoutPolicyVersion:1};
}
export function assignmentExpired(order:any,now=new Date()){
 return order.timeoutPolicyVersion===1&&!order.agentId&&OPEN_ASSIGNMENT_STATUSES.includes(order.status)&&order.assignmentDeadlineAt&&new Date(order.assignmentDeadlineAt).getTime()<=now.getTime();
}
/** Used in the same transaction as acceptance/assignment, so a delayed job cannot extend the deadline. */
export function assignmentStillOpenWhere(now=new Date()){
 return {OR:[{timeoutPolicyVersion:0},{assignmentDeadlineAt:null},{assignmentDeadlineAt:{gt:now}},{agentId:{not:null}}]};
}
export async function expireAssignmentTx(tx:any,id:string,now=new Date()){
 const order=await tx.order.findUnique({where:{id}});if(!order||!assignmentExpired(order,now))return false;
 const claim=await tx.order.updateMany({where:{id,agentId:null,status:{in:OPEN_ASSIGNMENT_STATUSES},timeoutPolicyVersion:1,assignmentDeadlineAt:{lte:now}},data:{status:'CANCELLED',assignmentTimedOutAt:now}});
 if(claim.count!==1)return false;
 if(order.subscriptionId)await tx.customerSubscription.updateMany({where:{id:order.subscriptionId,pickupsUsed:{gt:0}},data:{pickupsUsed:{decrement:1}}});
 await tx.orderStatusHistory.create({data:{orderId:id,oldStatus:order.status,newStatus:'CANCELLED',notes:'No pickup agent assigned within 30 minutes. Automatic wallet refund requested.'}});
 return true;
}
