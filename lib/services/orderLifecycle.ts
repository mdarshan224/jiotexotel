import {reconcilePickupMilestonesTx} from '@/lib/pickupMilestones';
import { initializePickupGate, requirePickupVerified } from '@/lib/orders/pickupOtp';
import { recordPickupEarnings, earningsTax } from '@/lib/agentEarnings';
import { agentOnboardingApproved } from '@/lib/cashfree/agentOnboarding';
import { Prisma } from "@prisma/client";
import { db, DEFAULT_TRANSACTION_OPTIONS } from "../db";
import { validateStatusTransition } from "../validations/schemas";

export class InvalidOrderTransitionError extends Error {
  constructor(fromStatus: string, toStatus: string) {
    super(`Invalid order status transition from ${fromStatus} to ${toStatus}.`);
    this.name = "InvalidOrderTransitionError";
  }
}

export type OrderTransitionResult<T> =
  | { changed: false; order: null }
  | { changed: true; order: T };

type TransitionOptions<T> = {
  orderId: string;
  expectedStatus: string;
  expectedAgentId?: string | null;
  newStatus: string;
  additionalWhere?: Prisma.OrderWhereInput;
  changedByUserId?: string | null;
  notes?: string | null;
  orderData?: Prisma.OrderUncheckedUpdateManyInput;
  include?: Prisma.OrderInclude;
  afterHistory?: (tx: Prisma.TransactionClient) => Promise<void>;
};

/**
 * Performs one guarded lifecycle transition. The compare-and-set update,
 * history record, and caller-supplied side effects commit or roll back as one.
 * Bounded by strict pool acquisition and execution timeouts.
 */
export async function transitionOrder<T = unknown>(
  options: TransitionOptions<T>,
): Promise<OrderTransitionResult<T>> {
  const {
    orderId,
    expectedStatus,
    expectedAgentId,
    newStatus,
    additionalWhere = {},
    changedByUserId = null,
    notes = null,
    orderData = {},
    include,
    afterHistory,
  } = options;

  if (!validateStatusTransition(expectedStatus, newStatus)) {
    throw new InvalidOrderTransitionError(expectedStatus, newStatus);
  }

  try {
    return await db.$transaction(
      async (tx) => {
        const changed = await tx.order.updateMany({
          where: {
            ...additionalWhere,
            id: orderId,
            status: expectedStatus,
            ...(expectedAgentId !== undefined ? { agentId: expectedAgentId } : {}),
          },
          data: { ...orderData, status: newStatus },
        });

        if (changed.count !== 1) return { changed: false, order: null };

        await tx.orderStatusHistory.create({
          data: {
            orderId,
            oldStatus: expectedStatus,
            newStatus,
            changedByUserId,
            notes,
          },
        });

        if (newStatus === 'AGENT_ARRIVED') await initializePickupGate(tx, orderId);
        if (['WASTE_VERIFICATION','WEIGHING','PICKUP_COMPLETED'].includes(newStatus)) {
          const current=await tx.order.findUnique({where:{id:orderId},select:{agentId:true}});
          await requirePickupVerified(tx,orderId,current?.agentId);
        }
        if (afterHistory) await afterHistory(tx);

        if (newStatus === 'PICKUP_COMPLETED' || newStatus === 'SETTLEMENT_COMPLETED') {
          const completed = await tx.order.findUnique({where:{id:orderId}});
          if(completed?.customerId)await reconcilePickupMilestonesTx(tx,completed.customerId);
          if (completed?.agentId) {
            const split = await recordPickupEarnings(tx, {agentId:completed.agentId,orderId:completed.id,orderNumber:completed.orderNumber,amount:completed.finalAmount,gstRate:completed.gstRate});
            if (newStatus === 'PICKUP_COMPLETED') {
              const tax = earningsTax(split);
              await tx.order.update({where:{id:orderId},data:{pickupFee:tax.pickupFee,serviceFee:tax.serviceFee,taxableAmount:tax.taxableAmount,gstRate:tax.gstRate,gstAmount:tax.gstAmount,cgstAmount:tax.cgstAmount,sgstAmount:tax.sgstAmount,igstAmount:tax.igstAmount}});
            }
            if (!await agentOnboardingApproved(tx, completed.agentId)) await tx.agent.update({where:{id:completed.agentId},data:{status:'OFFLINE'}});
          }
        }

        const order = await tx.order.findUnique({
          where: { id: orderId },
          ...(include ? { include } : {}),
        });

        return { changed: true, order: order as T };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: DEFAULT_TRANSACTION_OPTIONS.maxWait,
        timeout: DEFAULT_TRANSACTION_OPTIONS.timeout,
      }
    );
  } catch (error: any) {
    if (error?.code === "P2034") return { changed: false, order: null };
    throw error;
  }
}
