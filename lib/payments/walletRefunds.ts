import {dispatchCustomerWalletNotification} from '@/lib/services/walletNotification';
import {refundAttemptId} from './refundWorkflow';
import {toPaise,fromPaise} from '@/lib/wallet';

/** One durable refund across wallet/source channels. Amounts are integer paise. */
export async function creditPaymentRefundTx(tx:any,input:{paymentId:string;amountPaise:number;identity:string;reason:string;attemptId?:string;updateOrderStatus?:boolean}){
 const {amountPaise}=input;
 if(!Number.isSafeInteger(amountPaise)||amountPaise<=0)throw new Error('Invalid wallet refund amount.');
 const id=input.attemptId||refundAttemptId(input.paymentId,input.identity);
 const key=`payment-wallet-refund:${id}`;
 const duplicate=await tx.walletTransaction.findUnique({where:{idempotencyKey:key}});
 if(duplicate){if(duplicate.amountPaise!==amountPaise)throw new Error('Refund retry amount changed.');return duplicate;}
 const payment=await tx.payment.findUnique({where:{id:input.paymentId},include:{order:true}});
 if(!payment||payment.direction!=='CUSTOMER_PAYS'||!payment.order)throw new Error('Original customer payment was not found.');
 const sourceRequest=await tx.refundRequest.findUnique({where:{paymentId:payment.id}});
 if(sourceRequest?.destination==='SOURCE'&&!['REJECTED','REFUND_FAILED'].includes(sourceRequest.status))throw new Error('An original-payment refund already owns this payment.');
 const attempts=await tx.refundAttempt.findMany({where:{paymentId:payment.id}});
 const same=attempts.find((row:any)=>row.id===id);
 if(same&&toPaise(same.amount)!==amountPaise)throw new Error('Refund retry amount changed.');
 if(same&&(same.destination!=='WALLET'||!['QUEUED','PENDING'].includes(same.status)))throw new Error('A refund already owns this payment amount. Check its status.');
 const reserved=attempts.filter((row:any)=>row.id!==id&&!['REFUND_FAILED','REJECTED','RESET_TO_CAPTURED'].includes(row.status)).reduce((sum:number,row:any)=>sum+toPaise(row.amount),0);
 if(reserved+amountPaise>toPaise(payment.amount))throw new Error('Refund exceeds the unrefunded payment amount.');
 const wallet=await tx.customerWallet.upsert({where:{customerId:payment.order.customerId},update:{},create:{customerId:payment.order.customerId}});
 let paidPaise=amountPaise;const bonuses:Array<{grantId:string;amountPaise:number}>=[];
 if(payment.gateway==='WALLET'){
  const debit=await tx.walletTransaction.findFirst({where:{customerId:payment.order.customerId,referenceId:payment.purpose==='WEIGHT_ADJUSTMENT'?`weight:${payment.gatewayOrderId}`:`order:${payment.orderId}`,type:'WALLET_DEBIT',status:'SUCCESS'}});
  if(!debit||toPaise(debit.amount)!==toPaise(payment.amount))throw new Error('Original wallet allocation could not be verified.');
  const consumed=await tx.walletBonusConsumption.findMany({where:{walletTransactionId:debit.id},include:{grant:true}});
  const earlier=await tx.walletTransaction.findMany({where:{customerId:payment.order.customerId,type:'REFUND',referenceId:`payment:${payment.id}`,status:'SUCCESS'}});
  let paidReturned=0;const restored=new Map<string,number>();
  for(const row of earlier){const allocation=JSON.parse(row.refundAllocationJson||'{}');paidReturned+=allocation.paidPaise||0;for(const grant of allocation.bonuses||[])restored.set(grant.grantId,(restored.get(grant.grantId)||0)+grant.amountPaise);}
  const paidUsed=toPaise(payment.amount)-consumed.reduce((sum:number,row:any)=>sum+row.consumedPaise,0);
  paidPaise=Math.min(amountPaise,Math.max(0,paidUsed-paidReturned));let remaining=amountPaise-paidPaise;
  for(const row of consumed){if(!remaining)break;if(row.grant.walletId!==wallet.id)throw new Error('Refund allocation ownership mismatch.');const give=Math.min(remaining,Math.max(0,row.consumedPaise-(restored.get(row.grantId)||0)));if(give){await tx.walletBonusGrant.update({where:{id:row.grantId},data:{remainingPaise:{increment:give},status:'ACTIVE'}});bonuses.push({grantId:row.grantId,amountPaise:give});remaining-=give;}}
  if(remaining)throw new Error('Wallet refund allocation is inconsistent.');
 }
 const balancePaise=wallet.balancePaise+amountPaise,paidBalancePaise=wallet.paidBalancePaise+paidPaise;
 await tx.customerWallet.update({where:{id:wallet.id},data:{balance:fromPaise(balancePaise),balancePaise,paidBalancePaise}});
 const row=await tx.walletTransaction.create({data:{walletId:wallet.id,customerId:payment.order.customerId,type:'REFUND',status:'SUCCESS',amount:fromPaise(amountPaise),amountPaise,balanceAfter:fromPaise(balancePaise),balanceAfterPaise:balancePaise,referenceId:`payment:${payment.id}`,idempotencyKey:key,reason:input.reason,refundAllocationJson:JSON.stringify({paidPaise,bonuses})}});
 if(same)await tx.refundAttempt.update({where:{id},data:{status:'REFUNDED',destination:'WALLET',failureReason:null}});
 else await tx.refundAttempt.create({data:{id,orderId:payment.orderId,paymentId:payment.id,amount:fromPaise(amountPaise),status:'REFUNDED',destination:'WALLET'}});
 const total=reserved+amountPaise,status=total===toPaise(payment.amount)?'REFUNDED':'PARTIALLY_REFUNDED';
 await tx.payment.update({where:{id:payment.id},data:{status}});
 if(input.updateOrderStatus!==false&&payment.purpose!=='WEIGHT_ADJUSTMENT')await tx.order.update({where:{id:payment.orderId},data:{paymentStatus:status}});
 await tx.refundAttemptEvent.create({data:{id:`${id}:wallet-credited`,refundAttemptId:id,eventType:'WALLET_REFUND_CREDITED',status:'REFUNDED',details:{amountPaise,destination:'WALLET'}}});
 await dispatchCustomerWalletNotification(tx,{customerId:payment.order.customerId,type:'REFUND',amount:fromPaise(amountPaise),balanceAfter:fromPaise(balancePaise),reason:input.reason,referenceId:key});
 return row;
}
