import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({db:null as any,customerId:'',userId:'',dispatch:vi.fn()}));
vi.mock('@/lib/db',()=>({db:new Proxy({},{get(_t,p){const v=state.db[p];return typeof v==='function'?v.bind(state.db):v;}})}));
vi.mock('@/lib/auth/middleware',()=>({getAuthUser:async()=>({role:'CUSTOMER',customerId:state.customerId,userId:state.userId})}));
vi.mock('@/lib/payments/verification',()=>({dispatchPaidOrderToAgents:state.dispatch}));
vi.mock('@/lib/realtime',()=>({broadcaster:{publish:vi.fn(),broadcast:vi.fn()}}));
import {localDatabase} from './fixtures/localDatabase';
import {POST as payWallet} from '@/app/api/payments/wallet/route';
import {processApprovedRefund,createRefundRequestForCapturedPayment} from '@/lib/payments/refundRequests';
import {POST as cancelOrder} from '@/app/api/orders/[id]/cancel/route';
let d:Awaited<ReturnType<typeof localDatabase>>,order:any,wallet:any;
beforeEach(async()=>{
 vi.clearAllMocks();d=await localDatabase();state.db=d.prisma;
 const u=await d.prisma.user.create({data:{name:'Audit route fixture',phone:'7000000002',customer:{create:{}}},include:{customer:true}});state.userId=u.id;state.customerId=u.customer!.id;
 const address=await d.prisma.address.create({data:{userId:u.id,name:'Audit',phone:'7000000002',houseNo:'1',street:'Test',area:'BTM Layout',pincode:'560076',lat:12.91,lng:77.61}});
 wallet=await d.prisma.customerWallet.create({data:{customerId:state.customerId,balance:100,balancePaise:10000,paidBalancePaise:10000}});
 order=await d.prisma.order.create({data:{orderNumber:'JIO-AUDIT',customerId:state.customerId,addressId:address.id,financialDirection:'CUSTOMER_PAYS',finalAmount:49,paymentStatus:'PENDING'}});
});
afterEach(async()=>{await d.close();});
function req(id=order.id){return new Request('http://localhost/api/payments/wallet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:id})}) as any;}
describe('Wallet/online route separation',()=>{
 it('settles wallet orders once and dispatches after capture',async()=>{
  expect((await payWallet(req())).status).toBe(200);expect((await payWallet(req())).status).toBe(200);
  expect((await d.prisma.customerWallet.findUniqueOrThrow({where:{id:wallet.id}})).balancePaise).toBe(5100);
  expect(await d.prisma.walletTransaction.count({where:{type:'WALLET_DEBIT'}})).toBe(1);
  expect((await d.prisma.payment.findFirstOrThrow({where:{orderId:order.id}})).status).toBe('CAPTURED');
  expect(state.dispatch).toHaveBeenCalledWith(order.id);
 });
 it.each(['RAZORPAY','WALLET'])('never debits when a gateway order already exists, even if mislabelled %s',async gateway=>{
  await d.prisma.payment.create({data:{orderId:order.id,amount:49,direction:'CUSTOMER_PAYS',gateway,status:'INITIATED',gatewayOrderId:'order_existing'}});
  expect((await payWallet(req())).status).toBe(409);expect(await d.prisma.walletTransaction.count()).toBe(0);
  expect((await d.prisma.payment.findFirstOrThrow({where:{orderId:order.id}})).gatewayOrderId).toBe('order_existing');
 });
 it('returns actionable insufficient-funds feedback and rolls back all payment writes',async()=>{
  await d.prisma.customerWallet.update({where:{id:wallet.id},data:{balance:10,balancePaise:1000,paidBalancePaise:1000}});
  const r=await payWallet(req());expect(r.status).toBe(400);expect((await r.json()).message).toMatch(/Insufficient/);
  expect(await d.prisma.payment.count()).toBe(0);expect(await d.prisma.walletTransaction.count()).toBe(0);
 });
 it('does not debit another customer or a cancelled booking',async()=>{
  state.customerId='not-owner';expect((await payWallet(req())).status).toBe(404);state.customerId=order.customerId;
  await d.prisma.order.update({where:{id:order.id},data:{status:'CANCELLED'}});expect((await payWallet(req())).status).toBe(400);expect(await d.prisma.walletTransaction.count()).toBe(0);
 });
 it('refunds an approved wallet cancellation locally without invoking the external gateway',async()=>{
  await payWallet(req());
  const request=await d.prisma.$transaction(tx=>createRefundRequestForCapturedPayment(tx,order.id,state.userId));
  await processApprovedRefund(request!.id,state.userId,'approve');
  expect((await d.prisma.customerWallet.findUniqueOrThrow({where:{id:wallet.id}})).balancePaise).toBe(10000);
  expect((await d.prisma.order.findUniqueOrThrow({where:{id:order.id}})).paymentStatus).toBe('REFUNDED');
  expect(await d.prisma.walletTransaction.count({where:{type:'REFUND'}})).toBe(1);
  await expect(processApprovedRefund(request!.id,state.userId,'approve')).rejects.toThrow(/already/);
 });
 it('rejects customer cancellation after placement and preserves the reserved subscription pickup',async()=>{
  const offer=await d.prisma.subscriptionOffer.create({data:{name:'Covered pass',description:'Local fixture',price:99,benefitsJson:'[]'}});
  const sub=await d.prisma.customerSubscription.create({data:{customerId:state.customerId,offerId:offer.id,startDate:new Date(),expiryDate:new Date(Date.now()+86400000),pickupsUsed:1,pickupsAllowed:4}});
  await d.prisma.order.update({where:{id:order.id},data:{subscriptionId:sub.id,finalAmount:0,paymentStatus:'CAPTURED'}});
  const request=()=>new Request('http://localhost/api/orders/'+order.id+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cancellationReason:'Audit fixture cancellation'})}) as any;
  const r=await cancelOrder(request(),{params:Promise.resolve({id:order.id})});expect(r.status).toBe(403);
  await cancelOrder(request(),{params:Promise.resolve({id:order.id})});
  expect((await d.prisma.customerSubscription.findUniqueOrThrow({where:{id:sub.id}})).pickupsUsed).toBe(1);
  expect(await d.prisma.refundRequest.count()).toBe(0);
 });
});
