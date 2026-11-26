import {beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({auth:vi.fn(),wallet:vi.fn(),rows:vi.fn()}));
vi.mock('@/lib/auth/middleware',()=>({getAuthUser:m.auth}));
vi.mock('@/lib/agentWallet',()=>({getOrCreateAgentWallet:m.wallet}));
vi.mock('@/lib/db',()=>({db:{agentWalletTransaction:{findMany:m.rows}}}));
import {GET} from '@/app/api/agent/wallet/route';
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({role:'AGENT',agentId:'agent-a'});m.wallet.mockResolvedValue({id:'wallet-a',agentId:'agent-a',balance:80,updatedAt:new Date()});m.rows.mockResolvedValue([{id:'new',type:'MANUAL_ADJUSTMENT',amount:20,balanceAfter:80,status:'SUCCESS',createdAt:new Date(),order:null},{id:'old',type:'CREDIT',amount:100,balanceAfter:100,status:'SUCCESS',createdAt:new Date(0),order:null}]);});
describe('Agent wallet read scope and classification',()=>{
 it.each([null,{role:'CUSTOMER',customerId:'c'}])('rejects non-agent access',async auth=>{m.auth.mockResolvedValue(auth);expect((await GET(new NextRequest('http://localhost/api/agent/wallet'))).status).toBe(401);expect(m.rows).not.toHaveBeenCalled();});
 it('scopes lookup to the authenticated agent and returns legacy direction without writing records',async()=>{const r=await GET(new NextRequest('http://localhost/api/agent/wallet?agentId=other'));expect(r.status).toBe(200);expect(m.wallet).toHaveBeenCalledWith('agent-a');expect(m.rows.mock.calls[0][0].where).toEqual({agentId:'agent-a'});expect((await r.json()).data.transactions[0].direction).toBe('DEBIT');});
});
