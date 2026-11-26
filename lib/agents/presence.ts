import {ACTIVE_PICKUP_STATUSES,ONLINE_AGENT_STATUSES,AgentFix,AgentLocationError,assertPlausibleMovement,hasFreshAgentPresence} from './locationPolicy';
export async function stopAgentPresence(client:any,agentId:string){
 await client.agent.updateMany({where:{id:agentId,status:{in:ONLINE_AGENT_STATUSES}},data:{status:'OFFLINE',locationReceivedAt:null}});
}
/** Persist permission-dependent presence in the same transaction as the availability change. */
export async function saveAgentPresenceTx(tx:any,agentId:string,fix:AgentFix,proof:any,targetStatus?:string,orderId?:string,tokenVersion?:number,agentTokenVersion?:number){
 const agent=await tx.agent.findUnique({where:{id:agentId}});
 if(!agent||['SUSPENDED','DEACTIVATED'].includes(agent.status))throw new AgentLocationError('AGENT_INACTIVE','Your account is inactive. Contact support.',403);
 if(tokenVersion!==undefined){
  const owner=await tx.user.findUnique({where:{id:agent.userId},select:{tokenVersion:true}});
  if(agent.tokenVersion!==(agentTokenVersion??tokenVersion)||owner?.tokenVersion!==tokenVersion)throw new AgentLocationError('UNAUTHORIZED','Your session has ended. Sign in again.',401);
 }
 if(!targetStatus&&!ONLINE_AGENT_STATUSES.includes(agent.status))throw new AgentLocationError('AGENT_OFFLINE','Go online with a fresh GPS reading first.');
 assertPlausibleMovement(agent,fix);
 const combined={...agent,...proof,currentLat:fix.lat,currentLng:fix.lng,locationAccuracy:fix.accuracy,locationCapturedAt:new Date(fix.capturedAt),locationReceivedAt:new Date()};
 if(!hasFreshAgentPresence(combined))throw new AgentLocationError('LOCATION_REQUIRED','Fresh, verified Bengaluru GPS is required.');
 const order=await tx.order.findFirst({where:{agentId,status:{in:ACTIVE_PICKUP_STATUSES},...(orderId?{id:orderId}:{})},select:{id:true}});
 if(orderId&&!order)throw new AgentLocationError('ACTIVE_ORDER_NOT_FOUND','This pickup is not currently assigned to you.',403);
 const status=targetStatus?(order?'ASSIGNED':'AVAILABLE'):agent.status;
 const updated=await tx.agent.update({where:{id:agentId},data:{currentLat:fix.lat,currentLng:fix.lng,locationAccuracy:fix.accuracy,locationCapturedAt:new Date(fix.capturedAt),locationReceivedAt:new Date(),...proof,status},include:{user:{select:{name:true}},}});
 // Keep one idle point; pickup-specific history remains available for customer tracking.
 const idle=!order?await tx.agentLocation.findFirst({where:{agentId,orderId:null},select:{id:true}}):null;
 const data={agentId,orderId:order?.id||null,lat:fix.lat,lng:fix.lng,timestamp:new Date()};
 const location=idle?await tx.agentLocation.update({where:{id:idle.id},data}):await tx.agentLocation.create({data});
 return {agent:updated,orderId:order?.id||null,location};
}
