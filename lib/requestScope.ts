import { AsyncLocalStorage } from 'node:async_hooks';
const storage = new AsyncLocalStorage<Map<string, unknown>>();
/** Never share pending I/O promises or a Prisma engine between Worker requests. */
export function runWithRequestScope<T>(action: () => T): T { return storage.run(new Map(), action); }
export function requestValue<T>(key: string, create: () => T): T {
  const scope = storage.getStore();
  if (!scope) return create();
  if (!scope.has(key)) scope.set(key, create());
  return scope.get(key) as T;
}
