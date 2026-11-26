import {createHash} from 'node:crypto';
import {db} from '@/lib/db';
import {requirePickupVerified} from './pickupOtp';
import {captureRazorpayPayment,createRazorpayQr,fetchRazorpayQrPayments,fetchRazorpayQr,findRazorpayQr,fetchRazorpayPayment,createRazorpayOrder,getRazorpayKeyId} from '@/lib/payments/razorpay';
import {creditPaymentRefundTx} from '@/lib/payments/walletRefunds';
import {spendWalletPaise} from '@/lib/wallet';
export class WeightAdjustmentError extends Error{constructor(message:string,public status=409){super(message);}}
export function weightAdjustmentQuote(order:any,weights:any[]){
 if(!Array.isArray(weights)||weights.length!==order.items.length||!weights.length)throw new WeightAdjustmentError('Record the actual weight of every booked item.',400);
 const seen=new Set<string>();let deltaPaise=0,totalWeightKg=0;
 const normalized=weights.map(input=>{const item=order.items.find((i:any)=>i.id===input.itemId);if(!item||seen.has(item.id)||typeof input.actualWeight!=='number'||!Number.isFinite(input.actualWeight)||input.actualWeight<0||input.actualWeight>10000||Math.abs(input.actualWeight*1000-Math.round(input.actualWeight*1000))>1e-6)throw new WeightAdjustmentError('Use valid weights with up to three decimal places for each item.',400);seen.add(item.id);const actualMilli=Math.round(input.actualWeight*1000),estimatedMilli=Math.round(item.estimatedWeight*1000),ratePaise=Math.round(item.ratePerKg*100);deltaPaise+=Math.round((actualMilli-estimatedMilli)*ratePaise/1000);totalWeightKg+=input.actualWeight;return{itemId:item.id,categoryId:item.categoryId,actualWeight:input.actualWeight};}).sort((a,b)=>a.itemId.localeCompare(b.itemId));
 if(totalWeightKg<=0)throw new WeightAdjustmentError('No material was collected. Contact operations to resolve this pickup.',400);
 const bookedPaise=Math.round(order.finalAmount*100),actualPaise=Math.max(0,bookedPaise+deltaPaise);
 if(!Number.isSafeInteger(actualPaise)||actualPaise>100000000)throw new WeightAdjustmentError('Pickup amount is outside the permitted limit.',400);
 return{bookedPaise,actualPaise,extraPaise:Math.max(0,actualPaise-bookedPaise),refundPaise:Math.max(0,bookedPaise-actualPaise),weightsJson:JSON.stringify(normalized),weightsHash:createHash('sha256').update(JSON.stringify(normalized)).digest('hex')};
}
export function publicWeightAdjustment(row:any){return row?{id:row.id,orderId:row.orderId,bookedAmount:row.bookedPaise/100,actualAmount:row.actualPaise/100,extraAmount:row.extraPaise/100,refundAmount:row.refundPaise/100,status:row.status,qrImageUrl:row.qrImageUrl,qrExpiresAt:row.qrExpiresAt,paid:row.status==='PAID',walletRefunded:row.status==='WALLET_REFUNDED'}:null;}
export async function prepareWeightAdjustment(orderId:string,agentId:string,weights:any[]){
 return db.$transaction(async tx=>{
  const order=await tx.order.findUnique({where:{id:orderId},include:{items:true}});
  if(!order||order.agentId!==agentId)throw new WeightAdjustmentError('Pickup is not assigned to you.',403);
  if(!['AGENT_ARRIVED','WASTE_VERIFICATION','WEIGHING'].includes(order.status))throw new WeightAdjustmentError('Weights can only be recorded after arrival.');
  await requirePickupVerified(tx,orderId,agentId);
  const previous=await tx.orderWeightAdjustment.findUnique({where:{orderId}});
  const base={...order,finalAmount:previous?previous.bookedPaise/100:order.finalAmount};const quote=weightAdjustmentQuote(base,weights);
  if(previous){if(previous.weightsHash===quote.weightsHash)return previous;if(previous.qrId||previous.gatewayOrderId||!['PAYMENT_REQUIRED','READY'].includes(previous.status))throw new WeightAdjustmentError('The weight bill is locked after a payment request. Contact operations to correct it.');return tx.orderWeightAdjustment.update({where:{id:previous.id},data:{...quote,status:quote.extraPaise?'PAYMENT_REQUIRED':'READY'}});}
  return tx.orderWeightAdjustment.create({data:{orderId,...quote,status:quote.extraPaise?'PAYMENT_REQUIRED':'READY'}});
 });
}
function safeQrImage(value:unknown){try{const u=new URL(String(value));return u.protocol==='https:'&&(/(^|\.)razorpay\.com$/.test(u.hostname)||u.hostname==='rzp.io')?u.href:null;}catch{return null;}}
async function saveQr(row:any,qr:any){
 if(!qr?.id||qr.type!=='upi_qr'||qr.usage!=='single_use'||qr.fixed_amount!==true||qr.payment_amount!==row.extraPaise||qr.notes?.adjustment_id!==row.id)throw new WeightAdjustmentError('QR details could not be verified. Check status before retrying.',503);
 const image=safeQrImage(qr.image_url);if(!image)throw new WeightAdjustmentError('QR image could not be verified.',503);
 await db.orderWeightAdjustment.updateMany({where:{id:row.id,status:{in:['QR_CREATING','QR_UNKNOWN','PAYMENT_REQUIRED']}},data:{qrId:qr.id,qrImageUrl:image,qrExpiresAt:qr.close_by?new Date(qr.close_by*1000):null,status:'QR_READY'}});
 return db.orderWeightAdjustment.findUniqueOrThrow({where:{id:row.id}});
}
export async function createWeightQr(orderId:string){
 const row=await db.orderWeightAdjustment.findUniqueOrThrow({where:{orderId},include:{order:{select:{orderNumber:true}}}});
 if(row.qrId||row.status==='PAID')return row;
 if(['QR_CREATING','QR_UNKNOWN'].includes(row.status)){const observed=await findRazorpayQr(row.id);if(observed)return saveQr(row,observed);throw new WeightAdjustmentError('QR creation is awaiting confirmation. Use Check payment status; do not collect a second payment.',503);}
 if(!['PAYMENT_REQUIRED','CHECKOUT_READY'].includes(row.status)||row.extraPaise<=0)throw new WeightAdjustmentError('This pickup has no extra amount to collect.');
 const claimed=await db.orderWeightAdjustment.updateMany({where:{id:row.id,status:{in:['PAYMENT_REQUIRED','CHECKOUT_READY']}},data:{status:'QR_CREATING'}});if(!claimed.count)throw new WeightAdjustmentError('QR creation is already in progress.');
 try{return await saveQr(row,await createRazorpayQr(row.extraPaise,row.id,row.order.orderNumber));}
 catch(error:any){await db.orderWeightAdjustment.updateMany({where:{id:row.id,status:'QR_CREATING'},data:{status:error?.statusCode>=400&&error?.statusCode<500?'PAYMENT_REQUIRED':'QR_UNKNOWN'}});throw new WeightAdjustmentError(error?.statusCode===403?'UPI QR is not enabled for this merchant. The customer can use Pay online in their pickup tracker.':'QR request could not be confirmed. Check payment status before trying again.',503);}
}
export async function applyWeightPayment(rowId:string,payment:any,qrId?:string){
 return db.$transaction(async tx=>{
  const row=await tx.orderWeightAdjustment.findUniqueOrThrow({where:{id:rowId}});
  if(payment.status!=='captured'||payment.currency!=='INR'||payment.amount!==row.extraPaise||!/^pay_[A-Za-z0-9]+$/.test(payment.id))throw new WeightAdjustmentError('Payment does not match the extra-weight bill.');
  if(qrId?row.qrId!==qrId:!row.gatewayOrderId||row.gatewayOrderId!==payment.order_id)throw new WeightAdjustmentError('Payment reference does not match this bill.');
  const ledgerId=`weight_${payment.id}`;
  const used=await tx.payment.findFirst({where:{paymentId:payment.id}});if(used&&used.id!==ledgerId)throw new WeightAdjustmentError('Payment was already used for another purchase.');
  if(!used)await tx.payment.create({data:{id:ledgerId,orderId:row.orderId,purpose:'WEIGHT_ADJUSTMENT',amount:row.extraPaise/100,direction:'CUSTOMER_PAYS',gateway:'RAZORPAY',gatewayOrderId:payment.order_id||null,paymentId:payment.id,status:'CAPTURED'}});
  if(row.status==='PAID'){
   if(row.providerPaymentId!==payment.id)await creditPaymentRefundTx(tx,{paymentId:ledgerId,amountPaise:row.extraPaise,identity:'duplicate_weight',reason:'Additional payment received after extra weight was already settled',updateOrderStatus:false});
   return row;
  }
  const duplicate=await tx.orderWeightAdjustment.findUnique({where:{providerPaymentId:payment.id}});if(duplicate&&duplicate.id!==row.id)throw new WeightAdjustmentError('Payment was already used.');
  return tx.orderWeightAdjustment.update({where:{id:row.id},data:{status:'PAID',providerPaymentId:payment.id}});
 });
}
export async function checkWeightPayment(orderId:string){
 let row=await db.orderWeightAdjustment.findUnique({where:{orderId}});if(!row||row.status==='PAID')return row;
 if(!row.qrId&&['QR_UNKNOWN','QR_CREATING'].includes(row.status)){const qr=await findRazorpayQr(row.id);if(qr)row=await saveQr(row,qr);}
 if(row.qrId){const list=await fetchRazorpayQrPayments(row.qrId);const paid=list.items?.find((p:any)=>p.status==='captured'&&p.currency==='INR'&&p.amount===row!.extraPaise);if(paid){const proof=await fetchRazorpayPayment(paid.id);return applyWeightPayment(row.id,proof,row.qrId);}}
 if(row.gatewayOrderId){const {fetchRazorpayOrderPayments}=await import('@/lib/payments/razorpay');const list=await fetchRazorpayOrderPayments(row.gatewayOrderId);const paid=list.items?.find((p:any)=>p.status==='captured');if(paid)return applyWeightPayment(row.id,await fetchRazorpayPayment(paid.id));}
 return row;
}
export async function weightCheckout(orderId:string){
 const row=await db.orderWeightAdjustment.findUniqueOrThrow({where:{orderId}});
 if(row.status==='PAID')return{alreadyPaid:true};
 if(row.gatewayOrderId)return{gatewayOrderId:row.gatewayOrderId,amount:row.extraPaise,currency:'INR',key:getRazorpayKeyId()};
 const claim=await db.orderWeightAdjustment.updateMany({where:{id:row.id,status:{in:['PAYMENT_REQUIRED','QR_READY']},gatewayOrderId:null},data:{status:'CHECKOUT_CREATING'}});if(!claim.count)throw new WeightAdjustmentError('A payment request is already in progress. Check payment status.');
 try{const gateway=await createRazorpayOrder({amountInPaise:row.extraPaise,receipt:`wt-${row.id}`,notes:{purpose:'weight_adjustment',adjustmentId:row.id}});await db.orderWeightAdjustment.updateMany({where:{id:row.id,status:'CHECKOUT_CREATING'},data:{gatewayOrderId:gateway.id,status:row.qrId?'QR_READY':'CHECKOUT_READY'}});if((await db.orderWeightAdjustment.findUnique({where:{id:row.id}}))?.status==='PAID')return{alreadyPaid:true};return{gatewayOrderId:gateway.id,amount:gateway.amount,currency:gateway.currency,key:gateway.keyId};}
 catch(error:any){await db.orderWeightAdjustment.updateMany({where:{id:row.id,status:'CHECKOUT_CREATING'},data:{status:error?.uncertain?'CHECKOUT_UNKNOWN':'PAYMENT_REQUIRED'}});throw error;}
}
export async function payWeightWithWallet(orderId:string,customerId:string){return db.$transaction(async tx=>{const row=await tx.orderWeightAdjustment.findUniqueOrThrow({where:{orderId},include:{order:true}});if(row.order.customerId!==customerId)throw new WeightAdjustmentError('Not your pickup.',403);if(row.status==='PAID')return row;if(!['PAYMENT_REQUIRED','QR_READY','CHECKOUT_READY'].includes(row.status))throw new WeightAdjustmentError('A gateway payment is already active. Check payment status first.');if(row.extraPaise<=0)throw new WeightAdjustmentError('No extra amount is due.');await spendWalletPaise(tx,{customerId,amountPaise:row.extraPaise,referenceId:`weight:${row.id}`,reason:'Extra weight on pickup'});await tx.payment.create({data:{id:`wallet-weight-${row.id}`,orderId:row.orderId,purpose:'WEIGHT_ADJUSTMENT',gateway:'WALLET',gatewayOrderId:row.id,paymentId:`wallet:${row.id}`,amount:row.extraPaise/100,direction:'CUSTOMER_PAYS',status:'CAPTURED'}});return tx.orderWeightAdjustment.update({where:{id:row.id},data:{status:'PAID',providerPaymentId:`wallet:${row.id}`}});});}
export async function finalizeWeightAdjustmentTx(tx:any,order:any){
 const row=await tx.orderWeightAdjustment.findUnique({where:{orderId:order.id}});if(!row)return null;
 if(row.extraPaise>0&&row.status!=='PAID')throw new WeightAdjustmentError('The extra weight payment must be confirmed before completing pickup.',402);
 if(row.refundPaise>0&&row.status!=='WALLET_REFUNDED'){
  const payment=await tx.payment.findFirst({where:{orderId:order.id,purpose:'BOOKING',direction:'CUSTOMER_PAYS',status:{in:['CAPTURED','PARTIALLY_REFUNDED']}},orderBy:{createdAt:'asc'}});
  if(!payment)throw new WeightAdjustmentError('Original captured payment could not be verified.');
  await creditPaymentRefundTx(tx,{paymentId:payment.id,amountPaise:row.refundPaise,identity:`weight_${row.id}`,reason:'Refund for lower actual pickup weight'});
  await tx.orderWeightAdjustment.update({where:{id:row.id},data:{status:'WALLET_REFUNDED'}});
 }
 return row;
}
export async function processWeightWebhook(body:any){
 const entity=body.payload?.payment?.entity,qrId=body.payload?.qr_code?.entity?.id;
 if(!entity?.id||!['qr_code.credited','payment.authorized','payment.captured','order.paid'].includes(body.event))return false;
 const row=qrId?await db.orderWeightAdjustment.findUnique({where:{qrId}}):entity.order_id?await db.orderWeightAdjustment.findUnique({where:{gatewayOrderId:entity.order_id}}):null;
 if(!row)return false;
 let proof=await fetchRazorpayPayment(entity.id);
 if(!qrId&&proof.status==='authorized'&&proof.order_id===row.gatewayOrderId&&proof.currency==='INR'&&proof.amount===row.extraPaise)proof=await captureRazorpayPayment(proof.id,proof.amount);
 if(qrId){const list=await fetchRazorpayQrPayments(qrId);if(!list.items?.some((p:any)=>p.id===proof.id))throw new WeightAdjustmentError('QR payment ownership could not be verified.');}
 await applyWeightPayment(row.id,proof,qrId);return true;
}
