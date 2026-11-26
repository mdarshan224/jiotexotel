import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ auth: null as any, update: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { user: { updateMany: state.update } } }));
vi.mock('@/lib/auth/middleware', () => ({ getAuthUser: async () => state.auth }));
import { PATCH } from '@/app/api/customer/profile/route';
const request = (body: any, origin = 'https://junkitout.in') => new NextRequest('https://junkitout.in/api/customer/profile', { method: 'PATCH', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { state.auth = { role: 'CUSTOMER', userId: 'customer-1' }; state.update.mockReset().mockResolvedValue({ count: 1 }); });
describe('customer settings authorization', () => {
  it('requires a session and rejects cross-origin writes', async () => {
    state.auth = null; expect((await PATCH(request({ name: 'Sam' }))).status).toBe(401);
    expect((await PATCH(request({ name: 'Sam' }, 'https://untrusted.example'))).status).toBe(403);
    expect(state.update).not.toHaveBeenCalled();
  });
  it('rejects other roles and malformed details', async () => {
    state.auth.role = 'AGENT'; expect((await PATCH(request({ name: 'Sam' }))).status).toBe(403);
    state.auth.role = 'CUSTOMER'; expect((await PATCH(request({ name: ' ' }))).status).toBe(400);
    expect((await PATCH(request({ name: 'Sam', email: 'bad' }))).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });
  it('updates only the authenticated active customer; ignores phone, role and supplied user IDs', async () => {
    const response = await PATCH(request({ name: ' Sam ', email: ' SAM@example.com ', userId: 'other', phone: '1111111111', role: 'ADMIN' }));
    expect(response.status).toBe(200);
    expect(state.update).toHaveBeenCalledWith({ where: { id: 'customer-1', role: 'CUSTOMER', deletionDueAt: null }, data: { name: 'Sam', email: 'sam@example.com' } });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('does not edit an account pending deletion', async () => {
    state.update.mockResolvedValue({ count: 0 }); expect((await PATCH(request({ name: 'Sam' }))).status).toBe(409);
  });
});
