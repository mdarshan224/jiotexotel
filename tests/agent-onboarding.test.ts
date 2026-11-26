import {generateKeyPairSync} from 'node:crypto';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({db:null as any,auth:null as any}));
vi.mock('@/lib/db',()=>({db:new Proxy({},{get(_t,p){const v=state.db[p];return typeof v==='function'?v.bind(state.db):v;}})}));
vi.mock('@/lib/auth/middleware',()=>({getAuthUser:async()=>state.auth,isAdminRole:(a:any)=>['ADMIN','SUPER_ADMIN'].includes(a?.role)}));
import {localDatabase} from './fixtures/localDatabase';
import {startOnboarding,refreshOnboarding,agentOnboardingApproved} from '@/lib/cashfree/agentOnboarding';
import {POST as agentPost} from '@/app/api/agent/onboarding/route';
import {POST as adminPost} from '@/app/api/admin/agent-onboarding/route';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
let d:Awaited<ReturnType<typeof localDatabase>>,agent:any,otherAgent:any;
beforeEach(async()=>{
 d=await localDatabase();state.db=d.prisma;
 vi.stubEnv('CASHFREE_SECURE_ID_CLIENT_ID','fixture-client');vi.stubEnv('CASHFREE_SECURE_ID_CLIENT_SECRET','fixture-secret');vi.stubEnv('CASHFREE_SECURE_ID_PUBLIC_KEY',pair.publicKey.export({type:'spki',format:'pem'}).toString());
 const u=await d.prisma.user.create({data:{name:'Agent fixture',phone:'7000000021',role:'AGENT',agent:{create:{kycRequired:true}}},include:{agent:true}});agent=u.agent!;state.auth={userId:u.id,role:'AGENT',agentId:agent.id};
 const other=await d.prisma.user.create({data:{name:'Other agent',phone:'7000000022',role:'AGENT',agent:{create:{}}},include:{agent:true}});otherAgent=other.agent!;
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const body=JSON.parse(init!.body as string);return Response.json({verification_id:body.verification_id,form_status:'RECEIVED',form_link:'https://forms.cashfree.com/verification/localfixture'});}));
});
afterEach(async()=>{vi.unstubAllEnvs();await d.close();});
function request(body:any,origin='https://junkitout.in'){return new Request('http://localhost/api/agent/onboarding',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)}) as any;}
describe('Agent consent, KYC and admin review',()=>{
 it('does not send agent information without consent and reuses one form on repeated start',async()=>{
  await expect(startOnboarding(agent.id,false)).rejects.toThrow(/consent/);expect(fetch).not.toHaveBeenCalled();
  const a=await startOnboarding(agent.id,true),b=await startOnboarding(agent.id,true);expect(a.id).toBe(b.id);expect(fetch).toHaveBeenCalledOnce();expect(await d.prisma.agentKyc.count()).toBe(1);
  const body=JSON.parse((fetch as any).mock.calls[0][1].body);expect(body.notification_types).toEqual([]);expect(body.phone).toBe('7000000021');expect(body.template_name).toBe('Aadhaar_verification');
 });
 it('uses the signed-in agent instead of a client-supplied agent ID',async()=>{
  const r=await agentPost(request({action:'start',consent:true,agentId:otherAgent.id}));expect(r.status).toBe(200);expect((await d.prisma.agentKyc.findFirstOrThrow()).agentId).toBe(agent.id);
 });
 it('rejects unauthorized and cross-origin requests before contacting provider',async()=>{
  expect((await agentPost(request({action:'start',consent:true},'https://evil.example'))).status).toBe(403);state.auth=null;expect((await agentPost(request({action:'start',consent:true}))).status).toBe(401);expect(fetch).not.toHaveBeenCalled();
 });
 it('keeps an uncertain create, then resolves its stable reference without another POST',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(new Error('timeout')));
  await expect(startOnboarding(agent.id,true)).rejects.toThrow(/confirmation/);const row=await d.prisma.agentKyc.findFirstOrThrow();expect(row.providerStatus).toBe('UNKNOWN');await startOnboarding(agent.id,true);expect(fetch).toHaveBeenCalledOnce();
  await d.prisma.agentKyc.update({where:{id:row.id},data:{updatedAt:new Date(0)}});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({verification_id:row.verificationId,form_status:'PENDING',form_link:'https://forms.cashfree.com/verification/localfixture'})));
  expect((await refreshOnboarding(agent.id))?.providerStatus).toBe('PENDING');expect((fetch as any).mock.calls[0][1].method).toBe('GET');
 });
 it('requires successful provider verification and administrator approval for new agents',async()=>{
  const row=await startOnboarding(agent.id,true);expect(await agentOnboardingApproved(d.prisma,agent.id)).toBe(false);expect(await agentOnboardingApproved(d.prisma,otherAgent.id)).toBe(true);
  expect((await adminPost(request({agentId:agent.id,action:'approve',providerStatus:'SUCCESS'}))).status).toBe(403);
  state.auth={userId:state.auth.userId,role:'ADMIN'};expect((await adminPost(request({agentId:agent.id,action:'approve',providerStatus:'SUCCESS'}))).status).toBe(409);
  await d.prisma.agentKyc.update({where:{id:row.id},data:{providerStatus:'SUCCESS',checksJson:JSON.stringify([{type:'OFFLINE_AADHAAR_VERIFICATION',status:'SUCCESS'}])}});
  expect((await adminPost(request({agentId:agent.id,action:'approve'}))).status).toBe(200);expect(await agentOnboardingApproved(d.prisma,agent.id)).toBe(true);
 });
});
