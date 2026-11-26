import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({db:null as any,payload:null as any}));
vi.mock('@/lib/db',()=>({db:new Proxy({},{get(_t,p){const v=state.db[p];return typeof v==='function'?v.bind(state.db):v;}})}));
vi.mock('@/lib/auth/jwt',()=>({verifyToken:()=>({...state.payload})}));
import {getAuthUser} from '@/lib/auth/middleware';
import {localDatabase} from './fixtures/localDatabase';
import {approveFixtureAgent} from './fixtures/approvedKyc';
let d:Awaited<ReturnType<typeof localDatabase>>,agent:any;
beforeEach(async()=>{d=await localDatabase();state.db=d.prisma;const user=await d.prisma.user.create({data:{name:'KYC access fixture',phone:'7000000451',role:'AGENT',agent:{create:{kycRequired:false}}},include:{agent:true}});agent=user.agent;state.payload={userId:user.id,agentId:agent.id,role:'AGENT',tokenVersion:1};});
afterEach(async()=>{await d.close();});
const req=(path:string)=>new NextRequest('https://junkitout.in'+path,{headers:{Authorization:'Bearer fixture-token'}});
describe('Server-side agent KYC access',()=>{
 it.each(['/api/agent/profile','/api/agent/wallet','/api/agent/status','/api/agent/location','/api/orders/guessed','/api/orders/guessed/accept','/api/orders/guessed/call'])('denies unverified agent business endpoint %s',async path=>{expect(await getAuthUser(req(path))).toBeNull();});
 it.each(['/api/auth/me','/api/agent/onboarding','/api/agent/kyc/documents'])('allows only own authentication and onboarding endpoints %s',async path=>{expect((await getAuthUser(req(path)))?.agentId).toBe(agent.id);});
 it('unlocks business access only after six-check approval',async()=>{await approveFixtureAgent(d.prisma,agent.id);expect((await getAuthUser(req('/api/agent/wallet')))?.agentId).toBe(agent.id);await d.prisma.agentKyc.update({where:{agentId:agent.id},data:{reviewStatus:'REJECTED'}});expect(await getAuthUser(req('/api/agent/wallet'))).toBeNull();});
});
