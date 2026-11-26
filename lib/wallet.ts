import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { dispatchCustomerWalletNotification } from '@/lib/services/walletNotification';

export const walletTransactionTypes = {
  topup: 'TOPUP',
  manualCredit: 'MANUAL_CREDIT',
  manualDebit: 'MANUAL_DEBIT',
  walletDebit: 'WALLET_DEBIT',
} as const;

export function toPaise(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Invalid monetary amount.');
  return Math.round(value * 100);
}

export function fromPaise(value: number): number {
  return value / 100;
}

type WalletTransactionClient = Prisma.TransactionClient;

export async function spendWalletPaise(
  tx: WalletTransactionClient,
  input: {
    customerId: string;
    amountPaise: number;
    referenceId: string;
    reason: string;
    insufficientMessage?: string;
  },
) {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) throw new Error('Wallet debit amount must be greater than zero.');
  const existing = await tx.walletTransaction.findFirst({
    where: { customerId: input.customerId, referenceId: input.referenceId, type: walletTransactionTypes.walletDebit, status: 'SUCCESS' },
  });
  if (existing) return { alreadyProcessed: true, transaction: existing, allocations: [] };

  const wallet = await tx.customerWallet.upsert({
    where: { customerId: input.customerId },
    update: {},
    create: { customerId: input.customerId, balance: 0, balancePaise: 0, paidBalancePaise: 0 },
  });
  await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${wallet.id}`;
  const lockedWallet = await tx.customerWallet.findUnique({ where: { id: wallet.id } });
  if (!lockedWallet) throw new Error('Customer wallet was not found.');
  const currentBalancePaise = typeof lockedWallet.balancePaise === 'number' ? lockedWallet.balancePaise : toPaise(lockedWallet.balance);
  if (currentBalancePaise < input.amountPaise) throw new Error(input.insufficientMessage || 'Insufficient wallet balance for this payment.');

  const grants = await tx.walletBonusGrant.findMany({
    where: { walletId: wallet.id, status: 'ACTIVE', remainingPaise: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  let remaining = input.amountPaise;
  const allocations: Array<{ grantId: string; consumedPaise: number }> = [];
  for (const grant of grants) {
    if (remaining <= 0) break;
    await tx.$queryRaw`SELECT "id" FROM "WalletBonusGrant" WHERE "id" = ${grant.id}`;
    const lockedGrant = await tx.walletBonusGrant.findUnique({ where: { id: grant.id } });
    if (!lockedGrant || lockedGrant.status !== 'ACTIVE' || lockedGrant.remainingPaise <= 0) continue;
    const consumedPaise = Math.min(remaining, lockedGrant.remainingPaise);
    allocations.push({ grantId: grant.id, consumedPaise });
    remaining -= consumedPaise;
  }

  const nextBalancePaise = currentBalancePaise - input.amountPaise;
  const promotionalConsumedPaise = allocations.reduce((sum, allocation) => sum + allocation.consumedPaise, 0);
  const paidDebitPaise = input.amountPaise - promotionalConsumedPaise;
  const currentPaidBalancePaise = typeof lockedWallet.paidBalancePaise === 'number'
    ? lockedWallet.paidBalancePaise
    : Math.max(0, currentBalancePaise - grants.reduce((sum, grant) => sum + grant.remainingPaise, 0));
  const nextPaidBalancePaise = currentPaidBalancePaise - paidDebitPaise;
  if (nextPaidBalancePaise < 0) throw new Error(input.insufficientMessage || 'Insufficient wallet balance for this payment.');
  const updatedWallet = await tx.customerWallet.update({
    where: { id: wallet.id },
    data: { balancePaise: nextBalancePaise, paidBalancePaise: nextPaidBalancePaise, balance: fromPaise(nextBalancePaise) },
  });
  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      customerId: input.customerId,
      type: walletTransactionTypes.walletDebit,
      amount: fromPaise(input.amountPaise),
      amountPaise: input.amountPaise,
      balanceAfter: updatedWallet.balance,
      balanceAfterPaise: nextBalancePaise,
      status: 'SUCCESS',
      referenceId: input.referenceId,
      reason: input.reason,
    },
  });
  for (const allocation of allocations) {
    await tx.walletBonusGrant.update({
      where: { id: allocation.grantId },
      data: {
        remainingPaise: { decrement: allocation.consumedPaise },
        status: lockedGrantRemainingAfter(allocations, allocation, grantRemaining(grants, allocation.grantId)) === 0 ? 'CONSUMED' : 'ACTIVE',
      },
    });
    await tx.walletBonusConsumption.create({
      data: { grantId: allocation.grantId, walletTransactionId: transaction.id, consumedPaise: allocation.consumedPaise },
    });
  }

  function grantRemaining(
    grants: Array<{ id: string; remainingPaise: number }>,
    grantId: string,
  ) {
    return grants.find((grant) => grant.id === grantId)?.remainingPaise ?? 0;
  }

  function lockedGrantRemainingAfter(
    allocations: Array<{ grantId: string; consumedPaise: number }>,
    allocation: { grantId: string; consumedPaise: number },
    originalRemaining: number,
  ) {
    return originalRemaining - allocations
      .filter((item) => item.grantId === allocation.grantId)
      .reduce((sum, item) => sum + item.consumedPaise, 0);
  }
  return { alreadyProcessed: false, wallet: updatedWallet, transaction, allocations };
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseBenefits(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function getOrCreateWallet(customerId: string) {
  return db.customerWallet.upsert({
    where: { customerId },
    update: {},
    create: { customerId },
  });
}

export async function applyWalletAdjustment(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    amount: number;
    type: 'MANUAL_CREDIT' | 'MANUAL_DEBIT';
    adminId: string;
    reason: string;
    referenceId?: string;
  },
) {
  const amount = roundCurrency(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Wallet adjustment amount must be greater than zero.');
  }
  if (input.type === walletTransactionTypes.manualDebit) {
    const debit = await spendWalletPaise(tx, {
      customerId: input.customerId,
      amountPaise: toPaise(amount),
      referenceId: input.referenceId || `admin-debit:${input.customerId}:${Date.now()}`,
      reason: input.reason,
      insufficientMessage: 'Wallet balance cannot become negative.',
    });
    if (debit.alreadyProcessed) return { wallet: null, transaction: debit.transaction };
    const transaction = await tx.walletTransaction.update({
      where: { id: debit.transaction.id },
      data: { adminId: input.adminId, type: input.type },
    });
    await dispatchCustomerWalletNotification(tx, {
      customerId: input.customerId,
      type: input.type,
      amount,
      balanceAfter: transaction.balanceAfter,
      reason: input.reason,
      referenceId: input.referenceId,
    });
    return { wallet: debit.wallet, transaction };
  }

  const wallet = await tx.customerWallet.upsert({
    where: { customerId: input.customerId },
    update: {},
    create: { customerId: input.customerId },
  });

  await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${wallet.id}`;
  const lockedWallet = await tx.customerWallet.findUnique({ where: { id: wallet.id } });
  if (!lockedWallet) throw new Error('Customer wallet was not found.');

  const nextBalance = roundCurrency(lockedWallet.balance + amount);
  if (nextBalance < 0) throw new Error('Wallet balance cannot become negative.');

  const updatedWallet = await tx.customerWallet.update({
    where: { id: lockedWallet.id },
    data: { balance: nextBalance, balancePaise: toPaise(nextBalance), paidBalancePaise: (typeof lockedWallet.paidBalancePaise === 'number' ? lockedWallet.paidBalancePaise : toPaise(lockedWallet.balance)) + toPaise(amount) },
  });
  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: updatedWallet.id,
      customerId: input.customerId,
      type: input.type,
      amount,
      amountPaise: toPaise(amount),
      balanceAfter: nextBalance,
      balanceAfterPaise: toPaise(nextBalance),
      status: 'SUCCESS',
      referenceId: input.referenceId,
      reason: input.reason,
      adminId: input.adminId,
    },
  });
  await dispatchCustomerWalletNotification(tx, {
    customerId: input.customerId,
    type: input.type,
    amount,
    balanceAfter: nextBalance,
    reason: input.reason,
    referenceId: input.referenceId,
  });
  return { wallet: updatedWallet, transaction };
}

