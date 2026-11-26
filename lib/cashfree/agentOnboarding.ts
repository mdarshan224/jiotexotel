import {db} from '@/lib/db';
import {secureIdConfig,secureIdRequest,secureIdLink,SecureIdError,verificationSummary,verifiedKyc} from './secureId';
export const consentVersion='agent-identity-v1';
export function publicOnboarding(row:any){return row?{id:row.id,providerStatus:row.providerStatus,reviewStatus:row.reviewStatus,formLink:row.formLink&&row.expiresAt.getTime()>Date.now()?secureIdLink(row.formLink):null,expiresAt:row.expiresAt,consentAt:row.consentAt,checks:JSON.parse(row.checksJson),reviewedAt:row.reviewedAt}:null;}
export async function refreshOnboarding(agentId:string){
 const row=await db.agentKyc.findUnique({where:{agentId}});if(!row)return null;
 if(Date.now()-row.updatedAt.getTime()<10000)return row;
 const data=await secureIdRequest('form?verificationID='+encodeURIComponent(row.verificationId));
 const summary=verificationSummary(data,row.verificationId);
 const link=secureIdLink(data.form_link);
 await db.agentKyc.updateMany({where:{id:row.id,updatedAt:row.updatedAt},data:{...summary,...(link?{formLink:link}:{})}});
 return db.agentKyc.findUnique({where:{agentId}});
}
export async function startOnboarding(agentId:string,consent:boolean){
 if(consent!==true)throw new SecureIdError('Please give consent before starting identity verification.',400);
 const c=secureIdConfig();if(!c.ready)throw new SecureIdError('Identity verification setup is pending. Please contact dispatch.');
 const claim=await db.$transaction(async tx=>{
  const agent=await tx.agent.findUnique({where:{id:agentId},include:{user:{select:{phone:true,name:true,email:true}}}});if(!agent)throw new SecureIdError('Agent profile not found.',404);
  const existing=await tx.agentKyc.findUnique({where:{agentId}});
  if(existing && (existing.reviewStatus === 'APPROVED' || existing.expiresAt.getTime() > Date.now()))return {row:existing,agent,replay:true};
  const now=new Date();
  const data={verificationId:'JIO'+crypto.randomUUID().replaceAll('-',''),templateName:c.template,consentAt:now,expiresAt:new Date(now.getTime()+7*86400000),providerStatus:'CREATING',reviewStatus:'PENDING',formLink:null,checksJson:'[]',reviewedBy:null,reviewedAt:null};
  const row=existing?await tx.agentKyc.update({where:{id:existing.id},data}):await tx.agentKyc.create({data:{agentId,...data}});
  await tx.auditLog.create({data:{userId:agent.userId,action:'AGENT_KYC_CONSENT',newValue:consentVersion}});
  return {row,agent,replay:false};
 });
 if(claim.replay)return claim.row;
 try{
  const data=await secureIdRequest('form',{phone:claim.agent.user.phone,template_name:claim.row.templateName,verification_id:claim.row.verificationId,name:claim.agent.user.name,...(claim.agent.user.email?{email:claim.agent.user.email}:{}),link_expiry:claim.row.expiresAt.toISOString().slice(0,10),notification_types:[]});
  const summary=verificationSummary(data,claim.row.verificationId);const link=secureIdLink(data.form_link);
  if(!link)throw new SecureIdError('Verification link could not be confirmed. Check status before retrying.');
  return await db.agentKyc.update({where:{id:claim.row.id},data:{...summary,formLink:link}});
 }catch(error){await db.agentKyc.update({where:{id:claim.row.id},data:{providerStatus:'UNKNOWN'}});throw error;}
}
export async function agentOnboardingApproved(client:any,agentId:string){
 const agent=await client.agent.findUnique({where:{id:agentId},select:{kycRequired:true}});
 if(!agent)return false;
 if(!agent.kycRequired)return true;
 const row=await client.agentKyc.findUnique({where:{agentId}});
 return row?.reviewStatus==='APPROVED'&&verifiedKyc(row);
}
