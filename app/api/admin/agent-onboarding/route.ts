import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser,isAdminRole} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {db} from '@/lib/db';
import {secureIdConfig,SecureIdError} from '@/lib/cashfree/secureId';
import {refreshFullKyc,publicFullKyc,reviewFullKyc} from '@/lib/cashfree/fullAgentKyc';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
function fail(error:unknown){return NextResponse.json({success:false,message:error instanceof SecureIdError?error.message:'Could not update agent verification.'},{status:error instanceof SecureIdError?error.status:503,headers});}
export async function GET(req:NextRequest){try{const auth=await getAuthUser(req);if(!isAdminRole(auth))throw new SecureIdError('Admin access required.',403);const rows=await db.agent.findMany({include:{user:{select:{name:true,phone:true}},kyc:true},orderBy:{createdAt:'desc'},take:100});const c=secureIdConfig();return NextResponse.json({success:true,data:rows.map(row=>({agentId:row.id,name:row.user.name,phone:row.user.phone,required:true,onboarding:publicFullKyc(row.kyc,true)})),configuration:{ready:c.ready,credentialsConfigured:!!c.clientId&&!!c.clientSecret,publicKeyConfigured:!!c.publicKey,mode:c.mode}},{headers});}catch(e){return fail(e);}}
export async function POST(req:NextRequest){try{
 if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')throw new SecureIdError('Request not allowed.',403);
 const auth=await getAuthUser(req);if(!isAdminRole(auth))throw new SecureIdError('Admin access required.',403);
 const body=await req.json();if(typeof body.agentId!=='string')throw new SecureIdError('Select an agent.',400);
 const row=body.action==='refresh'?await refreshFullKyc(body.agentId):await reviewFullKyc(body.agentId,auth!.userId,body.action,body);
 return NextResponse.json({success:true,data:publicFullKyc(row,true)},{headers});
}catch(e){return fail(e);}}
