import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({refresh:vi.fn(),support:vi.fn()}));
vi.mock('@/lib/voice/supportCalls',()=>({refreshSupportCall:m.support}));
vi.mock('@/lib/voice/calls',()=>({refreshCall:m.refresh}));
import {POST} from '@/app/api/voice/exotel/callback/route';
import {callbackToken} from '@/lib/voice/exotel';
const id='audit-call-123456789';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('JWT_SECRET','audit-only-secret-at-least-thirty-two-characters');m.refresh.mockResolvedValue({status:'queued'});m.support.mockResolvedValue({status:'queued'});});
afterEach(()=>vi.unstubAllEnvs());
it('rejects unsigned callbacks before any provider or database I/O',async()=>{const r=await POST(new NextRequest(`https://junkitout.in/api/voice/exotel/callback?id=${id}&token=forged`,{method:'POST'}));expect(r.status).toBe(401);expect(m.refresh).not.toHaveBeenCalled();});
it('ignores asserted body status and refreshes only the signed stored call',async()=>{const r=await POST(new NextRequest(`https://junkitout.in/api/voice/exotel/callback?id=${id}&token=${callbackToken(id)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Status:'completed',CallSid:'forged-provider-id'})}));expect(r.status).toBe(200);expect(m.refresh).toHaveBeenCalledWith(id,true);});
it('returns a retryable error if authoritative verification fails',async()=>{m.refresh.mockRejectedValue(new Error('Local offline fixture'));expect((await POST(new NextRequest(`https://junkitout.in/api/voice/exotel/callback?id=${id}&token=${callbackToken(id)}`,{method:'POST'}))).status).toBe(503);});

it('uses a separate signed scope for admin support-call callbacks',async()=>{
 const req=(token:string)=>new NextRequest(`https://junkitout.in/api/voice/exotel/callback?id=${id}&scope=support&token=${token}`,{method:'POST'});
 expect((await POST(req(callbackToken(id)))).status).toBe(401);
 expect((await POST(req(callbackToken(id,'support')))).status).toBe(200);
 expect(m.support).toHaveBeenCalledWith(id,true);expect(m.refresh).not.toHaveBeenCalled();
});
