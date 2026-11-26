import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {db} from '@/lib/db';
import {secureIdConfig,SecureIdError} from '@/lib/cashfree/secureId';
import {startOnboarding,refreshOnboarding,publicOnboarding} from '@/lib/cashfree/agentOnboarding';
function fail(e:unknown){return NextResponse.json({success:false,message:e instanceof SecureIdError?e.message:'Identity verification is temporarily unavailable.'},{status:e instanceof SecureIdError?e.status:503});}
export async function GET(req:NextRequest){try{
 const auth=await getAuthUser(req);if(auth?.role!=='AGENT'||!auth.agentId)throw new SecureIdError('Agent sign-in is required.',401);
 const row=await db.agentKyc.findUnique({where:{agentId:auth.agentId}});const c=secureIdConfig();
 return NextResponse.json({success:true,data:{ready:c.ready,template:c.template,onboarding:publicOnboarding(row)}},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
export async function POST(req:NextRequest){try{
 if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')throw new SecureIdError('Request not allowed.',403);
 const auth=await getAuthUser(req);if(auth?.role!=='AGENT'||!auth.agentId)throw new SecureIdError('Agent sign-in is required.',401);
 const body=await req.json();
 const row=body.action==='refresh'?await refreshOnboarding(auth.agentId):body.action==='start'?await startOnboarding(auth.agentId,body.consent):null;
 if(!['refresh','start'].includes(body.action))throw new SecureIdError('Invalid verification action.',400);
 return NextResponse.json({success:true,data:publicOnboarding(row)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
