import {db} from '@/lib/db';
import {fetchRazorpayPayment,captureRazorpayPayment} from './razorpay';
import {fulfillWalletTopup,fulfillSubscriptionPurchase} from './catalog';
export async function processCatalogWebhook(event:string,entity:any){
 if(!['payment.captured','payment.authorized','payment.failed','order.paid'].includes(event)||!entity?.order_id||!entity.id)return false;
 const [topup,subscription]=await Promise.all([db.walletTransaction.findFirst({where:{gatewayOrderId:entity.order_id,type:'TOPUP'}}),db.subscriptionPayment.findUnique({where:{gatewayOrderId:entity.order_id}})]);
 const record:any=topup||subscription;if(!record)return false;
 if(entity.currency!=='INR'||entity.amount!==(record.amountPaise||Math.round(record.amount*100)))throw new Error('Webhook amount does not match the purchase.');
 if(record.status==='SUCCESS')return true;
 if(event==='payment.failed'){
  // An individual failed attempt does not terminally fail its reusable gateway order.
  return true;
 }
 let payment=await fetchRazorpayPayment(entity.id);
 if(payment.order_id!==record.gatewayOrderId||payment.amount!==entity.amount||payment.currency!=='INR')throw new Error('Provider payment did not match the purchase.');
 if(payment.status==='authorized')payment=await captureRazorpayPayment(payment.id,payment.amount);
 if(payment.status!=='captured')throw new Error('Payment capture is awaiting confirmation.');
 if(topup)await fulfillWalletTopup(topup.id,payment);else await fulfillSubscriptionPurchase(subscription!.id,payment);
 return true;
}
