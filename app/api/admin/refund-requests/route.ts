import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getAuthUser,isAdminRole} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {processApprovedRefund} from '@/lib/payments/refundRequests';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
export async function GET(req:NextRequest){
 const auth=await getAuthUser(req);if(!isAdminRole(auth))return NextResponse.json({success:false},{status:403,headers});
 const rows=await db.refundRequest.findMany({orderBy:{requestedAt:'desc'},take:100,include:{order:{select:{orderNumber:true,status:true,scheduledFor:true}},requestedBy:{select:{name:true}}}});
 return NextResponse.json({success:true,data:rows.map(r=>({id:r.id,orderNumber:r.order.orderNumber,customerName:r.requestedBy.name,scheduledFor:r.order.scheduledFor,requestedAt:r.requestedAt,status:r.status,amount:r.amount,destination:r.destination,reason:r.reviewReason,failureReason:r.failureReason}))},{headers});
}
export async function POST(req:NextRequest){
 if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({success:false},{status:403,headers});
 const auth=await getAuthUser(req);if(!isAdminRole(auth))return NextResponse.json({success:false},{status:403,headers});
 try{const body=await req.json();if(typeof body.id!=='string'||!['approve','reject','retry'].includes(body.action)||typeof body.reason!=='string'||body.reason.trim().length<5)return NextResponse.json({success:false,message:'Select a request, an action and add a review note.'},{status:400,headers});
 const row=await processApprovedRefund(body.id,auth!.userId,body.action,body.reason);return NextResponse.json({success:true,data:{status:row?.status}},{headers});
 }catch(error){return NextResponse.json({success:false,message:error instanceof Error?error.message:'Refund review could not be completed.'},{status:409,headers});}
}
