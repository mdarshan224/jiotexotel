import {generateKeyPairSync} from 'node:crypto';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({db:null as any,auth:null as any,owner:'Fixture Agent',badBank:false}));
vi.mock('@/lib/db',()=>({db:new Proxy({},{get(_t,p){const v=state.db[p];return typeof v==='function'?v.bind(state.db):v;}})}));
vi.mock('@/lib/auth/middleware',()=>({getAuthUser:async()=>state.auth,isAdminRole:(a:any)=>['ADMIN','SUPER_ADMIN'].includes(a?.role)}));
import {localDatabase} from './fixtures/localDatabase';
import {startFullKyc,refreshFullKyc,verifyFullKycStep,addRcDocument,reviewFullKyc,publicFullKyc} from '@/lib/cashfree/fullAgentKyc';
import {agentOnboardingApproved} from '@/lib/cashfree/agentOnboarding';
import {POST as agentPost} from '@/app/api/agent/onboarding/route';
import {GET as documents} from '@/app/api/agent/kyc/documents/route';
import {NextRequest} from 'next/server';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
let d:Awaited<ReturnType<typeof localDatabase>>,agent:any,otherAgent:any;
const input={consent:true,fullName:'Fixture Agent',dob:'1990-01-01'};
async function provider(url:any,init:any){
 const u=new URL(url),b=init.body?JSON.parse(init.body):{},verification_id=b.verification_id||u.searchParams.get('verification_id'),p=u.pathname;
 if(p.endsWith('/digilocker'))return Response.json(init.method==='POST'?{verification_id,url:'https://verification.cashfree.com/fixture',status:'PENDING'}:{verification_id,status:'AUTHENTICATED'});
 if(p.includes('/document/AADHAAR'))return Response.json({verification_id,status:'SUCCESS',uid:'XXXXXXXX1234',name:'Fixture Agent',dob:'01-01-1990',xml:'private-raw-aadhaar'});
 if(p.endsWith('/pan'))return Response.json({valid:true,pan_status:'VALID',registered_name:'Fixture Agent',reference_id:1});
 if(p.endsWith('/ifsc'))return Response.json({verification_id,status:'VALID',ifsc:b.ifsc,bank:'Fixture Bank',branch:'BTM'});
 if(p.endsWith('/bank-account/sync'))return Response.json({account_status:state.badBank?'INVALID':'VALID',name_at_bank:'Fixture Agent',bank_name:'Fixture Bank',reference_id:2});
 if(p.endsWith('/driving-license'))return Response.json({verification_id,status:'VALID',dob:'1990-01-01',details_of_driving_licence:{name:'Fixture Agent',cov_details:[{cov:'MCWG'}]},dl_validity:{non_transport:{to:'01/01/2040'}}});
 if(p.endsWith('/vehicle-rc'))return Response.json({verification_id,status:'VALID',reg_no:b.vehicle_number,owner:state.owner,rc_status:'ACTIVE',class:'MOTOR CYCLE',model:'Fixture bike',rc_expiry_date:'2040-01-01',vehicle_insurance_upto:'2030-01-01'});
 if(p.endsWith('/name-match'))return Response.json({verification_id,status:'SUCCESS',score:0});
 throw new Error('Unexpected provider route '+p);
}
beforeEach(async()=>{
 state.owner='Fixture Agent';state.badBank=false;d=await localDatabase();state.db=d.prisma;
 vi.stubEnv('CASHFREE_SECURE_ID_CLIENT_ID','fixture-client');vi.stubEnv('CASHFREE_SECURE_ID_CLIENT_SECRET','fixture-secret');vi.stubEnv('CASHFREE_SECURE_ID_PUBLIC_KEY',pair.publicKey.export({type:'spki',format:'pem'}).toString());
 const u=await d.prisma.user.create({data:{name:'Agent fixture',phone:'7000000021',role:'AGENT',agent:{create:{kycRequired:true}}},include:{agent:true}});agent=u.agent!;state.auth={userId:u.id,role:'AGENT',agentId:agent.id};
 const other=await d.prisma.user.create({data:{name:'Other agent',phone:'7000000022',role:'AGENT',agent:{create:{}}},include:{agent:true}});otherAgent=other.agent!;
 vi.stubGlobal('fetch',vi.fn(provider));
});
afterEach(async()=>{vi.unstubAllEnvs();await d.close();});
function request(body:any,origin='https://junkitout.in'){return new NextRequest('http://localhost/api/agent/onboarding',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});}
async function aadhaar(){await startFullKyc(agent.id,input,'https://junkitout.in');return refreshFullKyc(agent.id);}
async function full(){await aadhaar();for(const body of [{type:'PAN',pan:'ABCDE1234F'},{type:'IFSC',ifsc:'TEST0123456'},{type:'BANK_ACCOUNT',bankAccount:'123456789012',ifsc:'TEST0123456'},{type:'DRIVING_LICENSE',drivingLicence:'KA0120190012345'},{type:'VEHICLE_RC',vehicleNumber:'KA01AB1234',vehicleType:'Two-wheeler'}])await verifyFullKycStep(agent.id,body);return d.prisma.agentKyc.findUniqueOrThrow({where:{agentId:agent.id}});}
describe('Complete Cashfree identity and approval gates',()=>{
 it('requires consent and reuses the same DigiLocker link',async()=>{await expect(startFullKyc(agent.id,{...input,consent:false},'https://junkitout.in')).rejects.toThrow(/Consent/);expect(fetch).not.toHaveBeenCalled();const a=await startFullKyc(agent.id,input,'https://junkitout.in'),b=await startFullKyc(agent.id,input,'https://junkitout.in');expect(a.id).toBe(b.id);expect(fetch).toHaveBeenCalledOnce();const sent=JSON.parse((fetch as any).mock.calls[0][1].body);expect(sent.document_requested).toEqual(['AADHAAR']);expect(sent.redirect_url).toBe('https://junkitout.in/agent/onboarding');});
 it('never repeats an uncertain create POST',async()=>{vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'));await expect(startFullKyc(agent.id,input,'https://junkitout.in')).rejects.toThrow(/confirmation/);await expect(startFullKyc(agent.id,input,'https://junkitout.in')).rejects.toThrow(/awaiting confirmation/);expect(fetch).toHaveBeenCalledOnce();});
 it('uses the signed-in agent and rejects cross-site calls before provider access',async()=>{expect((await agentPost(request({action:'start',...input,agentId:otherAgent.id}))).status).toBe(200);expect((await d.prisma.agentKyc.findFirstOrThrow()).agentId).toBe(agent.id);expect((await agentPost(request({action:'start',...input},'https://evil.example'))).status).toBe(403);});
 it('denies anonymous onboarding and another agent private documents',async()=>{state.auth=null;expect((await agentPost(request({action:'start',...input}))).status).toBe(401);state.auth={role:'AGENT',agentId:agent.id};expect((await documents(new NextRequest('https://junkitout.in/api/agent/kyc/documents?agentId='+otherAgent.id+'&side=front'))).status).toBe(403);});
 it('requires all six checks, including legacy agents with kycRequired=false',async()=>{await aadhaar();expect(await agentOnboardingApproved(d.prisma,agent.id)).toBe(false);expect(await agentOnboardingApproved(d.prisma,otherAgent.id)).toBe(false);await expect(reviewFullKyc(agent.id,state.auth.userId,'approve',{reason:'Reviewed all identities',acknowledged:true})).rejects.toThrow(/all verified/);});
 it('automatically approves six matching valid checks and stores only masked identities',async()=>{const row=await full();expect(await agentOnboardingApproved(d.prisma,agent.id)).toBe(true);expect(row.reviewStatus).toBe('AUTO_APPROVED');const stored=JSON.stringify(row);for(const value of ['ABCDE1234F','123456789012','KA0120190012345','private-raw-aadhaar'])expect(stored).not.toContain(value);expect(publicFullKyc(row).checks).toHaveLength(6);});
 it('deduplicates a repeated verified document without another provider call',async()=>{await aadhaar();await verifyFullKycStep(agent.id,{type:'PAN',pan:'ABCDE1234F'});const calls=vi.mocked(fetch).mock.calls.length;await verifyFullKycStep(agent.id,{type:'PAN',pan:'ABCDE1234F'});expect(vi.mocked(fetch).mock.calls.length).toBe(calls);});
 it('holds mismatched RC ownership until both private uploads and manual approval',async()=>{state.owner='Different Owner';let row=await full();expect(row.reviewStatus).toBe('PENDING_ADMIN_REVIEW');expect(await agentOnboardingApproved(d.prisma,agent.id)).toBe(false);await expect(reviewFullKyc(agent.id,state.auth.userId,'approve',{reason:'Reviewed owner consent',acknowledged:true})).rejects.toThrow(/both RC/);await addRcDocument(agent.id,'front',`agent-kyc/${agent.id}/front.png`);row=await addRcDocument(agent.id,'back',`agent-kyc/${agent.id}/back.png`);expect(publicFullKyc(row).documentsReady).toBe(true);await expect(reviewFullKyc(agent.id,state.auth.userId,'approve',{reason:'Reviewed owner consent'})).rejects.toThrow();await reviewFullKyc(agent.id,state.auth.userId,'approve',{reason:'Reviewed owner consent and documents',acknowledged:true});expect(await agentOnboardingApproved(d.prisma,agent.id)).toBe(true);expect(await d.prisma.auditLog.count({where:{action:'AGENT_FULL_KYC_APPROVE'}})).toBe(1);});
 it('does not permit manual approval of a provider-invalid bank account',async()=>{state.badBank=true;await full();await expect(reviewFullKyc(agent.id,state.auth.userId,'approve',{reason:'Checked bank mismatch',acknowledged:true})).rejects.toThrow();expect(await agentOnboardingApproved(d.prisma,agent.id)).toBe(false);});
 it('requires verified matching IFSC before bank verification',async()=>{await aadhaar();const count=vi.mocked(fetch).mock.calls.length;await expect(verifyFullKycStep(agent.id,{type:'BANK_ACCOUNT',bankAccount:'123456789012',ifsc:'TEST0123456'})).rejects.toThrow(/IFSC/);expect(vi.mocked(fetch).mock.calls.length).toBe(count);});
 it('locks an uncertain paid verification until operations reset after review',async()=>{await aadhaar();vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'));await expect(verifyFullKycStep(agent.id,{type:'PAN',pan:'ABCDE1234F'})).rejects.toThrow();const count=vi.mocked(fetch).mock.calls.length;await expect(verifyFullKycStep(agent.id,{type:'PAN',pan:'ABCDE1234F'})).rejects.toThrow(/awaiting/);expect(vi.mocked(fetch).mock.calls.length).toBe(count);await reviewFullKyc(agent.id,state.auth.userId,'reset',{type:'PAN',reason:'Provider reviewed; no successful response'});await verifyFullKycStep(agent.id,{type:'PAN',pan:'ABCDE1234F'});});
 it('rejects malformed Aadhaar provider proof before accepting identity',async()=>{await startFullKyc(agent.id,input,'https://junkitout.in');vi.mocked(fetch).mockResolvedValueOnce(Response.json({verification_id:'other',status:'AUTHENTICATED'}));await expect(refreshFullKyc(agent.id)).rejects.toThrow(/reference/);expect(await agentOnboardingApproved(d.prisma,agent.id)).toBe(false);});
});