/** Refund to the original wallet buckets; promotional expiry dates never change. */
export async function refundWalletOrderPayment(tx: Prisma.TransactionClient, input: {customerId:string;orderId:string;amount:number}) {
  const referenceId=`wallet-refund:${input.orderId}`;
  const previous=await tx.walletTransaction.findFirst({where:{customerId:input.customerId,referenceId,type:'REFUND',status:'SUCCESS'}});
  if(previous)return previous;
  const debit=await tx.walletTransaction.findFirst({where:{customerId:input.customerId,referenceId:`order:${input.orderId}`,type:'WALLET_DEBIT',status:'SUCCESS'}});
  if(!debit || toPaise(debit.amount)!==toPaise(input.amount))throw new Error('Original wallet payment ledger could not be verified.');
  const wallet=await tx.customerWallet.findUnique({where:{id:debit.walletId}});
  if(!wallet)throw new Error('Wallet was not found.');
  const allocations=await tx.walletBonusConsumption.findMany({where:{walletTransactionId:debit.id},include:{grant:true}});
  const bonusPaise=allocations.reduce((sum,a)=>sum+a.consumedPaise,0);
  const amountPaise=toPaise(input.amount);
  if(bonusPaise>amountPaise)throw new Error('Original wallet payment allocation is inconsistent.');
  for(const allocation of allocations){
    if(allocation.grant.walletId!==wallet.id)throw new Error('Wallet bonus ownership is inconsistent.');
    await tx.walletBonusGrant.update({where:{id:allocation.grantId},data:{remainingPaise:{increment:allocation.consumedPaise},status:'ACTIVE'}});
  }
  const balancePaise=(wallet.balancePaise ?? toPaise(wallet.balance))+amountPaise;
  const paidBalancePaise=(wallet.paidBalancePaise ?? toPaise(wallet.balance))+amountPaise-bonusPaise;
  const updated=await tx.customerWallet.update({where:{id:wallet.id},data:{balancePaise,paidBalancePaise,balance:fromPaise(balancePaise)}});
  return tx.walletTransaction.create({data:{walletId:wallet.id,customerId:input.customerId,type:'REFUND',status:'SUCCESS',referenceId,amount:input.amount,amountPaise,balanceAfter:updated.balance,balanceAfterPaise:balancePaise,reason:`Refund for order ${input.orderId}; original bonus expiry retained.`}});
}

/** Read the spendable balance without allowing expired bonus points to count as paid funds. */
export async function getSpendableWalletPaise(client: Pick<Prisma.TransactionClient,'walletBonusGrant'>, wallet: {id:string; balance:number; balancePaise:number; paidBalancePaise:number}) {
  const grants = await client.walletBonusGrant.findMany({where:{walletId:wallet.id,status:'ACTIVE',remainingPaise:{gt:0},OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}});
  return Math.max(0,Math.min(wallet.balancePaise, wallet.paidBalancePaise + grants.reduce((sum,grant)=>sum+grant.remainingPaise,0)));
}
