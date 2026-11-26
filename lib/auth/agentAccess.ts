import {NextRequest} from 'next/server';
import {db} from '@/lib/db';
import {verifyOtp} from './otp';
import {signToken} from './jwt';
import {validatePhone} from '@/lib/validations/schemas';
import {successResponse,errorResponse} from '@/lib/utils/apiResponse';
import {getClientIp,hasTrustedOrigin} from './requestSecurity';
import {isLocalOtpTestPhone,isValidLocalOtpTestCode} from './localOtpTest';
import {assertPhoneCanLogin} from '@/lib/accountDeletion';
import {AccountDeletionError} from '@/lib/accountDeletionPolicy';
const LEGACY_AGENT_NUMBERS=new Set(['9353276638','7842259582','7479895482']);
export async function handleAgentAuthentication(req:NextRequest,signup=false){
 try{
  if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return errorResponse('FORBIDDEN','This request is not allowed.',403);
  const body=await req.json().catch(()=>({})),phone=validatePhone(body.phone);
  if(!phone.valid)return errorResponse('INVALID_PHONE',phone.error||'Enter a valid mobile number.',400);
  if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code.trim()))return errorResponse('INVALID_OTP','Enter a valid 6-digit code.',400);
  const name=typeof body.name==='string'?body.name.trim():'';
  if(signup&&(name.length<2||name.length>100||/[\u0000-\u001f]/.test(name)||body.consent!==true))return errorResponse('INVALID_SIGNUP','Enter your full name and accept the terms to create an account.',400);
  await assertPhoneCanLogin(phone.normalized);
  if(isLocalOtpTestPhone(phone.normalized)){if(!isValidLocalOtpTestCode(body.code.trim()))return errorResponse('INVALID_OTP','Enter a valid 6-digit code.',400);}
  else{const verification=await verifyOtp(phone.normalized,body.code.trim(),getClientIp(req));if(!verification.valid)return errorResponse('OTP_VERIFICATION_FAILED',verification.status==='rate_limited'?'Too many attempts. Please wait before trying again.':'The code is invalid or expired. Request another code and try again.',verification.status==='rate_limited'?429:400);}
  const digits=phone.normalized.slice(-10),variants=[phone.normalized,digits,`0${digits}`];
  const user=await db.$transaction(async tx=>{
   let existing=await tx.user.findFirst({where:{phone:{in:variants}},include:{agent:true,admin:true,customer:true}});
   if(existing&&(existing.admin||['ADMIN','SUPER_ADMIN'].includes(existing.role)))throw new AgentAccessError('Use your administrator sign-in for this account.',403);
   if(existing?.customer&&!existing.agent)throw new AgentAccessError('This number has a customer account. Use a separate mobile number for your partner account.',403);
   if(existing?.deletionDueAt)throw new AgentAccessError('Recover your account before creating a partner profile.',403);
   if(existing?.agent&&['SUSPENDED','DEACTIVATED'].includes(existing.agent.status))throw new AgentAccessError('This partner account is inactive. Please contact support.',403);
   if(!existing?.agent){
    if(!signup&&!LEGACY_AGENT_NUMBERS.has(digits))throw new AgentAccessError('No partner account is registered with this number. Choose Sign up to create one.',403);
    const agentData={status:'OFFLINE',kycRequired:true,vehicleType:'',vehicleNumber:'',serviceAreas:'all',currentLat:0,currentLng:0};
    if(!existing)existing=await tx.user.create({data:{name:signup?name:'Junk It Out Partner',phone:phone.normalized,role:'AGENT',agent:{create:agentData}},include:{agent:true,admin:true,customer:true}});
    else{await tx.agent.create({data:{userId:existing.id,...agentData}});existing=await tx.user.findUniqueOrThrow({where:{id:existing.id},include:{agent:true,admin:true,customer:true}});}
    await tx.auditLog.create({data:{userId:existing.id,action:signup?'AGENT_SELF_SIGNUP':'AGENT_PROFILE_CREATED',newValue:JSON.stringify({consent:signup,onboardingRequired:true})}});
   }
   return existing;
  });
  if(!user?.agent)throw new Error('Agent profile was not created.');
  const token=signToken({userId:user.id,phone:user.phone,name:user.name,role:'AGENT',customerId:null,agentId:user.agent.id,adminId:null,tokenVersion:user.tokenVersion??1,agentTokenVersion:user.agent.tokenVersion??1});
  const response=successResponse({message:signup?'Your partner account is ready.':'Signed in successfully.',user:{id:user.id,name:user.name,role:'AGENT',agentId:user.agent.id}});
  response.headers.set('Cache-Control','private, no-store');
  response.cookies.set({name:'jio_agent_token',value:token,httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:7*86400});
  return response;
 }catch(error){if(error instanceof AgentAccessError||error instanceof AccountDeletionError)return errorResponse('AGENT_ACCESS_DENIED',error.message,error instanceof AgentAccessError?error.status:403);return errorResponse('AGENT_AUTH_UNAVAILABLE','Could not complete partner sign-in. Please try again.',503);}
}
class AgentAccessError extends Error{constructor(message:string,public status:number){super(message);}}
