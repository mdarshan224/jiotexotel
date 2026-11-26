import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import {expireAssignmentTx} from '@/lib/orders/assignmentDeadline';
import {refundWalletOrderPayment} from '@/lib/wallet';
import {refundAttemptId,refundIdempotencyKey,isRefundResultForRequest,calculateRefundTotals} from './refundWorkflow';
import {refundRazorpayPayment,fetchRazorpayPaymentRefunds,RazorpayRefundError} from './razorpay';

/** Durable intent is committed with cancellation/capture. No gateway calls inside transactions. */
export async function queueCancelledPaymentRefundTx(tx:any,payment:any){
 const order=await tx.order.findUnique({where:{id:payment.orderId}});
 if(!order||order.status!=='CANCELLED'||payment.direction!=='CUSTOMER_PAYS'||payment.status!=='CAPTURED'||!payment.paymentId)return;
 const id=refundAttemptId(payment.id);
 const existing=await tx.refundAttempt.findMany({where:{paymentId:payment.id}});
 if(existing.length)return; // An existing admin/provider attempt owns this payment, including uncertain outcomes.
 if(payment.gateway==='WALLET'&&payment.paymentId===`wallet:${order.id}`){
  await refundWalletOrderPayment(tx,{customerId:order.customerId,orderId:order.id,amount:payment.amount});
  await tx.refundAttempt.create({data:{id,orderId:order.id,paymentId:payment.id,amount:payment.amount,status:'REFUNDED'}});
  await tx.payment.update({where:{id:payment.id},data:{status:'REFUNDED'}});
  await tx.order.update({where:{id:order.id},data:{paymentStatus:'REFUNDED'}});return;
 }
 if(payment.gateway!=='RAZORPAY'||!payment.paymentId.startsWith('pay_'))throw new Error('Unsupported payment gateway for automatic refund.');
 await tx.refundAttempt.create({data:{id,orderId:order.id,paymentId:payment.id,amount:payment.amount,status:'QUEUED'}});
 await tx.payment.update({where:{id:payment.id},data:{status:'REFUND_PROCESSING'}});
 await tx.order.update({where:{id:order.id},data:{paymentStatus:'REFUND_PROCESSING'}});
 await tx.refundAttemptEvent.create({data:{id:`${id}_queued`,refundAttemptId:id,eventType:'AUTOMATIC_REFUND_QUEUED',status:'QUEUED',details:{reason:order.assignmentTimedOutAt?'ASSIGNMENT_TIMEOUT':'LATE_CAPTURE_AFTER_CANCELLATION'}}});
}
export async function protectCapturedOrderTx(tx:any,orderId:string){
 await expireAssignmentTx(tx,orderId);
 const order=await tx.order.findUnique({where:{id:orderId}});
 if(order?.status==='CANCELLED'){
  const payments=await tx.payment.findMany({where:{orderId,direction:'CUSTOMER_PAYS',status:'CAPTURED'}});
  for(const payment of payments)await queueCancelledPaymentRefundTx(tx,payment);
  return true;
 }
 return false;
}
async function persist(attempt:any,status:string,refund?:any,reason?:string){
 await db.$transaction(async tx=>{
  const current=await tx.refundAttempt.findUnique({where:{id:attempt.id}});if(!current||current.status==='REFUNDED')return;
  await tx.refundAttempt.update({where:{id:attempt.id},data:{status,razorpayRefundId:refund?.id||current.razorpayRefundId,failureReason:reason||null}});
  const payment=await tx.payment.findUniqueOrThrow({where:{id:attempt.paymentId}});
  const all=await tx.refundAttempt.findMany({where:{paymentId:payment.id}});
  const totals=calculateRefundTotals(payment.amount,all);
  const target=totals.settledPaise>=totals.totalPaise?'REFUNDED':status==='REFUNDED'?'PARTIALLY_REFUNDED':status;
  await tx.payment.updateMany({where:{id:payment.id,status:{not:'REFUNDED'}},data:{status:target}});
  await tx.order.updateMany({where:{id:attempt.orderId,paymentStatus:{not:'REFUNDED'}},data:{paymentStatus:target}});
  await tx.refundAttemptEvent.create({data:{id:randomUUID(),refundAttemptId:attempt.id,eventType:'AUTOMATIC_REFUND_OBSERVED',status,details:{providerRefundId:refund?.id||null,reason:reason||null}}});
  await tx.refundRequest.updateMany({where:{paymentId:payment.id,status:{in:['REFUND_PROCESSING','REFUND_STATUS_UNKNOWN']}},data:{status:target==='REFUNDED'?'REFUNDED':status==='REFUND_FAILED'?'REFUND_FAILED':'REFUND_STATUS_UNKNOWN',razorpayRefundId:refund?.id||null}});
 });
}
export async function processAutomaticRefund(id:string){
 const attempt=await db.refundAttempt.findUnique({where:{id}});if(!attempt)return 'MISSING';
 if(['REFUNDED','REFUND_FAILED'].includes(attempt.status))return attempt.status;
 const payment=await db.payment.findUniqueOrThrow({where:{id:attempt.paymentId}});
 if(!payment.paymentId)throw new Error('Captured payment reference is missing.');
 const expected={paymentId:payment.paymentId,amountInPaise:Math.round(attempt.amount*100),idempotencyKey:refundIdempotencyKey(payment.id)};
 const claimed=await db.refundAttempt.updateMany({where:{id,status:'QUEUED'},data:{status:'REFUND_PROCESSING'}});
 let refund:any;
 if(claimed.count===1){
  try{refund=await refundRazorpayPayment(payment.paymentId,expected.amountInPaise,{reason:'Automatic refund for unfulfilled pickup',orderId:attempt.orderId,payment_record_id:payment.id,attempt_id:attempt.id,refund_request_key:expected.idempotencyKey},expected.idempotencyKey);}
  catch(error){const definitive=error instanceof RazorpayRefundError&&!error.uncertain;await persist(attempt,definitive?'REFUND_FAILED':'REFUND_PENDING_RECONCILIATION',undefined,definitive?'Provider rejected refund. Admin review required.':'Provider outcome uncertain. Reconcile before retrying.');return definitive?'REFUND_FAILED':'REFUND_PENDING_RECONCILIATION';}
 }else{
  // Never resubmit an uncertain POST. Look for authenticated provider evidence instead.
  const refunds=await fetchRazorpayPaymentRefunds(payment.paymentId);
  refund=(Array.isArray(refunds)?refunds:(refunds as any).items||[]).find((r:any)=>isRefundResultForRequest(r,expected));
  if(!refund)return 'REFUND_PENDING_RECONCILIATION';
 }
 if(!isRefundResultForRequest(refund,expected)){await persist(attempt,'REFUND_PENDING_RECONCILIATION',undefined,'Provider evidence did not match the refund intent.');return 'REFUND_PENDING_RECONCILIATION';}
 const status=refund.status==='processed'?'REFUNDED':refund.status==='pending'?'REFUND_PENDING':refund.status==='failed'?'REFUND_FAILED':'REFUND_PENDING_RECONCILIATION';
 await persist(attempt,status,refund);return status;
}
export async function processUnassignedRefunds(){
 const summary={expired:0,processed:0,pending:0,reviewRequired:0,failed:0};
 const due=await db.order.findMany({where:{timeoutPolicyVersion:1,agentId:null,status:{in:['BOOKING_RECEIVED','AGENT_BEING_ASSIGNED']},assignmentDeadlineAt:{lte:new Date()}},select:{id:true},take:50});
 for(const o of due){try{await db.$transaction(async tx=>{if(await expireAssignmentTx(tx,o.id))summary.expired++;await protectCapturedOrderTx(tx,o.id);});}catch{summary.failed++;}}
 // Also recovers late captures and interruptions between cancellation and intent creation.
 const late=await db.payment.findMany({where:{direction:'CUSTOMER_PAYS',status:'CAPTURED',order:{status:'CANCELLED',timeoutPolicyVersion:1,assignmentTimedOutAt:{not:null}}},take:50});
 for(const p of late){try{await db.$transaction(tx=>queueCancelledPaymentRefundTx(tx,p));}catch{summary.failed++;}}
 const attempts=await db.refundAttempt.findMany({where:{events:{some:{eventType:'AUTOMATIC_REFUND_QUEUED'}},status:{in:['QUEUED','REFUND_PROCESSING','REFUND_PENDING','REFUND_PENDING_RECONCILIATION']}},orderBy:{createdAt:'asc'},take:50});
 for(const a of attempts){try{const status=await processAutomaticRefund(a.id);if(status==='REFUNDED')summary.processed++;else if(status==='REFUND_FAILED')summary.failed++;else if(status==='REFUND_PENDING')summary.pending++;else summary.reviewRequired++;}catch{summary.failed++;}}
 return summary;
}
