import {NextRequest} from 'next/server';
import {db} from '@/lib/db';
import {getAuthUser} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {successResponse,errorResponse} from '@/lib/utils/apiResponse';
import {agentOnboardingApproved} from '@/lib/cashfree/agentOnboarding';
import {AgentLocationError,parseAgentFix} from '@/lib/agents/locationPolicy';
import {verifyBengaluruLocality} from '@/lib/agents/verifyCity';
import {saveAgentPresenceTx,stopAgentPresence} from '@/lib/agents/presence';
import {reconcileUndispatchedPaidOrders} from '@/lib/payments/dispatchRecovery';
import {runBackgroundTask} from '@/lib/utils/backgroundTask';
import {invalidateAdminOperationsCaches} from '@/lib/cache/adminAgentsCache';
export async function PATCH(req:NextRequest){
 let agentId:string|undefined;
 try{
  const auth=await getAuthUser(req);
  if(!auth)return errorResponse('UNAUTHORIZED','Authentication required.',401);
  if(auth.role!=='AGENT'||!auth.agentId)return errorResponse('FORBIDDEN','Agent access required.',403);
  if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return errorResponse('FORBIDDEN','Request not allowed.',403);
  agentId=auth.agentId;
  const body=await req.json().catch(()=>({}));
  const status=typeof body.status==='string'?body.status.toUpperCase():'';
  if(!['OFFLINE','AVAILABLE','ASSIGNED'].includes(status))return errorResponse('INVALID_STATUS','Choose AVAILABLE, ASSIGNED or OFFLINE.',400);
  let result:any;
  if(status==='OFFLINE'){
   await stopAgentPresence(db,agentId);
   result=await db.agent.findUnique({where:{id:agentId}});
  }else{
   const fix=parseAgentFix(body);
   const agent=await db.agent.findUnique({where:{id:agentId}});
   if(!agent||['SUSPENDED','DEACTIVATED'].includes(agent.status))throw new AgentLocationError('AGENT_INACTIVE','Contact support to reactivate your account.',403);
   if(!await agentOnboardingApproved(db,agentId))throw new AgentLocationError('AGENT_KYC_REQUIRED','Complete identity verification and admin review before going online.');
   const proof=await verifyBengaluruLocality(agent,fix);
   result=await db.$transaction(async tx=>{
    if(!await agentOnboardingApproved(tx,agentId!))throw new AgentLocationError('AGENT_KYC_REQUIRED','Identity approval is required.');
    return (await saveAgentPresenceTx(tx,agentId!,fix,proof,status,undefined,auth.tokenVersion??1)).agent;
   });
   if(result.status==='AVAILABLE')runBackgroundTask(async()=>{await reconcileUndispatchedPaidOrders({limit:10});},'AgentOnlineDispatch');
  }
  invalidateAdminOperationsCaches();
  return successResponse({agentId,status:result?.status||'OFFLINE',updatedAt:new Date().toISOString()});
 }catch(error:any){
  if(error instanceof AgentLocationError){if(agentId)await stopAgentPresence(db,agentId);return errorResponse(error.code,error.message,error.status);}
  if(error?.code==='P2034')return errorResponse('AGENT_STATE_CONFLICT','Availability changed. Refresh and try again.',409);
  return errorResponse('INTERNAL_SERVER_ERROR','Could not update availability. Please retry.',500);
 }
}
