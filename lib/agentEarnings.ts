import {getEffectiveGstRate, calculateTaxBreakdown} from '@/lib/pricing/tax';
import {creditAgentPickupEarnings} from '@/lib/agentWallet';

/** GST is included in the company's 35%; allocation never changes the pickup total. */
export function splitPickupEarnings(amount: number, gstRate = getEffectiveGstRate(), interState = false) {
 if(!Number.isFinite(amount) || amount < 0 || !Number.isFinite(gstRate) || gstRate < 0 || gstRate > 1) throw new Error('Invalid pickup earnings amount or tax rate.');
 const grossPaise = Math.round((amount + Number.EPSILON) * 100);
 if(!Number.isSafeInteger(grossPaise))throw new Error('Pickup amount is too large.');
 const agentPaise = Math.round(grossPaise * 65 / 100);
 const companyGrossPaise = grossPaise - agentPaise;
 const serviceFeePaise = Math.round(companyGrossPaise / (1 + gstRate));
 const gstPaise = companyGrossPaise - serviceFeePaise;
 const cgstPaise = interState ? 0 : Math.round(gstPaise / 2);
 return {grossPaise,agentPaise,companyGrossPaise,serviceFeePaise,gstPaise,
  cgstPaise,sgstPaise:interState?0:gstPaise-cgstPaise,igstPaise:interState?gstPaise:0,gstRate};
}
export function earningsTax(split: ReturnType<typeof splitPickupEarnings>) {
 const tax=calculateTaxBreakdown({pickupFee:split.agentPaise/100,serviceFee:split.serviceFeePaise/100,gstRate:split.gstRate,state:split.igstPaise?'Other':'Karnataka'});
 return {...tax,gstAmount:split.gstPaise/100,gstAmountPaise:split.gstPaise,
  cgstAmount:split.cgstPaise/100,cgstAmountPaise:split.cgstPaise,
  sgstAmount:split.sgstPaise/100,sgstAmountPaise:split.sgstPaise,
  igstAmount:split.igstPaise/100,igstAmountPaise:split.igstPaise,
  totalFeeWithGst:split.grossPaise/100,totalFeeWithGstPaise:split.grossPaise};
}
export async function recordPickupEarnings(tx: any, input: {agentId:string;orderId:string;orderNumber:string;amount:number;gstRate?:number;interState?:boolean}) {
 const existing=await tx.pickupEarning.findUnique({where:{orderId:input.orderId}});
 const snapshot=existing || await tx.pickupEarning.create({data:{orderId:input.orderId,agentId:input.agentId,...splitPickupEarnings(input.amount,input.gstRate,input.interState)}});
 if(snapshot.agentId!==input.agentId)throw new Error('Pickup earning belongs to another agent.');
 if(snapshot.agentPaise>0)await creditAgentPickupEarnings(tx,{agentId:input.agentId,orderId:input.orderId,orderNumber:input.orderNumber,amount:snapshot.agentPaise/100,reason:`65% pickup earnings for #${input.orderNumber}`});
 return snapshot;
}
