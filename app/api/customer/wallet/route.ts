import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { getOrCreateWallet, getSpendableWalletPaise, fromPaise } from '@/lib/wallet';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
  }

  try {
    const wallet = await getOrCreateWallet(authUser.customerId);
    const transactions = await db.walletTransaction.findMany({
      where: { customerId: authUser.customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const availablePaise = await getSpendableWalletPaise(db, wallet);
    return NextResponse.json({ success: true, data: { wallet: {...wallet, availableBalance:fromPaise(availablePaise), availableBalancePaise:availablePaise}, transactions } });
  } catch (error) {
    console.error('Customer wallet lookup failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to load wallet details.' }, { status: 500 });
  }
}
