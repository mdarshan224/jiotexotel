import { PrismaClient, Prisma } from '@prisma/client';
import { env } from 'cloudflare:workers';
import { requestValue } from './requestScope';
import { AtomicD1 } from './sitesDatabase';

function database() {
  return requestValue('prisma', () => new PrismaClient({adapter:new AtomicD1(env.DB) as any}));
}
// Delay binding access until a request, so builds never connect to a database.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) { const client=database(); const value=(client as any)[property]; return typeof value === 'function' ? value.bind(client) : value; },
});
export const DEFAULT_TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;
export function isDatabaseConfigurationError(error: unknown) {
  return /binding|no such table|configuration/i.test(error instanceof Error ? error.message : String(error));
}
export async function runSafeTransaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T> {
  return db.$transaction(action, { ...DEFAULT_TRANSACTION_OPTIONS, ...options });
}
