import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { fetchRazorpayPayment, captureRazorpayPayment, verifyRazorpayPaymentSignature } from '@/lib/payments/razorpay';
import { toPaise } from '@/lib/wallet';
import {fulfillWalletTopup} from '@/lib/payments/catalog';
import { dispatchCustomerWalletNotification } from '@/lib/services/walletNotification';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId : '';
    const razorpayOrderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id : '';
    const razorpayPaymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
    const razorpaySignature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : '';
    const transaction = await db.walletTransaction.findFirst({
      where: { id: transactionId, customerId: authUser.customerId, type: 'TOPUP' },
    });
    if (!transaction || !transaction.gatewayOrderId || transaction.gatewayOrderId !== razorpayOrderId) {
      return NextResponse.json({ success: false, message: 'Wallet top-up transaction was not found.' }, { status: 404 });
    }
    if (transaction.status === 'SUCCESS') {
      return NextResponse.json({ success: true, alreadyProcessed: true, data: transaction });
    }
    if (!verifyRazorpayPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return NextResponse.json({ success: false, message: 'Payment signature verification failed.' }, { status: 400 });
    }

    let payment = await fetchRazorpayPayment(razorpayPaymentId);
    if(payment.status==='authorized'&&payment.order_id===transaction.gatewayOrderId&&payment.currency==='INR'&&payment.amount===(transaction.amountPaise || toPaise(transaction.amount)))payment=await captureRazorpayPayment(payment.id,payment.amount);
    if (
      payment.order_id !== transaction.gatewayOrderId ||
      payment.amount !== (transaction.amountPaise || toPaise(transaction.amount)) ||
      payment.currency !== 'INR' ||
      payment.status !== 'captured'
    ) {
      return NextResponse.json({ success: false, message: 'Payment was not captured for the expected amount.' }, { status: 400 });
    }

    const result=await fulfillWalletTopup(transaction.id,payment);
    return NextResponse.json({ success: true, alreadyProcessed: result.alreadyProcessed, data: result });
  } catch (error) {
    console.error('Wallet top-up verification failed:', error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Wallet top-up verification failed.' }, { status: 400 });
  }
}
