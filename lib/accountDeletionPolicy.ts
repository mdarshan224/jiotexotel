import { createHmac } from 'node:crypto';
export const RECOVERY_MS = 48 * 60 * 60 * 1000;
export const REJOIN_BLOCK_MS = 30 * 24 * 60 * 60 * 1000;
export const canonicalPhone = (phone: string) => phone.replace(/\D/g, '').slice(-10);
export const phoneVariants = (phone: string) => {
  const digits = canonicalPhone(phone);
  return [digits, `+91${digits}`, `91${digits}`, `0${digits}`];
};
export function phoneDigest(phone: string): string {
  const key = process.env.ACCOUNT_DELETION_HMAC_SECRET;
  if (!key || key.length < 32) throw new Error('ACCOUNT_DELETION_HMAC_SECRET must contain at least 32 characters');
  return createHmac('sha256', key).update(canonicalPhone(phone)).digest('hex');
}
export function recoveryOpen(due: Date | null, now = new Date()): boolean {
  return due !== null && due.getTime() > now.getTime();
}
export class AccountDeletionError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}
