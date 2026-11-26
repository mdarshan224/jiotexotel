import {NextRequest} from 'next/server';
import {db} from '@/lib/db';
import {getAuthUser} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {successResponse,errorResponse} from '@/lib/utils/apiResponse';
import {AgentLocationError,parseAgentFix,ONLINE_AGENT_STATUSES} from '@/lib/agents/locationPolicy';
import {verifyBengaluruLocality} from '@/lib/agents/verifyCity';
import {saveAgentPresenceTx,stopAgentPresence} from '@/lib/agents/presence';
import {broadcaster} from '@/lib/realtime';
import {reconcileUndispatchedPaidOrders} from '@/lib/payments/dispatchRecovery';
import {runBackgroundTask} from '@/lib/utils/backgroundTask';
export async function POST(req:NextRequest){
 let agentId:string|undefined;
 try{
  const auth=await getAuthUser(req);
  if(!auth||auth.role!=='AGENT'||!auth.userId)return errorResponse('UNAUTHORIZED','Agent authentication required.',401);
  if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return errorResponse('FORBIDDEN','Request not allowed.',403);
  agentId=auth.agentId||(await db.agent.findUnique({where:{userId:auth.userId},select:{id:true}}))?.id;
  if(!agentId)return errorResponse('UNAUTHORIZED','Agent profile required.',401);
  const body=await req.json().catch(()=>({}));
  const fix=parseAgentFix(body);
  const agent=await db.agent.findUnique({where:{id:agentId}});
  if(!agent||!ONLINE_AGENT_STATUSES.includes(agent.status))throw new AgentLocationError('AGENT_OFFLINE','Go online with a fresh device location first.');
  const proof=await verifyBengaluruLocality(agent,fix);
  const result=await db.$transaction(tx=>saveAgentPresenceTx(tx,agentId!,fix,proof,undefined,body.orderId?String(body.orderId):undefined,auth.tokenVersion??1,auth.agentTokenVersion??auth.tokenVersion??1));
  if(result.orderId)broadcaster.broadcast('AGENT_LOCATION_UPDATED',{
   agentId,orderId:result.orderId,agentName:result.agent.user.name,vehicleNumber:result.agent.vehicleNumber,
   status:result.agent.status,lat:fix.lat,lng:fix.lng,timestamp:result.location.timestamp,
  });
  else runBackgroundTask(async()=>{await reconcileUndispatchedPaidOrders({limit:10});},'AgentPresenceDispatch');
  return successResponse({id:result.location.id,agentId,orderId:result.orderId,status:result.agent.status,timestamp:result.location.timestamp});
 }catch(error:any){
  if(error instanceof AgentLocationError){if(agentId)await stopAgentPresence(db,agentId);return errorResponse(error.code,error.message,error.status);}
  if(error?.code==='P2034')return errorResponse('AGENT_STATE_CONFLICT','Assignment changed. Retry with a fresh location.',409);
  return errorResponse('LOCATION_UNAVAILABLE','Could not save location. Please retry.',503);
 }
}
