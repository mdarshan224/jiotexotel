import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser,isAdminRole} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {db} from '@/lib/db';
import {secureIdConfig,SecureIdError,verifiedKyc} from '@/lib/cashfree/secureId';
import {refreshOnboarding,publicOnboarding} from '@/lib/cashfree/agentOnboarding';
function fail(e:unknown){return NextResponse.json({success:false,message:e instanceof SecureIdError?e.message:'Could not update agent verification.'},{status:e instanceof SecureIdError?e.status:503});}
export async function GET(req:NextRequest){try{
 const auth=await getAuthUser(req);if(!isAdminRole(auth))throw new SecureIdError('Admin access required.',403);
 const rows=await db.agent.findMany({include:{user:{select:{name:true,phone:true}},kyc:true},orderBy:{createdAt:'desc'},take:100});const c=secureIdConfig();
 return NextResponse.json({success:true,data:rows.map(r=>({agentId:r.id,name:r.user.name,phone:r.user.phone,required:r.kycRequired,onboarding:publicOnboarding(r.kyc)})),configuration:{ready:c.ready,credentialsConfigured:!!c.clientId&&!!c.clientSecret,publicKeyConfigured:!!c.publicKey,mode:c.mode,template:c.template}},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
export async function POST(req:NextRequest){try{
 if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')throw new SecureIdError('Request not allowed.',403);
 const auth=await getAuthUser(req);if(!isAdminRole(auth))throw new SecureIdError('Admin access required.',403);
 const body=await req.json();if(typeof body.agentId!=='string'||!['refresh','approve','reject'].includes(body.action))throw new SecureIdError('Select an agent and a review action.',400);
 const row=body.action==='reject'?await db.agentKyc.findUnique({where:{agentId:body.agentId}}):await refreshOnboarding(body.agentId);
 if(!row)throw new SecureIdError('The agent must complete verification first.',409);
 if(body.action==='refresh')return NextResponse.json({success:true,data:publicOnboarding(row)});
 if(body.action==='approve'&&!verifiedKyc(row))throw new SecureIdError('Approval requires completed, successful provider verification.',409);
 const changed=await db.$transaction(async tx=>{
  const updated=await tx.agentKyc.updateMany({where:{id:row.id,updatedAt:row.updatedAt},data:{reviewStatus:body.action==='approve'?'APPROVED':'REJECTED',reviewedBy:auth!.userId,reviewedAt:new Date()}});
  if(updated.count!==1)throw new SecureIdError('Verification changed. Refresh and review again.',409);
  await tx.auditLog.create({data:{userId:auth!.userId,action:body.action==='approve'?'AGENT_KYC_APPROVED':'AGENT_KYC_REJECTED',newValue:row.id}});
  return tx.agentKyc.findUnique({where:{id:row.id}});
 });return NextResponse.json({success:true,data:publicOnboarding(changed)});
}catch(e){return fail(e);}}
