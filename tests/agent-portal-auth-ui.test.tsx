import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi,beforeEach} from 'vitest';
const state=vi.hoisted(()=>({session:{status:'checking',user:null} as any,path:'/agent'}));
vi.mock('next/navigation',()=>({usePathname:()=>state.path}));
vi.mock('@/components/AgentSession',()=>({useAgentSession:()=>({session:state.session,refresh:vi.fn(),logout:vi.fn()})}));
import {agentFetch} from '@/lib/agentFetch';
import AgentKycGate from '@/components/AgentKycGate';
import AgentBottomNav from '@/components/AgentBottomNav';
import {classifyAgentSession,agentPageAccess} from '@/lib/agentSession';
beforeEach(()=>{state.session={status:'checking',user:null};state.path='/agent';});
const user={id:'user',role:'AGENT',agent:{id:'agent',onboardingApproved:false}};
function markup(){return renderToStaticMarkup(<AgentKycGate><section>PRIVATE_WALLET_BALANCE</section><section>AADHAAR_KYC_FORM</section><AgentBottomNav/></AgentKycGate>);}
describe('Agent portal authentication visibility',()=>{
 it.each(['/agent','/agent/onboarding','/agent/wallet','/agent/pickups/fixture','/agent/pickups','/agent/help','/agent/more'])('never server-renders protected content while checking %s',path=>{state.path=path;const html=markup();expect(html).not.toContain('PRIVATE_WALLET');expect(html).not.toContain('AADHAAR_KYC');expect(html).not.toContain('Agent navigation');});
 it.each(['/agent','/agent/onboarding','/agent/wallet','/agent/pickups/fixture','/agent/pickups','/agent/help','/agent/more'])('renders only login/signup for logged-out visitors to %s',path=>{state.session={status:'guest',user:null};state.path=path;const html=markup();expect(html).toContain('Welcome back.');expect(html).toContain('Sign up');expect(html).toContain('Send OTP');expect(html).not.toContain('PRIVATE_WALLET');expect(html).not.toContain('AADHAAR_KYC');expect(html).not.toContain('Agent navigation');});
 it('fails closed on session errors',()=>{state.session={status:'error',user:null};expect(markup()).toContain('Let’s reconnect.');expect(markup()).not.toContain('PRIVATE_WALLET');});
 it('requires approved KYC before a wallet or dashboard can render',()=>{state.session={status:'onboarding',user};state.path='/agent/wallet';expect(agentPageAccess(state.session,state.path)).toBe('redirect');expect(markup()).not.toContain('PRIVATE_WALLET');expect(markup()).not.toContain('Agent navigation');});
 it('shows KYC only after agent sign-in and keeps navigation hidden there',()=>{state.session={status:'onboarding',user};state.path='/agent/onboarding';const html=renderToStaticMarkup(<AgentKycGate><section>AADHAAR_KYC_FORM</section><AgentBottomNav/></AgentKycGate>);expect(html).toContain('AADHAAR_KYC_FORM');expect(html).not.toContain('Agent navigation');});
 it('unlocks business content and navigation only for an approved session',()=>{state.session={status:'approved',user};const html=markup();expect(html).toContain('PRIVATE_WALLET_BALANCE');expect(html).toContain('Agent navigation');for(const label of ['Home','Earnings','Pickups','Help','More'])expect(html).toContain(label);});
 it.each([null,{success:false},{success:true,data:{authenticated:false,user:null}},{success:true,data:{user:{role:'CUSTOMER',agent:{id:'agent'}}}},{success:true,data:{user:{role:'AGENT'}}}])('never accepts an anonymous, malformed or other-role session',body=>expect(classifyAgentSession(body).status).toBe('guest'));
 it('ignores approval flags unless the API confirms them as a boolean',()=>{expect(classifyAgentSession({success:true,data:{user}}).status).toBe('onboarding');expect(classifyAgentSession({success:true,data:{user:{...user,agent:{...user.agent,onboardingApproved:'true'}}}}).status).toBe('onboarding');expect(classifyAgentSession({success:true,data:{user:{...user,agent:{...user.agent,onboardingApproved:true}}}}).status).toBe('approved');});
 it('selects the agent session explicitly for native API calls without removing caller headers',async()=>{const fetchMock=vi.fn().mockResolvedValue(Response.json({success:true}));vi.stubGlobal('fetch',fetchMock);await agentFetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const options=fetchMock.mock.calls[0][1];expect(options.headers.get('X-Jio-Portal')).toBe('agent');expect(options.headers.get('Content-Type')).toBe('application/json');expect(options.credentials).toBe('same-origin');});
 it('never sends partner session selection to an external URL',()=>{expect(()=>agentFetch('https://external.example/api/orders')).toThrow(/Invalid/);});

});
