export type AgentSessionUser={id:string;name?:string;phone?:string;role:string;agent?:{id:string;onboardingApproved?:boolean;status?:string}};
export type AgentSessionState={status:'checking'|'guest'|'onboarding'|'approved'|'error';user:AgentSessionUser|null};
export function classifyAgentSession(result:any):AgentSessionState{
 const user=result?.success===true&&result?.data?.user;
 if(!user||user.role!=='AGENT'||!user.agent?.id)return{status:'guest',user:null};
 if(['SUSPENDED','DEACTIVATED'].includes(user.agent.status))return{status:'guest',user:null};
 return{status:user.agent.onboardingApproved===true?'approved':'onboarding',user};
}
export function agentPageAccess(state:AgentSessionState,path:string){
 if(state.status==='checking'||state.status==='error'||state.status==='guest')return state.status;
 if(state.status==='onboarding'&&path!=='/agent/onboarding')return 'redirect';
 return 'content';
}
