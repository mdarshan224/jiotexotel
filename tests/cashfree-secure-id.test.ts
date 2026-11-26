import {generateKeyPairSync,privateDecrypt,constants} from 'node:crypto';
import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import {secureIdSignature,secureIdConfig,secureIdRequest,secureIdLink,verificationSummary,verifiedKyc} from '@/lib/cashfree/secureId';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});const pem=pair.publicKey.export({type:'spki',format:'pem'}).toString();
beforeEach(()=>{vi.stubEnv('CASHFREE_SECURE_ID_CLIENT_ID','fixture-client');vi.stubEnv('CASHFREE_SECURE_ID_CLIENT_SECRET','fixture-secret');vi.stubEnv('CASHFREE_SECURE_ID_PUBLIC_KEY',pem);vi.stubEnv('CASHFREE_SECURE_ID_MODE','production');});
afterEach(()=>vi.unstubAllEnvs());
describe('Cashfree Secure ID provider contract',()=>{
 it('generates RSA-OAEP SHA1 signatures containing the client and UNIX seconds',async()=>{const s=await secureIdSignature('fixture-client',pem,1700000000000);expect(privateDecrypt({key:pair.privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha1'},Buffer.from(s,'base64')).toString()).toBe('fixture-client.1700000000');});
 it('fails closed without a public key without calling provider',async()=>{vi.stubEnv('CASHFREE_SECURE_ID_PUBLIC_KEY','');expect(secureIdConfig().ready).toBe(false);await expect(secureIdRequest('form')).rejects.toThrow(/setup is pending/);expect(fetch).not.toHaveBeenCalled();});
 it('authenticates status queries with verificationID and never follows redirects',async()=>{
  const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({verification_id:'JIOtest',form_status:'PENDING'})));vi.stubGlobal('fetch',mock);
  await secureIdRequest('form?verificationID=JIOtest');expect(mock.mock.calls[0][0]).toBe('https://api.cashfree.com/verification/form?verificationID=JIOtest');const init=mock.mock.calls[0][1];expect(init.redirect).toBe('manual');expect(init.headers['x-cf-signature']).toBeTruthy();expect(init.headers['x-client-secret']).toBe('fixture-secret');
 });
 it('does not follow provider redirects with credentials',async()=>{const mock=vi.fn().mockResolvedValue(new Response('',{status:302,headers:{Location:'https://attacker.example'}}));vi.stubGlobal('fetch',mock);await expect(secureIdRequest('form')).rejects.toThrow(/unavailable/);expect(mock).toHaveBeenCalledOnce();});
 it.each(['https://evil.example/kyc','http://forms.cashfree.com/abc','https://forms.cashfree.com.evil.example/abc','https://forms-test.cashfree.com/abc'])('rejects an untrusted production verification link %s',url=>expect(secureIdLink(url)).toBeNull());
 it('keeps only verified status/type metadata, never identity documents',()=>{const s=verificationSummary({verification_id:'ours',form_status:'SUCCESS',pan:'private',verification_details:[{type:'PAN',status:'SUCCESS',pan:'private'}]},'ours');expect(JSON.stringify(s)).not.toContain('private');expect(verifiedKyc(s)).toBe(false);expect(verifiedKyc({...s,providerStatus:'PENDING'})).toBe(false);expect(verifiedKyc({...s,checksJson:'[]'})).toBe(false);expect(()=>verificationSummary({verification_id:'other'},'ours')).toThrow(/reference/);});
});
