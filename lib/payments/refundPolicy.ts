export const SCHEDULED_REFUND_CUTOFF_MS=60*60*1000;
export function scheduledRefundEligible(order:any,now=new Date()){
 return order.pickupType==='SCHEDULED'&&order.scheduledFor&&new Date(order.scheduledFor).getTime()-now.getTime()>SCHEDULED_REFUND_CUTOFF_MS&&['BOOKING_RECEIVED','AGENT_BEING_ASSIGNED','AGENT_ASSIGNED','AGENT_ACCEPTED','AGENT_ON_WAY'].includes(order.status)&&!order.pickupGate?.verifiedAt&&['CAPTURED','SUCCESS'].includes(order.paymentStatus);
}

export async function releaseRefundedPickupAgentTx(tx:any,orderId:string){
 const order=await tx.order.findUnique({where:{id:orderId},select:{agentId:true}});if(!order?.agentId)return;
 await tx.agent.updateMany({where:{id:order.agentId,orders:{none:{id:{not:orderId},status:{in:['AGENT_ASSIGNED','AGENT_ACCEPTED','AGENT_ON_WAY','AGENT_ARRIVED','WASTE_VERIFICATION','WEIGHING','REFUND_REQUESTED']}}}},data:{status:'OFFLINE'}});
}
