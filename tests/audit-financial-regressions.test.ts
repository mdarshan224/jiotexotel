import {describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/db',()=>({db:{}}));
import {localDatabase} from './fixtures/localDatabase';
import {purchaseSubscriptionWithWallet,consumeSubscriptionPickupEntitlement,withWalletSubscriptionAttempt} from '@/lib/subscriptions';
import {spendWalletPaise,refundWalletOrderPayment,getSpendableWalletPaise} from '@/lib/wallet';
async function fixture(){
 const d=await localDatabase();
 const user=await d.prisma.user.create({data:{name:'Local audit customer',phone:'7000000001',customer:{create:{}}},include:{customer:true}});
 const customerId=user.customer!.id;
 const wallet=await d.prisma.customerWallet.create({data:{customerId,balance:250,balancePaise:25000,paidBalancePaise:20000}});
 const recharge=await d.prisma.walletTransaction.create({data:{walletId:wallet.id,customerId,type:'TOPUP',amount:200,status:'SUCCESS'}});
 const bonus=await d.prisma.walletTransaction.create({data:{walletId:wallet.id,customerId,type:'BONUS',amount:50,status:'SUCCESS'}});
 const grant=await d.prisma.walletBonusGrant.create({data:{walletId:wallet.id,customerId,sourceTransactionId:bonus.id,rechargeTransactionId:recharge.id,grantedPaise:5000,remainingPaise:5000,expiresAt:new Date(Date.now()+86400000)}});
 const offer=await d.prisma.subscriptionOffer.create({data:{name:'Audit pass',description:'Local regression fixture',price:99,pickupLimit:2,benefitsJson:'[]'}});
 return {...d,customerId,wallet,grant,offer};
}
describe('Wallet and subscription database regressions',()=>{
 it('debits a subscription once from bonus first and keeps all balances and ledger allocations consistent',async()=>{
  const d=await fixture();try{
   await d.prisma.$transaction(tx=>purchaseSubscriptionWithWallet(tx,{customerId:d.customerId,offerId:d.offer.id}));
   const wallet=await d.prisma.customerWallet.findUniqueOrThrow({where:{id:d.wallet.id}});
   expect(wallet.balance).toBe(151);expect(wallet.balancePaise).toBe(15100);expect(wallet.paidBalancePaise).toBe(15100);
   expect((await d.prisma.walletBonusGrant.findUniqueOrThrow({where:{id:d.grant.id}})).remainingPaise).toBe(0);
   expect(await d.prisma.walletBonusConsumption.count()).toBe(1);
  }finally{await d.close();}
 });
 it('replays a subscription wallet attempt without charging again or adding another pass',async()=>{
  const d=await fixture();try{
   const input={customerId:d.customerId,offerId:d.offer.id,operation:'purchase',attemptId:'audit-attempt-00000001'};
   const buy=()=>d.prisma.$transaction(tx=>withWalletSubscriptionAttempt(tx,input,()=>purchaseSubscriptionWithWallet(tx,input)));
   const first=await buy();const second=await buy();
   expect(second.subscription.id).toBe(first.subscription.id);
   expect(await d.prisma.customerSubscription.count()).toBe(1);expect(await d.prisma.subscriptionPayment.count()).toBe(1);
   expect((await d.prisma.customerWallet.findUniqueOrThrow({where:{id:d.wallet.id}})).balancePaise).toBe(15100);
   await expect(d.prisma.$transaction(tx=>withWalletSubscriptionAttempt(tx,{...input,offerId:'another-offer'},()=>purchaseSubscriptionWithWallet(tx,input)))).rejects.toThrow(/does not match/);
  }finally{await d.close();}
 });
 it('rolls back subscription/payment creation when wallet funds are insufficient',async()=>{
  const d=await fixture();try{
   await d.prisma.subscriptionOffer.update({where:{id:d.offer.id},data:{price:500}});
   await expect(d.prisma.$transaction(tx=>purchaseSubscriptionWithWallet(tx,{customerId:d.customerId,offerId:d.offer.id}))).rejects.toThrow(/Insufficient/);
   expect(await d.prisma.customerSubscription.count()).toBe(0);expect(await d.prisma.subscriptionPayment.count()).toBe(0);
   expect((await d.prisma.customerWallet.findUniqueOrThrow({where:{id:d.wallet.id}})).balancePaise).toBe(25000);
  }finally{await d.close();}
 });
 it('skips an exhausted pass and consumes the next eligible pass without exceeding limits',async()=>{
  const d=await fixture();try{
   const first=await d.prisma.customerSubscription.create({data:{customerId:d.customerId,offerId:d.offer.id,startDate:new Date(Date.now()-86400000),expiryDate:new Date(Date.now()+86400000),pickupsAllowed:1,pickupsUsed:1}});
   const next=await d.prisma.customerSubscription.create({data:{customerId:d.customerId,offerId:d.offer.id,startDate:new Date(Date.now()-86400000),expiryDate:new Date(Date.now()+2*86400000),pickupsAllowed:1,pickupsUsed:0}});
   const result=await d.prisma.$transaction(tx=>consumeSubscriptionPickupEntitlement(tx,{customerId:d.customerId}));
   expect(result.subscription.id).toBe(next.id);expect(result.remainingPickups).toBe(0);
   expect((await d.prisma.customerSubscription.findUniqueOrThrow({where:{id:first.id}})).pickupsUsed).toBe(1);
   expect((await d.prisma.$transaction(tx=>consumeSubscriptionPickupEntitlement(tx,{customerId:d.customerId}))).eligible).toBe(false);
  }finally{await d.close();}
 });
 it('deduplicates wallet order debits and refunds back to the original paid/bonus buckets',async()=>{
  const d=await fixture();try{
   const input={customerId:d.customerId,amountPaise:9900,referenceId:'order:audit-order',reason:'Audit test'};
   await d.prisma.$transaction(tx=>spendWalletPaise(tx,input));
   expect((await d.prisma.$transaction(tx=>spendWalletPaise(tx,input))).alreadyProcessed).toBe(true);
   await d.prisma.$transaction(tx=>refundWalletOrderPayment(tx,{customerId:d.customerId,orderId:'audit-order',amount:99}));
   await d.prisma.$transaction(tx=>refundWalletOrderPayment(tx,{customerId:d.customerId,orderId:'audit-order',amount:99}));
   expect(await d.prisma.walletTransaction.count({where:{type:'REFUND'}})).toBe(1);
   const wallet=await d.prisma.customerWallet.findUniqueOrThrow({where:{id:d.wallet.id}});
   expect(wallet.balancePaise).toBe(25000);expect(wallet.paidBalancePaise).toBe(20000);
   const grant=await d.prisma.walletBonusGrant.findUniqueOrThrow({where:{id:d.grant.id}});expect(grant.remainingPaise).toBe(5000);expect(grant.expiresAt).toEqual(d.grant.expiresAt);
  }finally{await d.close();}
 });
 it('does not spend expired promotional points as paid money',async()=>{
  const d=await fixture();try{
   await d.prisma.walletBonusGrant.update({where:{id:d.grant.id},data:{expiresAt:new Date(Date.now()-1000)}});
   expect(await getSpendableWalletPaise(d.prisma,d.wallet)).toBe(20000);
   await expect(d.prisma.$transaction(tx=>spendWalletPaise(tx,{customerId:d.customerId,amountPaise:22000,referenceId:'order:expired',reason:'Expired points'}))).rejects.toThrow(/Insufficient/);
   expect((await d.prisma.customerWallet.findUniqueOrThrow({where:{id:d.wallet.id}})).balancePaise).toBe(25000);
  }finally{await d.close();}
 });
});
