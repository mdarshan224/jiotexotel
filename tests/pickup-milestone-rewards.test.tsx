import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({db:null as any,auth:null as any}));
vi.mock('@/lib/db',()=>({db:new Proxy({},{get(_t,p){const v=state.db[p];return typeof v==='function'?v.bind(state.db):v;}}),DEFAULT_TRANSACTION_OPTIONS:{maxWait:5000,timeout:15000}}));
vi.mock('@/lib/auth/middleware',()=>({getAuthUser:async()=>state.auth}));
vi.mock('@/lib/realtime',()=>({broadcaster:{broadcast:vi.fn()}}));
vi.mock('@/lib/utils/backgroundTask',()=>({runBackgroundTask:vi.fn()}));
import {NextRequest} from 'next/server';
import {createHmac} from 'node:crypto';
import {localDatabase} from './fixtures/localDatabase';
import {reconcilePickupMilestones,reconcilePickupMilestonesTx,reconcileHistoricalPickupMilestones,milestoneKey} from '@/lib/pickupMilestones';
import {pickupMilestoneTargets,pickupMilestoneProgress,pickupMilestoneRewardPaise} from '@/lib/pickupMilestonesPolicy';
import {spendWalletPaise,getSpendableWalletPaise,refundWalletOrderPayment} from '@/lib/wallet';
import {GET as progressRoute} from '@/app/api/customer/pickup-milestones/route';
import {GET as walletRoute} from '@/app/api/customer/wallet/route';
import {GET as readiness,POST as backfill} from '@/app/api/internal/jobs/pickup-milestones/route';
import {POST as complete} from '@/app/api/orders/[id]/complete/route';
import {initializePickupGate,customerPickupOtp,verifyPickupOtp} from '@/lib/orders/pickupOtp';
import {transitionOrder} from '@/lib/services/orderLifecycle';
import PickupMilestoneCard from '@/components/PickupMilestoneCard';
import MobilePickupMilestoneCard from '@/components/MobilePickupMilestoneCard';
import PickupTierRoadmap from '@/components/PickupTierRoadmap';
let d:Awaited<ReturnType<typeof localDatabase>>,c:any,address:any;
const auth=()=>({role:'CUSTOMER',userId:c.id,customerId:c.customer.id});
beforeEach(async()=>{vi.clearAllMocks();d=await localDatabase();state.db=d.prisma; c=await d.prisma.user.create({data:{name:'Reward fixture',phone:'7000000081',customer:{create:{}}},include:{customer:true}});address=await d.prisma.address.create({data:{userId:c.id,name:'Fixture',phone:c.phone,houseNo:'1',street:'Test',area:'BTM Layout',pincode:'560076',lat:12.91,lng:77.61}});state.auth=auth();});
afterEach(async()=>{vi.unstubAllEnvs();await d.close();});
let sequence=0;
async function orders(n:number,status='PICKUP_COMPLETED',customerId=c.customer.id,addressId=address.id){
 const values=Array.from({length:n},()=>({orderNumber:`REWARD-${sequence++}`,customerId,addressId,status,finalAmount:49,paymentStatus:'CAPTURED'}));
 if(values.length)await d.prisma.order.createMany({data:values});
}
const reconcile=()=>reconcilePickupMilestones(d.prisma,c.customer.id);
describe('Progressive pickup reward policy',()=>{
 it('uses the approved thresholds and rejects invalid counters',()=>{expect(pickupMilestoneTargets(21)).toEqual([3,6,10,15,21]);expect(pickupMilestoneTargets(2)).toEqual([]);expect(()=>pickupMilestoneTargets(-1)).toThrow();});
 it('credits only ₹10 for each additional pickup between milestones',()=>{expect([3,6,10,15,21,28].map(pickupMilestoneRewardPaise)).toEqual([3000,3000,4000,5000,6000,7000]);expect(()=>pickupMilestoneRewardPaise(4)).toThrow();});
 it('exposes exactly one active reward target, unlocking only after the preceding credit',()=>{expect(pickupMilestoneProgress(3,[]).milestones).toEqual([{target:3,state:'CURRENT',rewardAmount:30}]);expect(pickupMilestoneProgress(3,[3]).milestones).toEqual([{target:6,state:'CURRENT',rewardAmount:30}]);expect(pickupMilestoneProgress(6,[3,6]).milestones).toEqual([{target:10,state:'CURRENT',rewardAmount:40}]);});
 it('promotes tiers in order, keeps later tiers locked and continues rewards after Diamond',()=>{const targets=[0,3,6,10,15,21];expect(targets.map(target=>pickupMilestoneProgress(target,pickupMilestoneTargets(target)).currentTier.name)).toEqual(['Explorer','Starter','Silver','Gold','Platinum','Diamond']);const silver=pickupMilestoneProgress(8,[3,6]);expect(silver.tiers.map(tier=>tier.state)).toEqual(['ACHIEVED','ACHIEVED','CURRENT','NEXT','LOCKED','LOCKED']);expect(silver.tiers.every(tier=>!('target' in tier)&&!('rewardAmount' in tier))).toBe(true);expect(pickupMilestoneProgress(21,[3,6,10,15,21])).toMatchObject({nextTarget:28,nextRewardAmount:70,currentTier:{name:'Diamond'}});});
 it('renders the reference-style mobile card with only its active reward and a tier roadmap',()=>{const progress=pickupMilestoneProgress(4,[3]);const html=renderToStaticMarkup(<MobilePickupMilestoneCard progress={progress}/>);expect(html).toContain('Pick up. Level up.');expect(html).toContain('Starter tier');expect(html).toContain('Unlock ₹30');expect(html).toContain('View tiers');expect(html).toContain('/book?cart=1');expect(html).not.toContain('₹100');expect(html).not.toContain('₹150');const roadmap=renderToStaticMarkup(<PickupTierRoadmap progress={progress}/>);for(const tier of ['Explorer','Starter','Silver','Gold','Platinum','Diamond'])expect(roadmap).toContain(tier);expect(roadmap).toContain('aria-current="step"');expect(roadmap).not.toContain('₹100');expect(roadmap).not.toContain('₹150');});
 it('unlocks the next target only after the previous credit',()=>{expect(pickupMilestoneProgress(3,[])).toMatchObject({nextTarget:3,catchupPending:true});expect(pickupMilestoneProgress(3,[3])).toMatchObject({nextTarget:6,segmentCompleted:0,segmentTotal:3});expect(pickupMilestoneProgress(8,[3,6])).toMatchObject({nextTarget:10,remainingPickups:2,segmentCompleted:2,segmentTotal:4,totalRewardAmount:60});});
 it('renders clear mobile-friendly amounts, progress and locked future targets',()=>{const html=renderToStaticMarkup(<PickupMilestoneCard progress={pickupMilestoneProgress(4,[3])}/>);expect(html).toContain('₹30 earned');expect(html).toContain('2 more completed pickups');expect(html).toContain('₹30');expect(html).not.toContain('₹100');expect(html).not.toContain('₹150');expect(html).toContain('View tiers');expect(html).toContain('role="progressbar"');});
});
describe('Atomic milestone credits',()=>{
 it('excludes requested, failed, pending and cancelled pickups',async()=>{await orders(10,'BOOKING_RECEIVED');await orders(10,'CANCELLED');await orders(2);const r=await reconcile();expect(r?.progress.completedPickups).toBe(2);expect(r?.creditedCount).toBe(0);expect(await d.prisma.walletTransaction.count()).toBe(0);});
 it('credits exactly ₹30 on the third completion as spendable reward, without adding paid funds',async()=>{await orders(3);const r=await reconcile();expect(r).toMatchObject({creditedCount:1,creditedPaise:3000,progress:{nextTarget:6,totalRewardAmount:30}});const wallet=await d.prisma.customerWallet.findUniqueOrThrow({where:{customerId:c.customer.id}});expect(wallet).toMatchObject({balance:30,balancePaise:3000,paidBalancePaise:0});expect(await getSpendableWalletPaise(d.prisma,wallet)).toBe(3000);const grant=await d.prisma.walletBonusGrant.findFirstOrThrow();expect(grant).toMatchObject({grantedPaise:3000,remainingPaise:3000,expiresAt:null});expect(await d.prisma.notification.count({where:{type:'MILESTONE_REWARD'}})).toBe(1);});
 it('backfills all earned historical targets and continues 3,6,10,15,21',async()=>{await orders(10);expect((await reconcile())?.progress.totalRewardAmount).toBe(100);await orders(5);expect((await reconcile())?.progress.totalRewardAmount).toBe(150);await orders(6);expect((await reconcile())?.progress.totalRewardAmount).toBe(210);expect(await d.prisma.walletTransaction.count({where:{type:'MILESTONE_REWARD'}})).toBe(5);});
 it('counts each completed order once across legacy completion and settlement states',async()=>{await orders(1,'COMPLETED');await orders(1,'SETTLEMENT_COMPLETED');await orders(1);await reconcile();await d.prisma.order.updateMany({where:{customerId:c.customer.id},data:{status:'SETTLEMENT_COMPLETED'}});expect((await reconcile())?.creditedCount).toBe(0);expect(await d.prisma.walletTransaction.count()).toBe(1);});
 it('does not duplicate spent milestone rewards on retry',async()=>{await orders(3);await reconcile();await d.prisma.$transaction(tx=>spendWalletPaise(tx,{customerId:c.customer.id,amountPaise:3000,referenceId:'fixture-spend',reason:'Fixture'}));expect((await reconcile())?.creditedCount).toBe(0);expect((await d.prisma.customerWallet.findUniqueOrThrow({where:{customerId:c.customer.id}})).balancePaise).toBe(0);});
 it('preserves paid balances, spends rewards first and restores the original buckets on refund',async()=>{await d.prisma.customerWallet.create({data:{customerId:c.customer.id,balance:50,balancePaise:5000,paidBalancePaise:5000}});await orders(6);await reconcile();const order=await d.prisma.order.findFirstOrThrow();await d.prisma.$transaction(tx=>spendWalletPaise(tx,{customerId:c.customer.id,amountPaise:4000,referenceId:`order:${order.id}`,reason:'Fixture pickup'}));let wallet=await d.prisma.customerWallet.findUniqueOrThrow({where:{customerId:c.customer.id}});expect(wallet).toMatchObject({balancePaise:7000,paidBalancePaise:5000});await d.prisma.$transaction(tx=>refundWalletOrderPayment(tx,{customerId:c.customer.id,orderId:order.id,amount:40}));wallet=await d.prisma.customerWallet.findUniqueOrThrow({where:{customerId:c.customer.id}});expect(wallet).toMatchObject({balancePaise:11000,paidBalancePaise:5000});expect(await getSpendableWalletPaise(d.prisma,wallet)).toBe(11000);});
 it('rolls back the ledger and wallet if bonus allocation fails',async()=>{await orders(3);await expect(d.prisma.$transaction(tx=>reconcilePickupMilestonesTx(new Proxy(tx,{get(target,key){if(key==='walletBonusGrant')return new Proxy(target.walletBonusGrant,{get(delegate,method){return method==='create'?()=>{throw new Error('fixture failure');}:Reflect.get(delegate,method);}});return Reflect.get(target,key);}}),c.customer.id))).rejects.toThrow('fixture failure');expect(await d.prisma.walletTransaction.count()).toBe(0);expect(await d.prisma.customerWallet.count()).toBe(0);expect(await d.prisma.notification.count()).toBe(0);expect((await reconcile())?.creditedCount).toBe(1);});
 it('keeps concurrent customer opens from crediting the same milestone twice',async()=>{await orders(3);const other=d.other();try{await Promise.all([reconcile(),reconcilePickupMilestones(other,c.customer.id),reconcile()]);}finally{await other.$disconnect();}expect(await d.prisma.walletTransaction.count()).toBe(1);expect((await d.prisma.customerWallet.findUniqueOrThrow({where:{customerId:c.customer.id}})).balancePaise).toBe(3000);});
 it('does not grant rewards to an account awaiting deletion',async()=>{await orders(3);await d.prisma.user.update({where:{id:c.id},data:{deletionDueAt:new Date(Date.now()+86400000)}});expect(await reconcile()).toBeNull();expect(await d.prisma.walletTransaction.count()).toBe(0);});
 it('records a permanent unique key per customer and threshold',async()=>{await orders(3);await reconcile();expect((await d.prisma.walletTransaction.findFirstOrThrow()).idempotencyKey).toBe(milestoneKey(c.customer.id,3));});
 it('avoids write transactions on ordinary account opens with no newly earned target',async()=>{await orders(3);await reconcile();const transaction=vi.fn(()=>{throw new Error('Unexpected transaction');});const client=new Proxy(d.prisma,{get(target,key){return key==='$transaction'?transaction:Reflect.get(target,key);}});expect((await reconcilePickupMilestones(client,c.customer.id))?.creditedCount).toBe(0);expect(transaction).not.toHaveBeenCalled();});
 it('preserves previous flat rewards and never reissues spent bonuses',async()=>{
  await orders(6);
  const wallet=await d.prisma.customerWallet.create({data:{customerId:c.customer.id,balance:60,balancePaise:6000,paidBalancePaise:0}});
  const oldIds:string[]=[];
  for(const target of [3,6]){
   const key=`pickup-milestone:v1:${c.customer.id}:${target}`;
   const row=await d.prisma.walletTransaction.create({data:{walletId:wallet.id,customerId:c.customer.id,type:'MILESTONE_REWARD',status:'SUCCESS',amount:30,amountPaise:3000,balanceAfter:target===3?30:60,balanceAfterPaise:target===3?3000:6000,bonusAmount:30,idempotencyKey:key,referenceId:key}});oldIds.push(row.id);
   const grant=await d.prisma.walletBonusGrant.create({data:{walletId:wallet.id,customerId:c.customer.id,sourceTransactionId:row.id,rechargeTransactionId:row.id,grantedPaise:3000,remainingPaise:3000,status:'ACTIVE'}});await d.prisma.walletTransaction.update({where:{id:row.id},data:{bonusGrantId:grant.id}});
  }
  await d.prisma.$transaction(tx=>spendWalletPaise(tx,{customerId:c.customer.id,amountPaise:6000,referenceId:'old-rewards-spend',reason:'Fixture'}));
  expect(await reconcile()).toMatchObject({creditedCount:0,creditedPaise:0,progress:{nextTarget:10,nextRewardAmount:40,totalRewardAmount:60,currentTier:{name:'Silver'}}});
  expect((await d.prisma.customerWallet.findUniqueOrThrow({where:{id:wallet.id}})).balancePaise).toBe(0);
  expect(await d.prisma.walletTransaction.findMany({where:{id:{in:oldIds}},select:{amountPaise:true}})).toEqual([{amountPaise:3000},{amountPaise:3000}]);
  expect((await reconcile())?.creditedCount).toBe(0);
 });
 it('does not double credit an old 3-pickup reward during the policy upgrade',async()=>{await orders(3);await reconcile();const row=await d.prisma.walletTransaction.findFirstOrThrow();await d.prisma.walletTransaction.update({where:{id:row.id},data:{idempotencyKey:`pickup-milestone:v1:${c.customer.id}:3`}});expect((await reconcile())?.creditedCount).toBe(0);expect(await d.prisma.walletTransaction.count()).toBe(1);});
 it('adds only another ₹30 on the sixth completed pickup, totalling ₹60',async()=>{await orders(3);expect((await reconcile())?.creditedPaise).toBe(3000);await orders(2);expect((await reconcile())?.creditedCount).toBe(0);await orders(1);expect(await reconcile()).toMatchObject({creditedCount:1,creditedPaise:3000,progress:{totalRewardAmount:60,nextTarget:10,nextRewardAmount:40}});expect((await d.prisma.customerWallet.findUniqueOrThrow({where:{customerId:c.customer.id}})).balancePaise).toBe(6000);expect((await reconcile())?.creditedCount).toBe(0);});
 it('preserves a previously issued full-target reward and uses the corrected amount for the next milestone',async()=>{
  await orders(6);await reconcile();
  const row=await d.prisma.walletTransaction.findUniqueOrThrow({where:{idempotencyKey:milestoneKey(c.customer.id,6)}});
  await d.prisma.walletTransaction.update({where:{id:row.id},data:{amount:60,amountPaise:6000,bonusAmount:60}});
  await d.prisma.walletBonusGrant.update({where:{id:row.bonusGrantId!},data:{grantedPaise:6000,remainingPaise:6000}});
  await d.prisma.customerWallet.update({where:{customerId:c.customer.id},data:{balance:90,balancePaise:9000}});
  expect(await reconcile()).toMatchObject({creditedCount:0,progress:{totalRewardAmount:90,nextTarget:10,nextRewardAmount:40}});
  await orders(4);expect((await reconcile())?.creditedPaise).toBe(4000);
  expect((await d.prisma.customerWallet.findUniqueOrThrow({where:{customerId:c.customer.id}})).balancePaise).toBe(13000);
  expect((await d.prisma.walletTransaction.findUniqueOrThrow({where:{id:row.id}})).amountPaise).toBe(6000);
 });
 it('fills only the shortfall of an old flat reward at the tenth pickup and never repeats it',async()=>{
  await orders(10);await reconcile();const row=await d.prisma.walletTransaction.findUniqueOrThrow({where:{idempotencyKey:milestoneKey(c.customer.id,10)}});
  await d.prisma.walletTransaction.update({where:{id:row.id},data:{amount:30,amountPaise:3000,bonusAmount:30}});
  await d.prisma.walletBonusGrant.update({where:{id:row.bonusGrantId!},data:{grantedPaise:3000,remainingPaise:3000}});
  await d.prisma.customerWallet.update({where:{customerId:c.customer.id},data:{balance:90,balancePaise:9000}});
  expect(await reconcile()).toMatchObject({creditedCount:1,creditedPaise:1000,progress:{totalRewardAmount:100,nextTarget:15,nextRewardAmount:50}});
  expect((await reconcile())?.creditedCount).toBe(0);
 });
});
describe('Completion and account integrations',()=>{
 async function arrived(){
  await orders(2);
  const a=await d.prisma.user.create({data:{name:'Agent',phone:'7000000082',role:'AGENT',agent:{create:{status:'ASSIGNED'}}},include:{agent:true}});
  const category=await d.prisma.wasteCategory.create({data:{name:'Fixture material',description:'Test',type:'RECYCLABLE_BUY',pricePerKg:20}});
  const order=await d.prisma.order.create({data:{orderNumber:`CURRENT-${sequence++}`,customerId:c.customer.id,addressId:address.id,agentId:a.agent!.id,status:'AGENT_ARRIVED',estimatedTotal:100,finalAmount:100,pickupCharge:0,paymentStatus:'CAPTURED',items:{create:{categoryId:category.id,estimatedWeight:5,ratePerKg:20,subtotal:100}}},include:{items:true}});
  await d.prisma.$transaction(tx=>initializePickupGate(tx,order.id));const otp=await customerPickupOtp(d.prisma,order.id,c.customer.id);await verifyPickupOtp(d.prisma,order.id,a.agent!.id,otp.code!);return {a,order};
 }
 it('credits on the third agent-completed pickup and never repeats on completion retries',async()=>{const {a,order}=await arrived();state.auth={role:'AGENT',agentId:a.agent!.id,userId:a.id};const request=()=>new NextRequest('http://localhost/api/orders/'+order.id+'/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actualWeights:[{itemId:order.items[0].id,actualWeight:5}]})});expect((await complete(request(),{params:Promise.resolve({id:order.id})})).status).toBe(200);expect((await complete(request(),{params:Promise.resolve({id:order.id})})).status).toBe(200);expect(await d.prisma.walletTransaction.count({where:{type:'MILESTONE_REWARD'}})).toBe(1);});
 it('credits an admin lifecycle completion and ignores a later settlement of that same order',async()=>{const {order}=await arrived();await d.prisma.order.update({where:{id:order.id},data:{status:'WEIGHING'}});expect((await transitionOrder({orderId:order.id,expectedStatus:'WEIGHING',newStatus:'PICKUP_COMPLETED'})).changed).toBe(true);expect((await transitionOrder({orderId:order.id,expectedStatus:'PICKUP_COMPLETED',newStatus:'SETTLEMENT_COMPLETED'})).changed).toBe(true);expect(await d.prisma.walletTransaction.count({where:{type:'MILESTONE_REWARD'}})).toBe(1);});
 it('returns earned wallet balance and progress together',async()=>{await orders(3);const response=await walletRoute(new NextRequest('http://localhost/api/customer/wallet'));expect(response.status).toBe(200);const json=await response.json();expect(json.data.wallet.availableBalance).toBe(30);expect(json.data.milestones.nextTarget).toBe(6);expect(response.headers.get('Cache-Control')).toContain('no-store');});
 it('requires customer auth and ignores customerId/count/target inputs',async()=>{state.auth=null;expect((await progressRoute(new NextRequest('http://localhost/api/customer/pickup-milestones'))).status).toBe(401);state.auth={role:'AGENT',userId:c.id,customerId:c.customer.id};expect((await progressRoute(new NextRequest('http://localhost/api/customer/pickup-milestones'))).status).toBe(401);state.auth=auth();const r=await progressRoute(new NextRequest('http://localhost/api/customer/pickup-milestones?customerId=other&completed=100&target=3'));expect((await r.json()).data.completedPickups).toBe(0);expect(await d.prisma.walletTransaction.count()).toBe(0);});
});
describe('Historical reward rollout job',()=>{
 const request=(method='POST',body={})=>new NextRequest('http://localhost/api/internal/jobs/pickup-milestones',{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+createHmac('sha256',process.env.JWT_SECRET!.trim()).update('junkitout:pickup-milestones:v1').digest('hex')},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 it('rejects unauthenticated writers and keeps readiness read-only',async()=>{await orders(6);expect((await backfill(new NextRequest('http://localhost/api/internal/jobs/pickup-milestones',{method:'POST'}))).status).toBe(401);expect((await readiness(request('GET'))).status).toBe(200);expect(await d.prisma.walletTransaction.count()).toBe(0);});
 it('grants old-order rewards once through the authenticated job and can be replayed',async()=>{await orders(6);const r=await backfill(request());expect(r.status).toBe(200);expect((await r.json()).data).toMatchObject({creditedCount:2,creditedPaise:6000,hasMore:false});expect((await (await backfill(request())).json()).data.creditedCount).toBe(0);});
 it('safely continues a customer with more milestones than one batch can credit',async()=>{await orders(378);const first=await reconcileHistoricalPickupMilestones(d.prisma);expect(first).toMatchObject({creditedCount:25,hasMore:true,nextCursor:null});const second=await reconcileHistoricalPickupMilestones(d.prisma);expect(second).toMatchObject({creditedCount:1,hasMore:false});expect((await reconcile())?.progress).toMatchObject({nextTarget:406,totalRewardAmount:3780,catchupPending:false});expect((await d.prisma.customerWallet.findUniqueOrThrow({where:{customerId:c.customer.id}})).balancePaise).toBe(378000);});
 it('paginates eligible customers and never adds a zero-history reward',async()=>{await orders(3);const other=await d.prisma.user.create({data:{name:'Second',phone:'7000000083',customer:{create:{}}},include:{customer:true}});await orders(6,'PICKUP_COMPLETED',other.customer!.id);let cursor: string|undefined,total=0;for(let i=0;i<5;i++){const result=await reconcileHistoricalPickupMilestones(d.prisma,{cursor,limit:1});total+=result.creditedCount;if(!result.hasMore)break;cursor=result.nextCursor||undefined;}expect(total).toBe(3);expect(await d.prisma.walletTransaction.count({where:{type:'MILESTONE_REWARD'}})).toBe(3);});
});
