import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), change: vi.fn(), process: vi.fn() }));
vi.mock('../lib/auth/middleware', () => ({ getAuthUser: mocks.auth }));
vi.mock('../lib/accountDeletion', () => ({ changeAccountDeletion: mocks.change, processAccountDeletions: mocks.process }));
import { POST } from '../app/api/customer/account-deletion/route';
import { POST as job } from '../app/api/internal/jobs/account-deletion/route';
const request = (body: unknown, headers = {}) => new NextRequest('http://localhost:3000/api/customer/account-deletion', { method:'POST', headers:{'Content-Type':'application/json',...headers}, body:JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('JWT_SECRET','test-only-jwt-secret-at-least-32-characters');
  vi.stubEnv('CRON_SECRET','local-job-secret');
  mocks.auth.mockResolvedValue({userId:'customer',role:'CUSTOMER'});
  mocks.change.mockResolvedValue({id:'customer',phone:'9876543210',tokenVersion:2,customer:{id:'c'},deletionDueAt:new Date(Date.now()+10000)});
  mocks.process.mockResolvedValue({deleted:1,failed:0,batchSize:1});
});
afterEach(() => vi.unstubAllEnvs());
test('anonymous users and staff cannot request customer deletion',async()=>{
  mocks.auth.mockResolvedValue(null); expect((await POST(request({action:'request',confirmation:'DELETE'}))).status).toBe(401);
  mocks.auth.mockResolvedValue({userId:'staff',role:'ADMIN'}); expect((await POST(request({action:'request',confirmation:'DELETE'}))).status).toBe(403);
  expect(mocks.change).not.toHaveBeenCalled();
});
test('requires confirmation and rejects cross-site requests',async()=>{
  expect((await POST(request({action:'request'}))).status).toBe(400);
  expect((await POST(request({action:'request',confirmation:'DELETE'},{origin:'https://evil.invalid'}))).status).toBe(403);
  expect(mocks.change).not.toHaveBeenCalled();
});
test('uses authenticated identity, ignores supplied customer ID and renews session',async()=>{
  const response=await POST(request({action:'request',confirmation:'DELETE',userId:'victim'}));
  expect(response.status).toBe(200);
  expect(mocks.change).toHaveBeenCalledWith('customer','request');
  expect(response.cookies.get('jio_token')?.value).toBeTruthy();
});
test('recovery only targets authenticated user',async()=>{
  expect((await POST(request({action:'recover',userId:'victim'}))).status).toBe(200);
  expect(mocks.change).toHaveBeenCalledWith('customer','recover');
});
test('scheduler requires secret and reports failures for retry',async()=>{
  expect((await job(request({}))).status).toBe(401);
  expect(mocks.process).not.toHaveBeenCalled();
  mocks.process.mockResolvedValue({deleted:0,failed:1,batchSize:1});
  expect((await job(request({},{authorization:'Bearer local-job-secret'}))).status).toBe(503);
});
