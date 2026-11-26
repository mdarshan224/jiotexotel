import {db} from '@/lib/db';
import {COMPLETED_PICKUP_STATUSES,PICKUP_MILESTONE_REWARD_PAISE,PICKUP_MILESTONE_TYPE,pickupMilestoneProgress,pickupMilestoneTargets} from './pickupMilestonesPolicy';
export const milestoneKey=(customerId:string,target:number)=>`pickup-milestone:v1:${customerId}:${target}`;
const MAX_CREDITS_PER_TRANSACTION=25;
/** Award earned thresholds, wallet balance, bonus allocation, ledger and notice atomically.
 * Historical pickups are included. The unique ledger idempotency key is the durable reward record.
 */
async function readMilestoneState(tx:any,customerId:string){
 const customer=await tx.customer.findUnique({where:{id:customerId},select:{id:true,userId:true,user:{select:{role:true,deletionDueAt:true}}}});
 if(!customer||customer.user.role!=='CUSTOMER'||customer.user.deletionDueAt)return null;
 const completed=await tx.order.count({where:{customerId,status:{in:COMPLETED_PICKUP_STATUSES}}});
 const prefix=`pickup-milestone:v1:${customerId}:`;
 const rows=await tx.walletTransaction.findMany({where:{customerId,type:PICKUP_MILESTONE_TYPE,status:'SUCCESS',idempotencyKey:{startsWith:prefix}},select:{id:true,idempotencyKey:true,amountPaise:true},orderBy:{createdAt:'asc'}});
 const awarded=new Set<number>();
 for(const row of rows){
  const target=Number(row.idempotencyKey?.slice(prefix.length));
  const root=(Math.sqrt(8*target+1)-1)/2;
  if(!Number.isSafeInteger(target)||target<3||!Number.isInteger(root)||row.amountPaise!==PICKUP_MILESTONE_REWARD_PAISE)throw new Error('Milestone ledger integrity check failed.');
  awarded.add(target);
 }
 return {customer,completed,awarded,due:pickupMilestoneTargets(completed).filter(target=>!awarded.has(target))};
}
export async function reconcilePickupMilestonesTx(tx:any,customerId:string){
 const state=await readMilestoneState(tx,customerId);
 if(!state)return null;
 const {customer,completed,awarded}=state;
 const due=state.due.slice(0,MAX_CREDITS_PER_TRANSACTION);
 if(due.length){
  const wallet=await tx.customerWallet.upsert({where:{customerId},update:{},create:{customerId,balance:0,balancePaise:0,paidBalancePaise:0}});
  await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${wallet.id}`;
  const locked=await tx.customerWallet.findUnique({where:{id:wallet.id}});
  if(!locked||!Number.isSafeInteger(locked.balancePaise)||locked.balancePaise<0)throw new Error('Wallet balance integrity check failed.');
  let balance=locked.balancePaise;
  for(const target of due){
   balance+=PICKUP_MILESTONE_REWARD_PAISE;
   const key=milestoneKey(customerId,target);
   const credit=await tx.walletTransaction.create({data:{walletId:wallet.id,customerId,type:PICKUP_MILESTONE_TYPE,status:'SUCCESS',amount:30,amountPaise:PICKUP_MILESTONE_REWARD_PAISE,balanceAfter:balance/100,balanceAfterPaise:balance,referenceId:key,idempotencyKey:key,reason:`Pickup milestone: ${target} completed pickups`,bonusAmount:30}});
   // This grant is funded by its own reward ledger entry, never by a gateway top-up.
   // The legacy required recharge pointer also references that same source entry.
   const grant=await tx.walletBonusGrant.create({data:{walletId:wallet.id,customerId,sourceTransactionId:credit.id,rechargeTransactionId:credit.id,grantedPaise:PICKUP_MILESTONE_REWARD_PAISE,remainingPaise:PICKUP_MILESTONE_REWARD_PAISE,status:'ACTIVE',expiresAt:null}});
   await tx.walletTransaction.update({where:{id:credit.id},data:{bonusGrantId:grant.id}});
   await tx.notification.create({data:{id:`${key}:notice`,userId:customer.userId,type:PICKUP_MILESTONE_TYPE,recipient:`customer:${customerId}`,content:`Milestone unlocked! ${target} completed pickups earned ₹30 in your Junk It Out wallet.`,status:'SENT',provider:'IN_APP',deliveryStatus:'sent'}});
   awarded.add(target);
  }
  await tx.customerWallet.update({where:{id:wallet.id},data:{balancePaise:balance,balance:balance/100}});
 }
 return {progress:pickupMilestoneProgress(completed,[...awarded]),creditedCount:due.length,creditedPaise:due.length*PICKUP_MILESTONE_REWARD_PAISE};
}
/** Retries transaction conflicts; every retry rechecks authoritative completion history. */
export async function reconcilePickupMilestones(client:any,customerId:string){
 // Most page opens have no newly earned target. Avoid a whole-database transaction
 // snapshot for those reads; every credit still rechecks eligibility inside its transaction.
 const state=await readMilestoneState(client,customerId);
 if(!state)return null;
 if(!state.due.length)return {progress:pickupMilestoneProgress(state.completed,[...state.awarded]),creditedCount:0,creditedPaise:0};
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
