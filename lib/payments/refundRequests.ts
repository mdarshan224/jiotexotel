import {refundIdempotencyKey} from './refundWorkflow';
import { refundWalletOrderPayment } from '@/lib/wallet';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import {
  RazorpayRefundError,
  refundRazorpayPayment,
} from '@/lib/payments/razorpay';

export const REFUND_REQUEST_STATUSES = [
  'PENDING_ADMIN_REVIEW',
  'APPROVED',
  'REJECTED',
  'REFUND_PROCESSING',
  'REFUNDED',
  'REFUND_FAILED',
  'REFUND_STATUS_UNKNOWN',
] as const;

export type RefundRequestStatus = (typeof REFUND_REQUEST_STATUSES)[number];

export function isTableMissingError(error: unknown): boolean {
  if (!error) return false;
  if ((error as any).code === 'P2021') return true;
  const msg = (error as any).message || String(error);
  return /table .* does not exist|relation .* does not exist/i.test(msg);
}

export async function createRefundRequestForCapturedPayment(
  tx: Prisma.TransactionClient,
  orderId: string,
  requestedByUserId: string,
) {
  const existing = await tx.refundRequest.findUnique({
    where: { orderId },
  });
  if (existing) return existing;

  const payment = await tx.payment.findFirst({
    where: {
      orderId,
      direction: 'CUSTOMER_PAYS',
      status: 'CAPTURED',
      paymentId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment || !payment.paymentId) return null;

  return await tx.refundRequest.create({
    data: {
      orderId,
      paymentId: payment.id,
      requestedByUserId,
      amount: payment.amount,
      status: 'PENDING_ADMIN_REVIEW',
    },
  });
}

function isUncertainRefundError(error: unknown) {
  return error instanceof RazorpayRefundError
    ? error.uncertain
    : error instanceof Error &&
      /abort|timeout|network|fetch|socket|econn/i.test(error.message);
}

export async function processApprovedRefund(
  refundRequestId: string,
  reviewerId: string,
  action: 'approve' | 'reject' | 'retry',
  reason?: string,
) {
  const reviewReason = reason?.trim().slice(0, 500) || null;

  if (action === 'reject') {
    const result = await db.refundRequest.updateMany({
      where: { id: refundRequestId, status: 'PENDING_ADMIN_REVIEW' },
      data: {
        status: 'REJECTED',
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
        reviewReason,
      },
    });
    if (result.count !== 1) {
      throw new Error('Refund request is no longer awaiting review.');
    }
    return db.refundRequest.findUnique({ where: { id: refundRequestId } });
  }

  const allowedStatuses =
    action === 'retry'
      ? ['REFUND_FAILED']
      : ['PENDING_ADMIN_REVIEW'];

  const claimed = await db.$transaction(async tx=>{
    const request=await tx.refundRequest.findUnique({where:{id:refundRequestId}});
    if(!request||!allowedStatuses.includes(request.status))throw new Error('Refund request is already being processed or completed.');
    if(await tx.refundAttempt.count({where:{paymentId:request.paymentId}}))throw new Error('This payment already has a refund attempt. Reconcile it from Payments before proceeding.');
    const paymentClaim=await tx.payment.updateMany({where:{id:request.paymentId,status:action==='retry'?'REFUND_FAILED':'CAPTURED'},data:{status:'REFUND_PROCESSING'}});
    if(paymentClaim.count!==1)throw new Error('This payment is already being refunded or is no longer captured.');
    return tx.refundRequest.updateMany({
    where: {
      id: refundRequestId,
      status: { in: allowedStatuses },
    },
    data: {
      status: 'REFUND_PROCESSING',
      reviewedByUserId: reviewerId,
      reviewedAt: new Date(),
      reviewReason,
      failureReason: null,
    },
  });
  });
  if (claimed.count !== 1) {
    throw new Error('Refund request is already being processed or completed.');
  }

  const request = await db.refundRequest.findUnique({
    where: { id: refundRequestId },
    include: { payment: true },
  });
  if (!request?.payment.paymentId) {
    await db.refundRequest.update({
      where: { id: refundRequestId },
      data: {
        status: 'REFUND_FAILED',
        failureReason: 'The captured payment has no Razorpay payment ID.',
      },
    });
    throw new Error('The captured payment has no Razorpay payment ID.');
  }

  let providerSubmitted=false;
  try {
    if (request.payment.gateway === 'WALLET' && request.payment.paymentId === `wallet:${request.orderId}`) {
      return await db.$transaction(async tx => {
        const order=await tx.order.findUnique({where:{id:request.orderId}});
        if(!order)throw new Error('Order was not found.');
        await refundWalletOrderPayment(tx,{customerId:order.customerId,orderId:order.id,amount:request.amount});
        await tx.payment.update({where:{id:request.paymentId},data:{status:'REFUNDED'}});
        await tx.order.update({where:{id:order.id},data:{paymentStatus:'REFUNDED'}});
        return tx.refundRequest.update({where:{id:request.id},data:{status:'REFUNDED',failureReason:null}});
      });
    }
    providerSubmitted=true;
    const refund = await refundRazorpayPayment(
      request.payment.paymentId,
      Math.round(request.amount * 100),
      {
        reason: reviewReason || 'Admin-approved order cancellation refund',
        refundRequestId,
        orderId: request.orderId,
        refund_request_key:refundIdempotencyKey(request.paymentId),
      },
      refundIdempotencyKey(request.paymentId),
    );

    if (refund.status !== 'processed') {
      await db.refundRequest.update({
        where: { id: refundRequestId },
        data: {
          status: 'REFUND_STATUS_UNKNOWN',
          razorpayRefundId: refund.id,
          failureReason: `Razorpay refund status is ${refund.status || 'unknown'}.`,
        },
      });
      throw new RazorpayRefundError(
        'Razorpay accepted the refund but has not confirmed it as processed.',
        true,
      );
    }

    return db.$transaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: refundRequestId },
        data: {
          status: 'REFUNDED',
          razorpayRefundId: refund.id,
          failureReason: null,
        },
      });
      await tx.payment.update({
        where: { id: request.paymentId },
        data: { status: 'REFUNDED' },
      });
      await tx.order.update({
        where: { id: request.orderId },
        data: { paymentStatus: 'REFUNDED' },
      });
      return tx.refundRequest.findUnique({ where: { id: refundRequestId } });
    });
  } catch (error) {
    const status = (isUncertainRefundError(error) || (providerSubmitted && !(error instanceof RazorpayRefundError && !error.uncertain)))
      ? 'REFUND_STATUS_UNKNOWN'
      : 'REFUND_FAILED';
    const message = error instanceof Error ? error.message : 'Refund failed.';
    await db.$transaction(async tx=>{
      await tx.refundRequest.update({where:{id:refundRequestId},data:{status,failureReason:message}});
      const paymentStatus=status==='REFUND_FAILED'?'REFUND_FAILED':'REFUND_PENDING_RECONCILIATION';
      await tx.payment.updateMany({where:{id:request.paymentId,status:'REFUND_PROCESSING'},data:{status:paymentStatus}});
      await tx.order.updateMany({where:{id:request.orderId,paymentStatus:{not:'REFUNDED'}},data:{paymentStatus}});
    });
    throw error;
  }
}
