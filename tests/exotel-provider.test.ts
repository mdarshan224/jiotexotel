import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {voiceConfig,parseExotelBalance,connectNumbers,mobileNumber,callbackToken,validCallbackToken,getCallDetails} from '@/lib/voice/exotel';
beforeEach(()=>{for(const [k,v] of Object.entries({EXOTEL_ENABLED:'true',EXOTEL_ACCOUNT_SID:'audit-account',EXOTEL_API_KEY:'audit-key',EXOTEL_API_TOKEN:'audit-token',EXOTEL_CALLER_ID:'08012345678',EXOTEL_HOST:'api.in.exotel.com',JWT_SECRET:'audit-only-secret-at-least-thirty-two-characters'}))vi.stubEnv(k,v);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('Exotel provider contract',()=>{
 it('reads modern and older account balance envelopes without inventing a currency',()=>{
  expect(parseExotelBalance({Account:{BalanceData:{Balance:'125.50',Currency:'INR'}}})).toEqual({amount:125.5,currency:'INR'});
  expect(parseExotelBalance({Balance:{Amount:125.5}})).toEqual({amount:125.5,currency:null});
 });
 it.each([{}, {Balance:{Amount:null}}, {Balance:{Amount:''}}, {Balance:{Amount:'invalid'}}])('rejects invalid balance data',value=>expect(()=>parseExotelBalance(value)).toThrow(/verified/));
 it.each(['9876543210','+91 98765 43210','09876543210'])('normalizes registered numbers %s',value=>expect(mobileNumber(value)).toBe('+919876543210'));
 it('rejects invalid numbers',()=>expect(()=>mobileNumber('123')).toThrow(/valid registered/));
 it('fails closed for an unknown host and when disabled without making a call',async()=>{vi.stubEnv('EXOTEL_HOST','evil.example');expect(voiceConfig().ready).toBe(false);await expect(connectNumbers({id:'test',from:'9876543210',to:'9876543211'})).rejects.toThrow(/activated/);expect(fetch).not.toHaveBeenCalled();});
 it('sends a form-encoded transactional bridge with recording enabled and a signed callback, preserving configured virtual number',async()=>{
  const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({Call:{Sid:'provider-call-12345678',Status:'queued'}})));vi.stubGlobal('fetch',mock);
  const r=await connectNumbers({id:'call-a',from:'9876543210',to:'9876543211'});expect(r.status).toBe('queued');
  const [url,init]=mock.mock.calls[0];expect(url).toBe('https://api.in.exotel.com/v1/Accounts/audit-account/Calls/connect.json');
  const body=new URLSearchParams(init.body);expect(body.get('Record')).toBe('true');expect(body.get('TimeLimit')).toBe('600');expect(body.get('From')).toBe('+919876543210');expect(body.get('CallerId')).toBe('08012345678');
  const callback=new URL(body.get('StatusCallback')!);expect(validCallbackToken('call-a',callback.searchParams.get('token')!)).toBe(true);expect(init.redirect).toBe('manual');
 });
 it('restores the previous direct bridge with 08047291777 and ignores any custom flow environment setting',async()=>{
  vi.stubEnv('EXOTEL_CALLER_ID','08047291777');vi.stubEnv('EXOTEL_FLOW_URL','https://my.exotel.com/audit-account/exoml/start_voice/123');
  const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({Call:{Sid:'provider-call-12345678',Status:'queued'}})));vi.stubGlobal('fetch',mock);
  await connectNumbers({id:'rollback-call',from:'7000000011',to:'7000000012'});
  const body=new URLSearchParams(mock.mock.calls[0][1].body);expect(body.get('CallerId')).toBe('08047291777');expect(body.get('To')).toBe('+917000000012');expect(body.has('Url')).toBe(false);expect(body.get('Record')).toBe('true');expect(body.get('StatusCallbackEvents[0]')).toBe('terminal');
 });
 it('keeps support callbacks distinct from pickup callbacks',()=>{expect(validCallbackToken('same-id',callbackToken('same-id','support'),'pickup')).toBe(false);expect(validCallbackToken('same-id',callbackToken('same-id','support'),'support')).toBe(true);});
 it('rejects redirects without making another request or forwarding account credentials',async()=>{
  const mock=vi.fn().mockResolvedValue(new Response('',{status:302,headers:{Location:'https://other.example/capture'}}));vi.stubGlobal('fetch',mock);
  await expect(connectNumbers({id:'call-a',from:'9876543210',to:'9876543211'})).rejects.toThrow(/redirected/);
  expect(mock).toHaveBeenCalledOnce();expect(mock.mock.calls[0][1].redirect).toBe('manual');
 });
 it('binds callback signatures to one call',()=>{expect(validCallbackToken('call-b',callbackToken('call-a'))).toBe(false);expect(validCallbackToken('call-a','forged')).toBe(false);});
 it('does not trust a call-details result from another account',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({Call:{Sid:'provider-call-12345678',AccountSid:'other',Status:'completed'}}))));await expect(getCallDetails('provider-call-12345678')).rejects.toThrow(/verified/);});
 it('sanitizes provider errors instead of exposing credentials or raw bodies',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private-provider-error',{status:401})));await expect(connectNumbers({id:'call-a',from:'9876543210',to:'9876543211'})).rejects.toThrow('Calling account authorization failed. Contact support.');});
});
