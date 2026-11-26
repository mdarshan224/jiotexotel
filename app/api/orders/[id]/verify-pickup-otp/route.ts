import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {db} from '@/lib/db';
import {verifyPickupOtp,PickupOtpError} from '@/lib/orders/pickupOtp';
import {broadcaster} from '@/lib/realtime';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({success:false,message:'Request not allowed.'},{status:403});
 const auth=await getAuthUser(req);if(auth?.role!=='AGENT'||!auth.agentId)return NextResponse.json({success:false,message:'Agent sign-in is required.'},{status:401});
 const {id}=await params;const body=await req.json().catch(()=>({}));const data=await verifyPickupOtp(db,id,auth.agentId,body.code);
 broadcaster.broadcast('ORDER_UPDATED',{id,agentId:auth.agentId,status:'WASTE_VERIFICATION'});
 return NextResponse.json({success:true,data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return NextResponse.json({success:false,message:e instanceof PickupOtpError?e.message:'Could not verify pickup. Refresh and try again.'},{status:e instanceof PickupOtpError?e.status:503});}}
