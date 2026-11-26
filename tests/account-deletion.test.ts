import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  db: { user: { findFirst: vi.fn(), findUnique: vi.fn() }, deletedPhoneBlock: { findUnique: vi.fn() } },
  send: vi.fn(), verify: vi.fn(), customer: vi.fn(),
}));
vi.mock('../lib/db', () => ({ db: mocks.db, isDatabaseConfigurationError: () => false }));
vi.mock('../lib/auth/otp', () => ({ sendOtp: mocks.send, verifyOtp: mocks.verify }));
vi.mock('../lib/services/customerService', () => ({ findOrCreateUserCustomer: mocks.customer, CustomerRoleConflictError: class extends Error {} }));
import { POST as send } from '../app/api/auth/send-otp/route';
import { POST as verify } from '../app/api/auth/verify-otp/route';
import { validatePayload } from '../lib/auth/middleware';
import { phoneDigest, recoveryOpen, RECOVERY_MS, REJOIN_BLOCK_MS } from '../lib/accountDeletionPolicy';

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3000/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.stubEnv('JWT_SECRET', 'test-only-jwt-secret-at-least-32-characters');
  vi.stubEnv('ACCOUNT_DELETION_HMAC_SECRET', 'test-only-account-deletion-secret-32-characters');
  vi.stubEnv('CUSTOMER_STATIC_TEST_LOGIN_ENABLED', 'true');
  vi.clearAllMocks();
  mocks.db.user.findFirst.mockResolvedValue(null);
  mocks.db.user.findUnique.mockResolvedValue(null);
  mocks.db.deletedPhoneBlock.findUnique.mockResolvedValue(null);
  mocks.customer.mockResolvedValue({ id: 'u', role: 'CUSTOMER', phone: '9876543210', name: 'Tester', tokenVersion: 1, customer: { id: 'c' } });
  mocks.send.mockResolvedValue({ success: true, cooldownSeconds: 30 });
  mocks.verify.mockResolvedValue({ valid: true });
});
afterEach(() => vi.unstubAllEnvs());
describe('static customer credential and deletion enforcement', () => {
  test('test send never calls SMS provider, including production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await send(request('send-otp', { phone: '9876543210' }))).status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  test('exact code signs in directly without an OTP send or provider verification', async () => {
    const response = await verify(request('verify-otp', { phone: '+919876543210', code: '563130' }));
    expect(response.status).toBe(200);
    expect(response.cookies.get('jio_token')?.value).toBeTruthy();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  test('wrong six-digit code is rejected without provider fallback', async () => {
    expect((await verify(request('verify-otp', { phone: '9876543210', code: '123456' }))).status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.customer).not.toHaveBeenCalled();
  });
  test('other numbers continue using SMS and provider verification', async () => {
    await send(request('send-otp', { phone: '9123456789' }));
    await verify(request('verify-otp', { phone: '9123456789', code: '563130' }));
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.verify).toHaveBeenCalledOnce();
  });
  test('30-day block applies to both send and direct test login', async () => {
    mocks.db.deletedPhoneBlock.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + REJOIN_BLOCK_MS) });
    expect((await send(request('send-otp', { phone: '9876543210' }))).status).toBe(403);
    expect((await verify(request('verify-otp', { phone: '9876543210', code: '563130' }))).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.customer).not.toHaveBeenCalled();
  });
  test('expired block permits onboarding again', async () => {
    mocks.db.deletedPhoneBlock.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() - 1) });
    expect((await verify(request('verify-otp', { phone: '9876543210', code: '563130' }))).status).toBe(200);
  });
  test('past deletion deadline blocks even when cleanup job is delayed', async () => {
    mocks.db.user.findFirst.mockResolvedValue({ deletionDueAt: new Date(Date.now() - 1) });
    expect((await verify(request('verify-otp', { phone: '9876543210', code: '563130' }))).status).toBe(403);
    expect(mocks.customer).not.toHaveBeenCalled();
  });
  test('pending account receives recoveryRequired, not automatic recovery', async () => {
    const deletionDueAt = new Date(Date.now() + RECOVERY_MS);
    mocks.db.user.findFirst.mockResolvedValue({ deletionDueAt });
    mocks.customer.mockResolvedValue({ id: 'u', phone: '9876543210', name: 'Tester', deletionDueAt, customer: { id: 'c' } });
    const response = await verify(request('verify-otp', { phone: '9876543210', code: '563130' }));
    expect((await response.json()).data.recoveryRequired).toBe(true);
  });
  test('pending sessions only work for recovery; due sessions never work', async () => {
    const payload = { userId: 'u', phone: '9876543210', role: 'CUSTOMER' as const, tokenVersion: 1, exp: 9999999999 };
    const finder = vi.fn().mockResolvedValue({ tokenVersion: 1, deletionDueAt: new Date(Date.now() + RECOVERY_MS) });
    expect(await validatePayload(payload, undefined, finder)).toBeNull();
    expect(await validatePayload(payload, undefined, finder, true)).not.toBeNull();
    finder.mockResolvedValue({ tokenVersion: 1, deletionDueAt: new Date(Date.now() - 1) });
    expect(await validatePayload(payload, undefined, finder, true)).toBeNull();
  });
  test('phone formatting cannot evade keyed block; recovery boundary is strict', () => {
    expect(phoneDigest('+91 98765 43210')).toBe(phoneDigest('9876543210'));
    expect(phoneDigest('9876543210')).not.toContain('9876543210');
    const due = new Date('2026-11-10T00:00:00Z');
    expect(recoveryOpen(due, new Date(due.getTime() - 1))).toBe(true);
    expect(recoveryOpen(due, due)).toBe(false);
  });
});
