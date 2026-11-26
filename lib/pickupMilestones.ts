import {db} from '@/lib/db';
import {COMPLETED_PICKUP_STATUSES,LEGACY_PICKUP_MILESTONE_REWARD_PAISE,PICKUP_MILESTONE_TYPE,isPickupMilestoneTarget,pickupMilestoneRewardPaise,pickupMilestoneProgress,pickupMilestoneTargets} from './pickupMilestonesPolicy';
// Keep the original business key for first credits, so older in-flight requests
// cannot independently award that same threshold during publication.
export const milestoneKey=(customerId:string,target:number)=>`pickup-milestone:v1:${customerId}:${target}`;
const upgradeKey=(customerId:string,target:number)=>`pickup-milestone:v2:${customerId}:${target}`;
const MAX_CREDITS_PER_TRANSACTION=25;
/** Award earned thresholds, wallet balance, bonus allocation, ledger and notice atomically.
 * Historical pickups are included. The unique ledger idempotency key is the durable reward record.
 */
async function readMilestoneState(tx:any,customerId:string){
 const customer=await tx.customer.findUnique({where:{id:customerId},select:{id:true,userId:true,user:{select:{role:true,deletionDueAt:true}}}});
 if(!customer||customer.user.role!=='CUSTOMER'||customer.user.deletionDueAt)return null;
 const completed=await tx.order.count({where:{customerId,status:{in:COMPLETED_PICKUP_STATUSES}}});
 const legacyPrefix=`pickup-milestone:v1:${customerId}:`,prefix=`pickup-milestone:v2:${customerId}:`;
 const rows=await tx.walletTransaction.findMany({where:{customerId,type:PICKUP_MILESTONE_TYPE,status:'SUCCESS',OR:[{idempotencyKey:{startsWith:legacyPrefix}},{idempotencyKey:{startsWith:prefix}}]},select:{id:true,idempotencyKey:true,amountPaise:true},orderBy:{createdAt:'asc'}});
 const awarded=new Set<number>(),credited=new Map<number,number>(),original=new Map<number,number>(),revised=new Map<number,number>();
 for(const row of rows){
  const old=row.idempotencyKey?.startsWith(legacyPrefix),base=old?legacyPrefix:prefix,target=Number(row.idempotencyKey?.slice(base.length));
  if(!isPickupMilestoneTarget(target)||row.idempotencyKey!==`${base}${target}`||!Number.isSafeInteger(row.amountPaise)||row.amountPaise<=0||(old&&![LEGACY_PICKUP_MILESTONE_REWARD_PAISE,pickupMilestoneRewardPaise(target),target*1000].includes(row.amountPaise)))throw new Error('Milestone ledger integrity check failed.');
  if(old)original.set(target,row.amountPaise);else revised.set(target,row.amountPaise);
  credited.set(target,(credited.get(target)||0)+row.amountPaise);
 }
 for(const [target,total] of credited){
  const expected=pickupMilestoneRewardPaise(target);
  // Preserve both historical flat rewards and the former full-target policy.
  // Previously issued larger credits are never clawed back or awarded again.
  if(revised.has(target)&&(!original.has(target)||original.get(target)!==LEGACY_PICKUP_MILESTONE_REWARD_PAISE||![expected-original.get(target)!,target*1000-original.get(target)!].includes(revised.get(target)!)))throw new Error('Milestone ledger integrity check failed.');
  if(total>=expected)awarded.add(target);
 }
 return {customer,completed,awarded,credited,due:pickupMilestoneTargets(completed).filter(target=>!awarded.has(target))};
}
export async function reconcilePickupMilestonesTx(tx:any,customerId:string){
 const state=await readMilestoneState(tx,customerId);
 if(!state)return null;
 const {customer,completed,awarded,credited}=state;
 const due=state.due.slice(0,MAX_CREDITS_PER_TRANSACTION);
 let creditedPaise=0;
 if(due.length){
  const wallet=await tx.customerWallet.upsert({where:{customerId},update:{},create:{customerId,balance:0,balancePaise:0,paidBalancePaise:0}});
  await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${wallet.id}`;
  const locked=await tx.customerWallet.findUnique({where:{id:wallet.id}});
  if(!locked||!Number.isSafeInteger(locked.balancePaise)||locked.balancePaise<0)throw new Error('Wallet balance integrity check failed.');
  let balance=locked.balancePaise;
  for(const target of due){
   const previous=credited.get(target)||0,amountPaise=pickupMilestoneRewardPaise(target)-previous,amount=amountPaise/100;
   balance+=amountPaise;creditedPaise+=amountPaise;
   if(!Number.isSafeInteger(balance))throw new Error('Wallet balance integrity check failed.');
   const key=previous?upgradeKey(customerId,target):milestoneKey(customerId,target);
   const credit=await tx.walletTransaction.create({data:{walletId:wallet.id,customerId,type:PICKUP_MILESTONE_TYPE,status:'SUCCESS',amount,amountPaise,balanceAfter:balance/100,balanceAfterPaise:balance,referenceId:key,idempotencyKey:key,reason:`Pickup milestone${previous?' reward upgrade':''}: ${target} completed pickups`,bonusAmount:amount}});
   // This grant is funded by its own reward ledger entry, never by a gateway top-up.
   // The legacy required recharge pointer also references that same source entry.
   const grant=await tx.walletBonusGrant.create({data:{walletId:wallet.id,customerId,sourceTransactionId:credit.id,rechargeTransactionId:credit.id,grantedPaise:amountPaise,remainingPaise:amountPaise,status:'ACTIVE',expiresAt:null}});
   await tx.walletTransaction.update({where:{id:credit.id},data:{bonusGrantId:grant.id}});
   await tx.notification.create({data:{id:`${key}:notice`,userId:customer.userId,type:PICKUP_MILESTONE_TYPE,recipient:`customer:${customerId}`,content:previous?`Your ${target}-pickup milestone reward was upgraded: ₹${amount} added to your wallet.`:`Milestone unlocked! ${target} completed pickups earned ₹${amount} in your Junk It Out wallet.`,status:'SENT',provider:'IN_APP',deliveryStatus:'sent'}});
   awarded.add(target);credited.set(target,previous+amountPaise);
  }
  await tx.customerWallet.update({where:{id:wallet.id},data:{balancePaise:balance,balance:balance/100}});
 }
 return {progress:pickupMilestoneProgress(completed,[...awarded],[...credited.values()].reduce((sum,value)=>sum+value,0)),creditedCount:due.length,creditedPaise};
}
/** Retries transaction conflicts; every retry rechecks authoritative completion history. */
export async function reconcilePickupMilestones(client:any,customerId:string){
 // Most page opens have no newly earned target. Avoid a whole-database transaction
 // snapshot for those reads; every credit still rechecks eligibility inside its transaction.
 const state=await readMilestoneState(client,customerId);
 if(!state)return null;
 if(!state.due.length)return {progress:pickupMilestoneProgress(state.completed,[...state.awarded],[...state.credited.values()].reduce((sum,value)=>sum+value,0)),creditedCount:0,creditedPaise:0};
 for(let attempt=0;attempt<4;attempt++){
  try{return await client.$transaction((tx:any)=>reconcilePickupMilestonesTx(tx,customerId),{isolationLevel:'Serializable',maxWait:5000,timeout:15000});}
  catch(error:any){
   const conflict=['P2034','P2002'].includes(error?.code)||(error?.name==='DriverAdapterError'&&error?.cause?.kind==='TransactionWriteConflict');
   if(!conflict||attempt===3)throw error;
  }
 }
 throw new Error('Milestone reconciliation unavailable.');
}
export async function reconcileHistoricalPickupMilestones(client:any=db,options:{cursor?:string;limit?:number}={}){
 const limit=Math.max(1,Math.min(25,options.limit||10));
 const customers=await client.customer.findMany({where:{user:{role:'CUSTOMER',deletionDueAt:null},orders:{some:{status:{in:COMPLETED_PICKUP_STATUSES}}},...(options.cursor?{id:{gt:options.cursor}}:{})},orderBy:{id:'asc'},take:limit+1,select:{id:true}});
 let creditedCount=0,creditedPaise=0,processed=0,cursor=options.cursor||null;
 for(const customer of customers.slice(0,limit)){
  const result=await reconcilePickupMilestones(client,customer.id);
  creditedCount+=result?.creditedCount||0;creditedPaise+=result?.creditedPaise||0;processed++;
  if(result?.progress.catchupPending)return {processed,creditedCount,creditedPaise,hasMore:true,nextCursor:cursor};
  cursor=customer.id;
 }
 return {processed,creditedCount,creditedPaise,hasMore:customers.length>limit,nextCursor:customers.length>limit?cursor:null};
}
