import {initializePickupGate,customerPickupOtp,verifyPickupOtp} from '@/lib/orders/pickupOtp';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null as any,auth:null as any}));
vi.mock('@/lib/db',()=>({DEFAULT_TRANSACTION_OPTIONS:{maxWait:5000,timeout:15000},db:new Proxy({},{get(_t,p){const v=state.db[p];return typeof v==='function'?v.bind(state.db):v;}})}));
vi.mock('@/lib/auth/middleware',()=>({getAuthUser:async()=>state.auth,requireAdminUser:(a:any)=>['ADMIN','SUPER_ADMIN'].includes(a?.role)?a:null}));
vi.mock('@/lib/realtime',()=>({broadcaster:{broadcast:vi.fn()}}));
vi.mock('@/lib/utils/backgroundTask',()=>({runBackgroundTask:vi.fn()}));
import {localDatabase} from './fixtures/localDatabase';
import {splitPickupEarnings,recordPickupEarnings} from '@/lib/agentEarnings';
import {GET as orderDetail} from '@/app/api/orders/[id]/route';
import {GET as receipt} from '@/app/api/orders/[id]/receipt/route';
import {POST as adminStatus} from '@/app/api/orders/[id]/status/route';
import {POST as complete} from '@/app/api/orders/[id]/complete/route';
let d:Awaited<ReturnType<typeof localDatabase>>,order:any;
beforeEach(async()=>{
 d=await localDatabase();state.db=d.prisma;
 const c=await d.prisma.user.create({data:{name:'Fixture customer',phone:'7000000011',customer:{create:{}}},include:{customer:true}});
 const a=await d.prisma.user.create({data:{name:'Fixture agent',phone:'7000000012',role:'AGENT',agent:{create:{}}},include:{agent:true}});
 state.auth={role:'AGENT',agentId:a.agent!.id,userId:a.id};
 const address=await d.prisma.address.create({data:{userId:c.id,name:'Home',phone:c.phone,houseNo:'1',street:'Test',area:'BTM Layout',pincode:'560076',lat:12.9,lng:77.6}});
 const category=await d.prisma.wasteCategory.create({data:{name:'Fixture material',description:'Test',type:'RECYCLABLE_BUY',pricePerKg:20}});
 order=await d.prisma.order.create({data:{orderNumber:'JIO-EARNINGS-TEST',customerId:c.customer!.id,agentId:a.agent!.id,addressId:address.id,status:'AGENT_ARRIVED',estimatedTotal:100,finalAmount:100,pickupCharge:0,items:{create:{categoryId:category.id,estimatedWeight:5,ratePerKg:20,subtotal:100}}},include:{items:true}});
 await d.prisma.$transaction(tx=>initializePickupGate(tx,order.id));
 const code=await customerPickupOtp(d.prisma,order.id,c.customer!.id);await verifyPickupOtp(d.prisma,order.id,a.agent!.id,code.code);
});
afterEach(async()=>{await d.close();});
describe('65/35 pickup earnings and GST',()=>{
 it('keeps GST within the company share, with every paise accounted for',()=>{
  expect(splitPickupEarnings(100,.18)).toMatchObject({grossPaise:10000,agentPaise:6500,companyGrossPaise:3500,serviceFeePaise:2966,gstPaise:534,cgstPaise:267,sgstPaise:267});
  for(let paise=0;paise<5000;paise++){const s=splitPickupEarnings(paise/100,.18);expect(s.agentPaise+s.serviceFeePaise+s.gstPaise).toBe(paise);expect(s.cgstPaise+s.sgstPaise+s.igstPaise).toBe(s.gstPaise);}
  expect(splitPickupEarnings(100,.18,true)).toMatchObject({cgstPaise:0,sgstPaise:0,igstPaise:534});
 });
 it('completes a pickup, credits 65% once, and persists tax only on company service fees',async()=>{
  const request=()=>new Request('http://localhost/api/orders/'+order.id+'/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actualWeights:[{itemId:order.items[0].id,actualWeight:5}]})}) as any;
  const first=await complete(request(),{params:Promise.resolve({id:order.id})});expect(first.status).toBe(200);const body=await first.json();expect(JSON.stringify(body)).not.toContain('7000000011');expect(body.data.viewerRole).toBe('AGENT');
  expect((await complete(request(),{params:Promise.resolve({id:order.id})})).status).toBe(200);
  expect((await d.prisma.agentWallet.findUniqueOrThrow({where:{agentId:state.auth.agentId}})).balance).toBe(65);
  expect(await d.prisma.agentWalletTransaction.count()).toBe(1);expect(await d.prisma.pickupEarning.count()).toBe(1);
  const invoice=await d.prisma.invoice.findFirstOrThrow();expect(invoice.totalAmount).toBe(100);expect(invoice.serviceFee).toBe(29.66);expect(invoice.gstAmount).toBe(5.34);
 });
 it('credits an admin-completed pickup through the guarded lifecycle transaction exactly once',async()=>{
  state.auth={...state.auth,role:'ADMIN'};await d.prisma.order.update({where:{id:order.id},data:{status:'WEIGHING'}});
  const request=()=>new Request('http://localhost/api/orders/'+order.id+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newStatus:'PICKUP_COMPLETED'})});
  expect((await adminStatus(request(),{params:Promise.resolve({id:order.id})})).status).toBe(200);expect((await adminStatus(request(),{params:Promise.resolve({id:order.id})})).status).toBe(200);expect((await d.prisma.agentWallet.findUniqueOrThrow({where:{agentId:order.agentId}})).balance).toBe(65);expect(await d.prisma.agentWalletTransaction.count()).toBe(1);
 });
 it('returns a renderable phone-free agent detail and denies customer receipts',async()=>{
  const r=await orderDetail(new Request('http://localhost/api/orders/'+order.id) as any,{params:Promise.resolve({id:order.id})});expect(r.status).toBe(200);const j=await r.json();expect(j.data.items[0].subtotal).toBe(100);expect(j.data.viewerRole).toBe('AGENT');expect(JSON.stringify(j)).not.toContain('7000000011');expect((await receipt(new Request('http://localhost/api/orders/'+order.id+'/receipt') as any,{params:Promise.resolve({id:order.id})})).status).toBe(403);
 });
 it('replays a ledger credit without changing balance or immutable allocation',async()=>{
  const input={agentId:state.auth.agentId,orderId:order.id,orderNumber:order.orderNumber,amount:80,gstRate:.18};
  await d.prisma.$transaction(tx=>recordPickupEarnings(tx,input));
  await d.prisma.$transaction(tx=>recordPickupEarnings(tx,{...input,amount:200}));
  expect((await d.prisma.agentWallet.findUniqueOrThrow({where:{agentId:state.auth.agentId}})).balance).toBe(52);
  expect((await d.prisma.pickupEarning.findFirstOrThrow()).grossPaise).toBe(8000);
 });
 it('rolls back the allocation and wallet credit with a failed completion transaction',async()=>{
  await expect(d.prisma.$transaction(async tx=>{await recordPickupEarnings(tx,{agentId:state.auth.agentId,orderId:order.id,orderNumber:order.orderNumber,amount:80});throw new Error('fail');})).rejects.toThrow('fail');
  expect(await d.prisma.pickupEarning.count()).toBe(0);expect(await d.prisma.agentWalletTransaction.count()).toBe(0);
 });
 it('backfills missed completed pickups once, preserves manual balance and leaves old invoices untouched',async()=>{
  await d.prisma.order.update({where:{id:order.id},data:{status:'PICKUP_COMPLETED',finalAmount:80}});
  await d.prisma.agentWallet.create({data:{agentId:state.auth.agentId,balance:25}});
  await d.prisma.invoice.create({data:{orderId:order.id,invoiceNumber:'OLD',totalAmount:80,pdfDataJson:'{}'}});
  const sql=readFileSync('drizzle/0006_agent_earnings_reconciliation.sql','utf8');d.sqlite.exec(sql);d.sqlite.exec(sql);
  expect((await d.prisma.agentWallet.findUniqueOrThrow({where:{agentId:state.auth.agentId}})).balance).toBe(77);
  expect(await d.prisma.agentWalletTransaction.count()).toBe(1);expect((await d.prisma.agentWalletTransaction.findFirstOrThrow()).balanceAfter).toBe(77);
  expect((await d.prisma.invoice.findFirstOrThrow()).serviceFee).toBe(0);
 });
 it('does not reconcile unfinished or cancelled pickups',async()=>{
  const sql=readFileSync('drizzle/0006_agent_earnings_reconciliation.sql','utf8');d.sqlite.exec(sql);expect(await d.prisma.agentWalletTransaction.count()).toBe(0);
  await d.prisma.order.update({where:{id:order.id},data:{status:'CANCELLED'}});d.sqlite.exec(sql);expect(await d.prisma.agentWalletTransaction.count()).toBe(0);
 });
});
