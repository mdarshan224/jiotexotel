import {NextRequest} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {verifyToken} from '@/lib/auth/jwt';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {db} from '@/lib/db';
import {stopAgentPresence} from '@/lib/agents/presence';
import {successResponse,errorResponse} from '@/lib/utils/apiResponse';
export async function POST(req:NextRequest){
 if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return errorResponse('FORBIDDEN','This request is not allowed.',403);
 try{const auth=await getAuthUser(req);if(auth?.role==='AGENT'&&auth.agentId){await db.$transaction(async tx=>{await stopAgentPresence(tx,auth.agentId!);await tx.agent.update({where:{id:auth.agentId!},data:{tokenVersion:{increment:1}}});});}
 const response=successResponse({message:'Signed out of the partner portal.'});response.headers.set('Cache-Control','private, no-store');
 response.cookies.set({name:'jio_agent_token',value:'',httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:0,expires:new Date(0)});
 const legacy=req.cookies.get('jio_token')?.value;if(legacy&&verifyToken(legacy)?.role==='AGENT')response.cookies.set({name:'jio_token',value:'',httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:0,expires:new Date(0)});
 return response;
 }catch{return errorResponse('LOGOUT_UNAVAILABLE','Could not sign out. Please try again.',503);}
}
