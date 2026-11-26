'use client';

type CacheEntry<T> = {
  value?: T;
  promise?: Promise<T>;
  expiresAt: number;
};

// Persist only the public material catalogue across document navigations.
// Authentication, wallet balances and customer records stay in memory only.
const PUBLIC_CATALOG_KEY = 'public-customer-waste-categories';
const PUBLIC_STORAGE_KEY = 'jio-public-catalog-v1';
function readPublicCatalog<T>(key: string): CacheEntry<T> | undefined {
  if (key !== PUBLIC_CATALOG_KEY || typeof window === 'undefined') return;
  try {
    const cached = JSON.parse(sessionStorage.getItem(PUBLIC_STORAGE_KEY) || 'null');
    if (cached?.expiresAt > Date.now() && cached?.value?.success && Array.isArray(cached?.value?.data)) return cached;
  } catch {}
}
const entries = new Map<string, CacheEntry<unknown>>();

export function getCachedClientJson<T>(
  key: string,
  url: string,
  ttlMs: number,
  options?: RequestInit & { force?: boolean }
): Promise<T> {
  const now = Date.now();
  const existing = (entries.get(key) as CacheEntry<T> | undefined) || readPublicCatalog<T>(key);
  const force = options?.force === true;

  if (!force && existing && existing.value !== undefined && existing.expiresAt > now) {
    return Promise.resolve(existing.value);
  }

  if (!force && existing?.promise) {
    return existing.promise;
  }

  const { force: _force, ...requestOptions } = options || {};
  const promise = fetch(url, requestOptions)
    .then(async (response) => {
      const data = (await response.json()) as T;
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const entry = { value: data, expiresAt: Date.now() + ttlMs };
      entries.set(key, entry);
      if (key === PUBLIC_CATALOG_KEY && typeof window !== 'undefined') {
        try { sessionStorage.setItem(PUBLIC_STORAGE_KEY, JSON.stringify(entry)); } catch {}
      }
      return data;
    })
    .catch((error) => {
      entries.delete(key);
      throw error;
    });

  entries.set(key, {
    ...existing,
    promise,
    expiresAt: 0,
  });
  return promise;
}

export function invalidateCachedClientJson(key: string) {
  entries.delete(key);
  if (key === PUBLIC_CATALOG_KEY && typeof window !== 'undefined') {
    try { sessionStorage.removeItem(PUBLIC_STORAGE_KEY); } catch {}
  }
}
