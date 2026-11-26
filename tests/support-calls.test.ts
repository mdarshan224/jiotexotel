import {readFileSync} from 'node:fs';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({db:null as any,connect:vi.fn(),details:vi.fn()}));
vi.mock('@/lib/db',()=>({db:new Proxy({},{get(_t,p){const v=m.db[p];return typeof v==='function'?v.bind(m.db):v;}})}));
vi.mock('@/lib/voice/exotel',async original=>({...await original<typeof import('@/lib/voice/exotel')>(),connectNumbers:m.connect,getCallDetails:m.details}));
import {localDatabase} from './fixtures/localDatabase';
import {startSupportCall,refreshSupportCall,publicSupportCall} from '@/lib/voice/supportCalls';
let d:Awaited<ReturnType<typeof localDatabase>>,admin:any,customer:any,input:any;
beforeEach(async()=>{
 vi.clearAllMocks();for(const [k,v] of Object.entries({EXOTEL_ENABLED:'true',EXOTEL_ACCOUNT_SID:'audit-account',EXOTEL_API_KEY:'audit-key',EXOTEL_API_TOKEN:'audit-token',EXOTEL_CALLER_ID:'08012345678',EXOTEL_HOST:'api.exotel.com',JWT_SECRET:'audit-only-secret-at-least-thirty-two-characters'}))vi.stubEnv(k,v);
 d=await localDatabase();m.db=d.prisma;
 const staff=await d.prisma.user.create({data:{phone:'7000000010',name:'Local support admin',role:'ADMIN'}});
 const user=await d.prisma.user.create({data:{phone:'7000000011',name:'Local customer',customer:{create:{}}},include:{customer:true}});customer=user.customer!;
 admin={userId:staff.id,role:'ADMIN'};input={customerId:customer.id,teamPhone:'7000000012',attemptId:'audit-support-attempt-00001'};
 m.connect.mockResolvedValue({sid:'support-provider-00001',status:'queued'});m.details.mockResolvedValue({status:'completed',duration:12});
});
afterEach(async()=>{vi.unstubAllEnvs();await d.close();});
describe('Admin support calls with local database',()=>{
 it('rings the entered team number first and the selected registered customer second without an order',async()=>{
  const call=await startSupportCall(admin,input);
  expect(m.connect.mock.calls[0][0]).toMatchObject({from:'+917000000012',to:'+917000000011',scope:'support'});
  expect(await d.prisma.order.count()).toBe(0);expect(call.teamPhoneLast4).toBe('0012');expect(JSON.stringify(call)).not.toContain('7000000012');expect(publicSupportCall(call)).not.toHaveProperty('gatewaySid');expect(publicSupportCall(call)).not.toHaveProperty('teamPhoneHash');
 });
 it.each(['CUSTOMER','AGENT'])('blocks %s callers before any provider call',async role=>{await expect(startSupportCall({...admin,role},input)).rejects.toThrow(/Administrator/);expect(m.connect).not.toHaveBeenCalled();expect(await d.prisma.supportCall.count()).toBe(0);});
 it('deduplicates a retry and rejects changed customer or team details for the same attempt',async()=>{
  const a=await startSupportCall(admin,input),b=await startSupportCall(admin,input);expect(b.id).toBe(a.id);expect(m.connect).toHaveBeenCalledOnce();await expect(startSupportCall(admin,{...input,teamPhone:'7000000013'})).rejects.toThrow(/different call details/);
 });
 it('blocks deleted/pending-deletion customer accounts and invalid or identical team numbers',async()=>{
  await expect(startSupportCall(admin,{...input,teamPhone:'123'})).rejects.toThrow(/valid registered/);
  await expect(startSupportCall(admin,{...input,teamPhone:'7000000011'})).rejects.toThrow(/different/);
  await d.prisma.user.update({where:{id:customer.userId},data:{deletionDueAt:new Date(Date.now()+86400000)}});await expect(startSupportCall(admin,input)).rejects.toThrow(/active customer/);expect(m.connect).not.toHaveBeenCalled();
 });
 it('blocks a second customer using the same busy team mobile',async()=>{
  await startSupportCall(admin,input);
  const user=await d.prisma.user.create({data:{phone:'7000000014',name:'Other local customer',customer:{create:{}}},include:{customer:true}});
  await expect(startSupportCall(admin,{...input,customerId:user.customer!.id,attemptId:'audit-support-attempt-00002'})).rejects.toThrow(/already starting/);expect(m.connect).toHaveBeenCalledOnce();
 });
 it('commits only one claim when two admin requests race for the same customer',async()=>{
  const results=await Promise.allSettled([startSupportCall(admin,input),startSupportCall(admin,{...input,attemptId:'audit-support-attempt-racing'})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(m.connect).toHaveBeenCalledOnce();expect(await d.prisma.supportCall.count()).toBe(1);
 });
 it('recovers only pre-fix unconfirmed calls without a provider SID',async()=>{
  const unknown=await d.prisma.supportCall.create({data:{customerId:customer.id,callerUserId:admin.userId,attemptKey:'legacy-unknown',teamPhoneHash:'local-hash',teamPhoneLast4:'0012',status:'UNKNOWN'}});
  const accepted=await d.prisma.supportCall.create({data:{customerId:customer.id,callerUserId:admin.userId,attemptKey:'legacy-accepted',teamPhoneHash:'local-hash',teamPhoneLast4:'0012',status:'UNKNOWN',gatewaySid:'known-provider-call'}});
  const sql=readFileSync('drizzle/0004_exotel_redirect_recovery.sql','utf8').split('--> statement-breakpoint')[0].replace(/^--.*$/gm,'').trim();
  await d.prisma.$executeRawUnsafe(sql);
  expect((await d.prisma.supportCall.findUniqueOrThrow({where:{id:unknown.id}})).status).toBe('FAILED');
  expect((await d.prisma.supportCall.findUniqueOrThrow({where:{id:accepted.id}})).status).toBe('UNKNOWN');expect(m.connect).not.toHaveBeenCalled();
 });
 it('retains unknown outcomes and never retries an uncertain provider request',async()=>{
  m.connect.mockRejectedValue(new Error('Local timeout fixture'));await expect(startSupportCall(admin,input)).rejects.toThrow();expect((await startSupportCall(admin,input)).status).toBe('UNKNOWN');expect(m.connect).toHaveBeenCalledOnce();
 });
 it('limits a customer to five support attempts in an hour',async()=>{
  for(let i=0;i<5;i++){m.connect.mockResolvedValueOnce({sid:'support-provider-0000'+i,status:'completed'});const call=await startSupportCall(admin,{...input,attemptId:'audit-support-hour-0000'+i});await d.prisma.supportCall.update({where:{id:call.id},data:{createdAt:new Date(Date.now()-60000)}});}
  await expect(startSupportCall(admin,{...input,attemptId:'audit-support-hour-99999'})).rejects.toThrow(/Hourly call limit/);expect(m.connect).toHaveBeenCalledTimes(5);
 });
 it('refreshes from the provider and cascades call metadata when the customer is erased',async()=>{
  const call=await startSupportCall(admin,input);expect((await refreshSupportCall(call.id,true)).status).toBe('completed');await d.prisma.user.delete({where:{id:customer.userId}});expect(await d.prisma.supportCall.count()).toBe(0);
 });
});
