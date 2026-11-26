import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { AccountDeletionError, RECOVERY_MS, REJOIN_BLOCK_MS, canonicalPhone, phoneVariants, phoneDigest, recoveryOpen } from './accountDeletionPolicy';
import { deleteCustomerUploads } from './accountDeletionStorage';

type Store = Prisma.TransactionClient;
export async function assertPhoneCanLogin(phone: string, store: Store = db) {
  const user = await store.user.findFirst({ where: { phone: { in: phoneVariants(phone) } }, select: { deletionDueAt: true } });
  if (user?.deletionDueAt && !recoveryOpen(user.deletionDueAt)) {
    throw new AccountDeletionError('The recovery window has ended. Account deletion is in progress.');
  }
  // Fail closed if the deployment has not configured the HMAC secret.
  const block = await store.deletedPhoneBlock.findUnique({ where: { phoneHash: phoneDigest(phone) } });
  if (block && block.expiresAt > new Date()) {
    throw new AccountDeletionError(`This number can sign up again after ${block.expiresAt.toISOString()}.`);
  }
}

export async function changeAccountDeletion(userId: string, action: 'request' | 'recover') {
  return db.$transaction(async tx => {
    // Serializes duplicate requests and recovery against the final purge.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}`;
    const user = await tx.user.findUnique({ where: { id: userId }, include: { customer: true, admin: true, agent: true } });
    if (!user || user.role !== 'CUSTOMER' || !user.customer || user.admin || user.agent) {
      throw new AccountDeletionError('Only customer accounts can use this option.');
    }
    phoneDigest(user.phone); // Validate erasure configuration before accepting a request.
    const now = new Date();
    if (user.deletionDueAt && !recoveryOpen(user.deletionDueAt, now)) {
      throw new AccountDeletionError('The 48-hour recovery window has ended.', 409);
    }
    if (action === 'recover') {
      if (!user.deletionDueAt) return user;
      return tx.user.update({ where: { id: userId }, data: {
        deletionRequestedAt: null, deletionDueAt: null, tokenVersion: { increment: 1 },
      }, include: { customer: true } });
    }
    if (user.deletionDueAt) return user; // Never extend the original deadline.
    return tx.user.update({ where: { id: userId }, data: {
      deletionRequestedAt: now, deletionDueAt: new Date(now.getTime() + RECOVERY_MS), tokenVersion: { increment: 1 },
    }, include: { customer: true } });
  });
}

export async function purgeCustomer(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { customer: true, admin: true, agent: true } });
  if (!user || !user.customer || user.role !== 'CUSTOMER' || user.admin || user.agent || !user.deletionDueAt || recoveryOpen(user.deletionDueAt)) return false;
  const digest = phoneDigest(user.phone);
  // Delete storage before DB records; failures leave all ownership metadata for retry.
  // Recovery is impossible at/after dueAt, including while this retryable step runs.
  await deleteCustomerUploads(user.id, user.customer.id);
  return db.$transaction(async tx => {
    
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}`;
    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current?.deletionDueAt || recoveryOpen(current.deletionDueAt)) return false;
    const customerId = user.customer!.id;
    const orders = await tx.order.findMany({ where: { customerId }, select: { id: true } });
    const ids = orders.map(order => order.id);
    await tx.refundAttempt.deleteMany({ where: { orderId: { in: ids } } });
    await tx.refundRequest.deleteMany({ where: { OR: [{ orderId: { in: ids } }, { requestedByUserId: userId }] } });
    await tx.agentLocation.deleteMany({ where: { orderId: { in: ids } } });
    await tx.agentWalletTransaction.updateMany({ where: { orderId: { in: ids } }, data: {
      orderId: null, referenceId: null, reason: 'Customer account deleted', failureReason: null,
    } });
    await tx.notification.deleteMany({ where: { OR: [{ userId }, { orderId: { in: ids } }, { recipient: { in: phoneVariants(user.phone) } }] } });
    await tx.complaint.deleteMany({ where: { customerId } });
    await tx.review.deleteMany({ where: { customerId } });
    await tx.settlement.deleteMany({ where: { customerId } });
    await tx.order.deleteMany({ where: { customerId } });
    await tx.walletBonusConsumption.deleteMany({ where: { grant: { customerId } } });
    await tx.walletBonusGrant.deleteMany({ where: { customerId } });
    // Customer cascades remove wallet, transactions, subscriptions, payments and idempotency records.
    await tx.contactEnquiry.deleteMany({ where: { OR: [
      { phone: { in: phoneVariants(user.phone) } }, ...(user.email ? [{ email: user.email }] : []),
    ] } });
    // Audit snapshots can contain customer/order details even when written by an administrator.
    const identifiers = [userId, customerId, ...phoneVariants(user.phone), ...ids, ...(user.email ? [user.email] : [])];
    await tx.auditLog.deleteMany({ where: { OR: [
      { userId }, ...identifiers.flatMap(value => [{ oldValue: { contains: value } }, { newValue: { contains: value } }]),
    ] } });
    await tx.user.delete({ where: { id: userId } });
    await tx.deletedPhoneBlock.upsert({ where: { phoneHash: digest },
      create: { phoneHash: digest, expiresAt: new Date(Date.now() + REJOIN_BLOCK_MS) },
      update: { expiresAt: new Date(Date.now() + REJOIN_BLOCK_MS) },
    });
    return true;
  }, { timeout: 30000 });
}

export async function processAccountDeletions() {
  const due = await db.user.findMany({ where: { role: 'CUSTOMER', deletionDueAt: { lte: new Date() } },
    select: { id: true }, orderBy: { deletionDueAt: 'asc' }, take: 25 });
  let deleted = 0, failed = 0;
  for (const user of due) {
    try { if (await purgeCustomer(user.id)) deleted++; }
    catch { failed++; } // No personal information in job logs or responses.
  }
  await db.deletedPhoneBlock.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return { deleted, failed, batchSize: due.length };
}
