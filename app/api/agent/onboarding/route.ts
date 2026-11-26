import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {db} from '@/lib/db';
import {secureIdConfig,SecureIdError} from '@/lib/cashfree/secureId';
import {startFullKyc,refreshFullKyc,verifyFullKycStep,publicFullKyc} from '@/lib/cashfree/fullAgentKyc';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
function fail(error:unknown){return NextResponse.json({success:false,message:error instanceof SecureIdError?error.message:'Verification could not be completed. Please check status before retrying.'},{status:error instanceof SecureIdError?error.status:503,headers});}
export async function GET(req:NextRequest){try{const auth=await getAuthUser(req);if(auth?.role!=='AGENT'||!auth.agentId)throw new SecureIdError('Agent sign-in is required.',401);const row=await db.agentKyc.findUnique({where:{agentId:auth.agentId}});return NextResponse.json({success:true,data:{ready:secureIdConfig().ready,onboarding:publicFullKyc(row)}},{headers});}catch(e){return fail(e);}}
export async function POST(req:NextRequest){try{
 if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')throw new SecureIdError('Request not allowed.',403);
 const auth=await getAuthUser(req);if(auth?.role!=='AGENT'||!auth.agentId)throw new SecureIdError('Agent sign-in is required.',401);
 const body=await req.json(),origin=new URL(process.env.NEXT_PUBLIC_APP_URL||'https://junkitout.in').origin;
 const row=body.action==='start'?await startFullKyc(auth.agentId,body,origin):body.action==='refresh'?await refreshFullKyc(auth.agentId):body.action==='verify'?await verifyFullKycStep(auth.agentId,body):null;
 if(!row)throw new SecureIdError('Choose an onboarding action.',400);
 return NextResponse.json({success:true,data:publicFullKyc(row)},{headers});
}catch(e){return fail(e);}}
