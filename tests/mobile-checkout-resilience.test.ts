import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); });
describe('mobile checkout recovery', () => {
  it('times out a stalled SDK and allows another attempt, while deduplicating concurrent loads', async () => {
    vi.useFakeTimers();
    let script: any = null;
    const append = vi.fn((element: any) => { script = element; });
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { getElementById: () => script, createElement: () => ({ setAttribute: vi.fn(), remove: () => { script = null; } }), head: { appendChild: append } });
    const { loadRazorpayScript } = await import('@/lib/razorpayClient');
    const first = loadRazorpayScript(); expect(loadRazorpayScript()).toBe(first); expect(append).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15001); expect(await first).toBe(false); expect(script).toBe(null);
    const second = loadRazorpayScript(); expect(append).toHaveBeenCalledTimes(2);
    (window as any).Razorpay = function() {};
    script.onload(); expect(await second).toBe(true);
  });
  it('persists only the public catalogue, never authentication or wallet responses', async () => {
    const saved = new Map<string,string>();
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => saved.get(key) || null, setItem: (key: string, value: string) => saved.set(key,value), removeItem: (key: string) => saved.delete(key) });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: [{ id: 'paper' }] })));
    vi.stubGlobal('fetch', fetchMock);
    let cache = await import('@/lib/clientRequestCache');
    await cache.getCachedClientJson('public-customer-waste-categories', '/api/waste-categories?customer=true', 15000);
    await cache.getCachedClientJson('authenticated-user', '/api/auth/me', 10000);
    expect(saved.size).toBe(1);
    vi.resetModules(); cache = await import('@/lib/clientRequestCache');
    await cache.getCachedClientJson('public-customer-waste-categories', '/api/waste-categories?customer=true', 15000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    cache.invalidateCachedClientJson('public-customer-waste-categories'); expect(saved.size).toBe(0);
  });
});
