import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { fetchRazorpayPayment, captureRazorpayPayment, verifyRazorpayPaymentSignature } from '@/lib/payments/razorpay';
import {fulfillSubscriptionPurchase} from '@/lib/payments/catalog';
import { dispatchSubscriptionNotification } from '@/lib/services/walletNotification';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const paymentId = typeof body.paymentId === 'string' ? body.paymentId : '';
    const razorpayOrderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id : '';
    const razorpayPaymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
    const razorpaySignature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : '';
    const paymentRecord = await db.subscriptionPayment.findFirst({
      where: { id: paymentId, customerId: authUser.customerId },
      include: { offer: true },
    });
    if (!paymentRecord || !paymentRecord.gatewayOrderId || paymentRecord.gatewayOrderId !== razorpayOrderId) {
      return NextResponse.json({ success: false, message: 'Subscription payment was not found.' }, { status: 404 });
    }
    if (paymentRecord.status === 'SUCCESS') {
      const existing = await db.customerSubscription.findUnique({ where: { paymentId: paymentRecord.id } });
      return NextResponse.json({ success: true, alreadyProcessed: true, data: existing });
    }
    if (!verifyRazorpayPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return NextResponse.json({ success: false, message: 'Payment signature verification failed.' }, { status: 400 });
    }
    let gatewayPayment = await fetchRazorpayPayment(razorpayPaymentId);
    if(gatewayPayment.status==='authorized'&&gatewayPayment.order_id===paymentRecord.gatewayOrderId&&gatewayPayment.currency==='INR'&&gatewayPayment.amount===Math.round(paymentRecord.amount*100))gatewayPayment=await captureRazorpayPayment(gatewayPayment.id,gatewayPayment.amount);
    if (
      gatewayPayment.order_id !== paymentRecord.gatewayOrderId ||
      gatewayPayment.amount !== Math.round(paymentRecord.amount * 100) ||
      gatewayPayment.currency !== 'INR' ||
      gatewayPayment.status !== 'captured'
    ) {
      return NextResponse.json({ success: false, message: 'Payment was not captured for the expected amount.' }, { status: 400 });
    }

    const subscription=await fulfillSubscriptionPurchase(paymentRecord.id,gatewayPayment,razorpaySignature);
    return NextResponse.json({ success: true, data: subscription });
  } catch (error) {
    console.error('Subscription payment verification failed:', error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Subscription payment verification failed.' }, { status: 400 });
  }
}
