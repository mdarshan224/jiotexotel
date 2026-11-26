import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({db:null as any,connect:vi.fn(),details:vi.fn()}));
vi.mock('@/lib/db',()=>({db:new Proxy({},{get(_t,p){const v=state.db[p];return typeof v==='function'?v.bind(state.db):v;}})}));
vi.mock('@/lib/voice/exotel',async original=>({...await original<typeof import('@/lib/voice/exotel')>(),connectNumbers:state.connect,getCallDetails:state.details}));
import {localDatabase} from './fixtures/localDatabase';
import {startOrderCall,refreshCall,publicCall} from '@/lib/voice/calls';
let d:Awaited<ReturnType<typeof localDatabase>>,order:any,auth:any,agentAuth:any;
beforeEach(async()=>{
 vi.clearAllMocks();for(const [k,v] of Object.entries({EXOTEL_ENABLED:'true',EXOTEL_ACCOUNT_SID:'audit-account',EXOTEL_API_KEY:'audit-key',EXOTEL_API_TOKEN:'audit-token',EXOTEL_CALLER_ID:'08012345678',EXOTEL_HOST:'api.in.exotel.com',JWT_SECRET:'audit-only-secret-at-least-thirty-two-characters'}))vi.stubEnv(k,v);
 d=await localDatabase();state.db=d.prisma;
 const customer=await d.prisma.user.create({data:{phone:'7000000011',name:'Local test customer',customer:{create:{}}},include:{customer:true}});
 const agent=await d.prisma.user.create({data:{phone:'7000000012',name:'Local test agent',role:'AGENT',agent:{create:{}}},include:{agent:true}});
 const address=await d.prisma.address.create({data:{userId:customer.id,name:'Local',phone:'7000000011',houseNo:'1',street:'Local',area:'BTM Layout',pincode:'560076',lat:12.91,lng:77.61}});
 order=await d.prisma.order.create({data:{orderNumber:'JIO-VOICE-AUDIT',customerId:customer.customer!.id,agentId:agent.agent!.id,addressId:address.id,status:'AGENT_ACCEPTED'}});
 auth={userId:customer.id,customerId:customer.customer!.id,role:'CUSTOMER'};agentAuth={userId:agent.id,agentId:agent.agent!.id,role:'AGENT'};
 state.connect.mockResolvedValue({sid:'provider-call-12345678',status:'queued'});state.details.mockResolvedValue({status:'completed',duration:20});
});
afterEach(async()=>{vi.unstubAllEnvs();await d.close();});
describe('Order-scoped calling with local database',()=>{
 it('derives both parties server-side and deduplicates retries',async()=>{
  const a=await startOrderCall(order.id,auth,'audit-attempt-0000001');const b=await startOrderCall(order.id,auth,'audit-attempt-0000001');expect(a.id).toBe(b.id);expect(state.connect).toHaveBeenCalledOnce();expect(state.connect.mock.calls[0][0]).toMatchObject({from:'+917000000011',to:'+917000000012'});expect(publicCall(a)).not.toHaveProperty('gatewaySid');
 });
 it('supports an assigned agent calling the registered customer',async()=>{await startOrderCall(order.id,agentAuth,'audit-attempt-0000002');expect(state.connect.mock.calls[0][0]).toMatchObject({from:'+917000000012',to:'+917000000011'});});
 it.each(['CANCELLED','PICKUP_COMPLETED','SETTLEMENT_COMPLETED'])('blocks calls after %s',async status=>{await d.prisma.order.update({where:{id:order.id},data:{status}});await expect(startOrderCall(order.id,auth,'audit-attempt-0000001')).rejects.toThrow(/active assigned/);expect(state.connect).not.toHaveBeenCalled();});
 it('blocks other customers, agents and administrators',async()=>{for(const actor of [{...auth,customerId:'other'},{...agentAuth,agentId:'other'},{...auth,role:'ADMIN'}])await expect(startOrderCall(order.id,actor,'audit-attempt-0000001')).rejects.toThrow(/not assigned/);expect(await d.prisma.voiceCall.count()).toBe(0);});
 it('blocks repeat attempts from either party while a call is active',async()=>{await startOrderCall(order.id,auth,'audit-attempt-0000001');await expect(startOrderCall(order.id,agentAuth,'audit-attempt-0000002')).rejects.toThrow(/already starting/);expect(state.connect).toHaveBeenCalledOnce();});
 it('preserves uncertain outcomes and never resubmits the provider call on replay',async()=>{state.connect.mockRejectedValue(new Error('Local simulated timeout'));await expect(startOrderCall(order.id,auth,'audit-attempt-0000001')).rejects.toThrow();expect((await startOrderCall(order.id,auth,'audit-attempt-0000001')).status).toBe('UNKNOWN');expect(state.connect).toHaveBeenCalledOnce();});
 it('limits a caller to five attempts per hour even after completed calls',async()=>{
  for(let i=0;i<5;i++){
   state.connect.mockResolvedValueOnce({sid:`provider-call-0000${i}`,status:'completed'});
   const call=await startOrderCall(order.id,auth,`audit-hour-attempt-0000${i}`);
   await d.prisma.voiceCall.update({where:{id:call.id},data:{createdAt:new Date(Date.now()-60000)}});
  }
  await expect(startOrderCall(order.id,auth,'audit-hour-attempt-99999')).rejects.toThrow(/limit reached/);
  expect(state.connect).toHaveBeenCalledTimes(5);
 });
 it('prevents the static review account from ringing real users',async()=>{
  await d.prisma.user.update({where:{id:auth.userId},data:{phone:'9876543210'}});
  await expect(startOrderCall(order.id,auth,'audit-attempt-0000001')).rejects.toThrow(/review login/);
  expect(state.connect).not.toHaveBeenCalled();
 });
 it('uses authenticated provider details to reach a terminal status and removes call records with the order',async()=>{const call=await startOrderCall(order.id,auth,'audit-attempt-0000001');expect((await refreshCall(call.id,true)).status).toBe('completed');await d.prisma.order.delete({where:{id:order.id}});expect(await d.prisma.voiceCall.count()).toBe(0);});
});
