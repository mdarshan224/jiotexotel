import {approveFixtureAgent} from './fixtures/approvedKyc';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({db:null as any,auth:null as any,recovery:vi.fn(),send:vi.fn()}));
vi.mock('@/lib/db',()=>({db:new Proxy({},{get(_t,p){const v=state.db[p];return typeof v==='function'?v.bind(state.db):v;}})}));
vi.mock('@/lib/auth/middleware',()=>({getAuthUser:async()=>state.auth}));
vi.mock('@/lib/services/whatsappService',()=>({sendAgentPickupOffer:state.send}));
vi.mock('@/lib/realtime',()=>({broadcaster:{broadcast:vi.fn()}}));
vi.mock('@/lib/payments/dispatchRecovery',()=>({reconcileUndispatchedPaidOrders:state.recovery}));
vi.mock('@/lib/utils/backgroundTask',()=>({runBackgroundTask:vi.fn()}));
import {dispatchPaidOrderToAgents} from '@/lib/payments/verification';
import {broadcaster} from '@/lib/realtime';
import {NextRequest} from 'next/server';
import {localDatabase} from './fixtures/localDatabase';
import {PATCH as status} from '@/app/api/agent/status/route';
import {POST as location} from '@/app/api/agent/location/route';
import {GET as details} from '@/app/api/orders/[id]/route';
import {GET as orders} from '@/app/api/orders/route';
import {POST as accept} from '@/app/api/orders/[id]/accept/route';
import {executeAgentAcceptTransaction,findEligibleAgentsForServiceArea,selectNearestEligibleAgent} from '@/lib/services/agentService';
import {hasFreshAgentPresence,parseAgentFix,assertPlausibleMovement} from '@/lib/agents/locationPolicy';
import {verifyBengaluruLocality} from '@/lib/agents/verifyCity';
import {getAgentPickupNotificationId} from '@/lib/services/agentBookingNotification';
let d:Awaited<ReturnType<typeof localDatabase>>,a:any,b:any,order:any;
const fix=(extra={})=>({lat:12.916,lng:77.61,accuracy:15,capturedAt:Date.now(),...extra});
const req=(body:any,method='POST',path='/api/agent/location',origin='https://junkitout.in')=>new NextRequest('http://localhost'+path,{method,headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
const validGoogle=()=>new Response(JSON.stringify({status:'OK',results:[{address_components:[{types:['locality'],long_name:'Bengaluru'},{types:['country'],short_name:'IN'}]}]}));
function presence(lat=12.916,lng=77.61){return {status:'AVAILABLE',currentLat:lat,currentLng:lng,locationAccuracy:15,locationCapturedAt:new Date(Date.now()-1000),locationReceivedAt:new Date(),bengaluruVerifiedAt:new Date(),bengaluruVerifiedLat:lat,bengaluruVerifiedLng:lng};}
beforeEach(async()=>{
 vi.clearAllMocks();state.send.mockResolvedValue({success:true,requestId:'fixture'});d=await localDatabase();state.db=d.prisma;
 a=await d.prisma.user.create({data:{phone:'7000000091',name:'Near',role:'AGENT',agent:{create:{status:'OFFLINE',serviceAreas:'all'}}},include:{agent:true}});
 b=await d.prisma.user.create({data:{phone:'7000000092',name:'Far',role:'AGENT',agent:{create:{status:'OFFLINE',serviceAreas:'all'}}},include:{agent:true}});
 await approveFixtureAgent(d.prisma,a.agent.id);await approveFixtureAgent(d.prisma,b.agent.id);
 const c=await d.prisma.user.create({data:{phone:'7000000093',name:'Customer',customer:{create:{}}},include:{customer:true}});
 const addr=await d.prisma.address.create({data:{userId:c.id,name:'Pickup',phone:c.phone,houseNo:'1',street:'Test',area:'BTM Layout',lat:12.9161,lng:77.6101,pincode:'560076'}});
 order=await d.prisma.order.create({data:{orderNumber:'JIO-LOCATION',customerId:c.customer!.id,addressId:addr.id,status:'BOOKING_RECEIVED',paymentStatus:'CAPTURED',financialDirection:'CUSTOMER_PAYS',timeoutPolicyVersion:1,assignmentDeadlineAt:new Date(Date.now()+25*60_000)}});
 state.auth={role:'AGENT',userId:a.id,agentId:a.agent.id};vi.stubEnv('GOOGLE_MAPS_API_KEY','fixture-server-key');
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>validGoogle()));
});
afterEach(async()=>{vi.unstubAllEnvs();await d.close();});
describe('permission-dependent Bengaluru agent availability',()=>{
 it.each([{},fix({accuracy:900}),fix({capturedAt:Date.now()-60_000}),fix({lat:13.34,lng:77.10}),fix({lat:12.916,lng:77.61,mocked:true})])('refuses missing, inaccurate, stale, outside and reported mock GPS',async body=>{
  const response=await status(req({status:'AVAILABLE',...body},'PATCH','/api/agent/status'));
  expect(response.status).toBe(409);expect((await d.prisma.agent.findUniqueOrThrow({where:{id:a.agent.id}})).status).toBe('OFFLINE');expect(fetch).not.toHaveBeenCalled();
 });
 it('verifies Google locality, stores an idle fix, and can go offline without GPS',async()=>{
  expect((await status(req({status:'AVAILABLE',...fix()},'PATCH','/api/agent/status'))).status).toBe(200);
  let agent=await d.prisma.agent.findUniqueOrThrow({where:{id:a.agent.id}});expect(agent.status).toBe('AVAILABLE');expect(hasFreshAgentPresence(agent)).toBe(true);expect(fetch).toHaveBeenCalledOnce();
  expect(await d.prisma.agentLocation.count({where:{agentId:agent.id,orderId:null}})).toBe(1);
  expect((await status(req({status:'OFFLINE'},'PATCH','/api/agent/status'))).status).toBe(200);
  agent=await d.prisma.agent.findUniqueOrThrow({where:{id:agent.id}});expect(agent.locationReceivedAt).toBeNull();expect(agent.status).toBe('OFFLINE');
 });
 it('fails closed on provider outage and refuses a matching district without the Bengaluru locality',async()=>{
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  expect((await status(req({status:'AVAILABLE',...fix()},'PATCH','/api/agent/status'))).status).toBe(503);
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({status:'OK',results:[{address_components:[{types:['administrative_area_level_2'],long_name:'Bengaluru Rural'},{types:['country'],short_name:'IN'}]}]})));
  expect((await status(req({status:'AVAILABLE',...fix()},'PATCH','/api/agent/status'))).status).toBe(409);
 });
 it('refreshes stationary idle presence without duplicating history or calling Google for every heartbeat',async()=>{
  await d.prisma.agent.update({where:{id:a.agent.id},data:presence()});
  expect((await location(req(fix()))).status).toBe(200);
  await d.prisma.agent.update({where:{id:a.agent.id},data:{locationCapturedAt:new Date(Date.now()-1000)}});
  expect((await location(req(fix()))).status).toBe(200);
  expect(await d.prisma.agentLocation.count({where:{agentId:a.agent.id}})).toBe(1);expect(fetch).not.toHaveBeenCalled();
 });
 it('does not let a heartbeat reactivate an offline agent or attach to another agent pickup',async()=>{
  expect((await location(req(fix()))).status).toBe(409);
  await d.prisma.agent.update({where:{id:a.agent.id},data:presence()});
  await d.prisma.order.update({where:{id:order.id},data:{agentId:b.agent.id,status:'AGENT_ACCEPTED'}});
  expect((await location(req({...fix(),orderId:order.id}))).status).toBe(403);
  expect(await d.prisma.agentLocation.count()).toBe(0);
 });
 it('takes an online agent offline for a rejected GPS fix and blocks cross-site writes',async()=>{
  await d.prisma.agent.update({where:{id:a.agent.id},data:presence()});
  expect((await location(req(fix({accuracy:1000})))).status).toBe(409);
  expect((await d.prisma.agent.findUniqueOrThrow({where:{id:a.agent.id}})).status).toBe('OFFLINE');
  expect((await status(req({status:'AVAILABLE',...fix()},'PATCH','/api/agent/status','https://evil.example'))).status).toBe(403);
 });
 it.each(['EN_ROUTE','ARRIVED','WEIGHING'])('keeps required GPS tracking running through active lifecycle status %s',async agentStatus=>{
  await d.prisma.agent.update({where:{id:a.agent.id},data:{...presence(),status:agentStatus}});
  await d.prisma.order.update({where:{id:order.id},data:{agentId:a.agent.id,status:'AGENT_ON_WAY'}});
  const response=await location(req({...fix(),orderId:order.id}));expect(response.status).toBe(200);
  expect((await d.prisma.agent.findUniqueOrThrow({where:{id:a.agent.id}})).status).toBe(agentStatus);
  expect(await d.prisma.agentLocation.count({where:{orderId:order.id}})).toBe(1);
  await status(req({status:'OFFLINE'},'PATCH','/api/agent/status'));expect((await d.prisma.agent.findUniqueOrThrow({where:{id:a.agent.id}})).status).toBe('OFFLINE');
 });
 it('does not restore online presence after session revocation during city verification',async()=>{
  vi.mocked(fetch).mockImplementationOnce(async()=>{
   await d.prisma.user.update({where:{id:a.id},data:{tokenVersion:{increment:1}}});
   await d.prisma.agent.update({where:{id:a.agent.id},data:{tokenVersion:{increment:1}}});return validGoogle();
  });
  expect((await status(req({status:'AVAILABLE',...fix()},'PATCH','/api/agent/status'))).status).toBe(401);
  expect((await d.prisma.agent.findUniqueOrThrow({where:{id:a.agent.id}})).status).toBe('OFFLINE');
 });
 it('rejects replayed timestamps and impossible movement',()=>{
  const p=presence();expect(()=>assertPlausibleMovement(p,fix({capturedAt:p.locationCapturedAt.getTime()}))).toThrow(/already/);
  expect(()=>assertPlausibleMovement(p,fix({lat:13.10,lng:77.75}))).toThrow(/jump/);
 });
 it('rejects legacy default coordinates, expired leases, and missing city proof',()=>{
  expect(hasFreshAgentPresence({currentLat:12.916,currentLng:77.61})).toBe(false);
  expect(hasFreshAgentPresence({...presence(),locationReceivedAt:new Date(Date.now()-91_000)})).toBe(false);
  expect(hasFreshAgentPresence({...presence(),bengaluruVerifiedAt:null})).toBe(false);
 });
 it('renews Google proof on movement and city-proof expiry',async()=>{
  expect(await verifyBengaluruLocality(presence(),fix())).toBeNull();
  expect(await verifyBengaluruLocality(presence(),fix({lat:12.93}))).toHaveProperty('bengaluruVerifiedAt');
  expect(await verifyBengaluruLocality({...presence(),bengaluruVerifiedAt:new Date(Date.now()-121_000)},fix())).toHaveProperty('bengaluruVerifiedAt');
  expect(fetch).toHaveBeenCalledTimes(2);
 });
});
describe('nearest fresh available agent authorization',()=>{
 async function online(){await d.prisma.agent.update({where:{id:a.agent.id},data:presence()});await d.prisma.agent.update({where:{id:b.agent.id},data:presence(12.93,77.62)});}
 it('selects nearest and falls back when that agent becomes stale or busy',async()=>{
  await online();let list=await findEligibleAgentsForServiceArea('BTM Layout');expect(selectNearestEligibleAgent(list,{lat:12.9161,lng:77.6101})?.id).toBe(a.agent.id);
  await d.prisma.agent.update({where:{id:a.agent.id},data:{locationReceivedAt:new Date(Date.now()-91_000)}});
  list=await findEligibleAgentsForServiceArea('BTM Layout');expect(selectNearestEligibleAgent(list,{lat:12.9161,lng:77.6101})?.id).toBe(b.agent.id);
  await d.prisma.order.update({where:{id:order.id},data:{agentId:b.agent.id,status:'AGENT_ASSIGNED'}});expect(await findEligibleAgentsForServiceArea()).toEqual([]);
 });
 it('does not list or reveal an open pickup to a non-nearest agent',async()=>{
  await online();state.auth={role:'AGENT',userId:b.id,agentId:b.agent.id};
  const list=await orders(new NextRequest('http://localhost/api/orders?limit=20'));expect(list.status).toBe(200);expect(JSON.stringify(await list.json())).not.toContain(order.id);
  const result=await details(new NextRequest('http://localhost/api/orders/'+order.id),{params:Promise.resolve({id:order.id})});expect(result.status).toBe(403);
 });
 it('rechecks nearest eligibility inside the atomic accept transaction',async()=>{
  await online();const denied=await executeAgentAcceptTransaction(d.prisma,{order,agentId:b.agent.id});expect(denied).toMatchObject({changed:false,reason:'notNearest'});
  const accepted=await executeAgentAcceptTransaction(d.prisma,{order,agentId:a.agent.id,agentUserId:a.id});expect(accepted.changed).toBe(true);
  expect((await d.prisma.order.findUniqueOrThrow({where:{id:order.id}})).agentId).toBe(a.agent.id);
 });
 it('blocks a guessed accept endpoint and requires a renewed location before accepting',async()=>{
  await online();state.auth={role:'AGENT',userId:b.id,agentId:b.agent.id};
  expect((await accept(req({},'POST','/api/orders/'+order.id+'/accept'),{params:Promise.resolve({id:order.id})})).status).toBe(409);
  await d.prisma.agent.update({where:{id:b.agent.id},data:{locationReceivedAt:null}});
  expect((await executeAgentAcceptTransaction(d.prisma,{order,agentId:b.agent.id}))).toMatchObject({changed:false,reason:'locationRequired'});
 });
 it('dispatches only to the nearest agent and recovers to the next available recipient exactly once',async()=>{
  await online();await dispatchPaidOrderToAgents(order.id);await dispatchPaidOrderToAgents(order.id);
  expect(state.send).toHaveBeenCalledOnce();expect(state.send.mock.calls[0][0].agentPhone).toBe(a.phone);
  const event=vi.mocked(broadcaster.broadcast).mock.calls.find(c=>c[0]==='NEW_PICKUP_AVAILABLE');expect(event?.[1].targetAgentIds).toEqual([a.agent.id]);
  await d.prisma.agent.update({where:{id:a.agent.id},data:{status:'OFFLINE'}});await dispatchPaidOrderToAgents(order.id);await dispatchPaidOrderToAgents(order.id);
  expect(state.send).toHaveBeenCalledTimes(2);expect(state.send.mock.calls[1][0].agentPhone).toBe(b.phone);
  expect(await d.prisma.notification.count({where:{type:'AGENT_PICKUP_AVAILABLE'}})).toBe(2);
 });
 it('keeps concurrent acceptance from creating two active pickups for one agent',async()=>{
  await online();const second=await d.prisma.order.create({data:{orderNumber:'JIO-SECOND',customerId:order.customerId,addressId:order.addressId,status:'BOOKING_RECEIVED',financialDirection:'CUSTOMER_PAYS',paymentStatus:'CAPTURED',timeoutPolicyVersion:1,assignmentDeadlineAt:new Date(Date.now()+600000)}});
  await Promise.allSettled([executeAgentAcceptTransaction(d.prisma,{order,agentId:a.agent.id,agentUserId:a.id}),executeAgentAcceptTransaction(d.prisma,{order:second,agentId:a.agent.id,agentUserId:a.id})]);
  expect(await d.prisma.order.count({where:{agentId:a.agent.id,status:'AGENT_ACCEPTED'}})).toBe(1);
 });
 it('uses per-recipient durable deduplication so offline previous recipients cannot pin orders',()=>{
  expect(getAgentPickupNotificationId('order','a')).not.toBe(getAgentPickupNotificationId('order','b'));
  expect(getAgentPickupNotificationId('order','a')).toBe(getAgentPickupNotificationId('order','a'));
 });
});
