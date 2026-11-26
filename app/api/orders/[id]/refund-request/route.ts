import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getAuthUser} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {scheduledRefundEligible} from '@/lib/payments/refundPolicy';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await getAuthUser(req);if(auth?.role!=='CUSTOMER'||!auth.customerId)return NextResponse.json({success:false},{status:401,headers});
 const{id}=await params;const order=await db.order.findUnique({where:{id},include:{refundRequest:true,pickupGate:true}});if(!order||order.customerId!==auth.customerId)return NextResponse.json({success:false},{status:404,headers});
 const r=order.refundRequest;return NextResponse.json({success:true,data:{eligible:scheduledRefundEligible(order),scheduledFor:order.scheduledFor,request:r?{status:r.status,amount:r.amount,destination:r.destination,requestedAt:r.requestedAt}:null}},{headers});
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({success:false},{status:403,headers});
 const auth=await getAuthUser(req);if(auth?.role!=='CUSTOMER'||!auth.customerId)return NextResponse.json({success:false},{status:401,headers});const{id}=await params;
 const result=await db.$transaction(async tx=>{
  const order=await tx.order.findUnique({where:{id},include:{refundRequest:true,pickupGate:true}});if(!order||order.customerId!==auth.customerId)throw new Error('Pickup not found.');
  if(order.refundRequest)return order.refundRequest;
  if(!scheduledRefundEligible(order))throw new Error('Scheduled pickup refunds can be requested more than one hour before pickup, before service starts.');
  const payment=await tx.payment.findFirst({where:{orderId:id,purpose:'BOOKING',direction:'CUSTOMER_PAYS',status:'CAPTURED'},orderBy:{createdAt:'asc'}});if(!payment)throw new Error('A captured booking payment is required.');
  const pending=await tx.refundAttempt.count({where:{paymentId:payment.id,status:{notIn:['REFUND_FAILED','REJECTED']}}});if(pending)throw new Error('A refund already owns this payment.');
  const created=await tx.refundRequest.create({data:{orderId:id,paymentId:payment.id,requestedByUserId:auth.userId,amount:payment.amount,status:'PENDING_ADMIN_REVIEW',destination:payment.gateway==='RAZORPAY'?'SOURCE':'WALLET'}});
  await tx.order.update({where:{id},data:{status:'REFUND_REQUESTED'}});
  await tx.orderStatusHistory.create({data:{orderId:id,oldStatus:order.status,newStatus:'REFUND_REQUESTED',changedByUserId:auth.userId,notes:'Eligible scheduled refund requested; dispatch paused for review.'}});
  await tx.auditLog.create({data:{userId:auth.userId,action:'SCHEDULED_REFUND_REQUESTED',newValue:created.id}});
  return created;
 });return NextResponse.json({success:true,data:{status:result.status,amount:result.amount,destination:result.destination,requestedAt:result.requestedAt}},{headers});
}catch(error){return NextResponse.json({success:false,message:error instanceof Error?error.message:'Refund request could not be submitted.'},{status:409,headers});}}
