import {hasFreshAgentPresence} from '@/lib/agents/locationPolicy';
import {assignmentStillOpenWhere} from '@/lib/orders/assignmentDeadline';
import { agentOnboardingApproved } from '@/lib/cashfree/agentOnboarding';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { broadcaster } from '@/lib/realtime';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { invalidateAdminAgentsCache } from '@/lib/cache/adminAgentsCache';
import { invalidateAdminStatsCache } from '@/lib/cache/adminStatsCache';
import {
  broadcastAgentBookingNotification,
  persistAgentBookingNotificationOnce,
} from '@/lib/services/agentBookingNotification';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req);
    if (!requireAdminUser(authUser)) {
      return errorResponse('FORBIDDEN', 'Admin access is required to assign orders.', 403);
    }
    const body = await req.json().catch(() => ({}));
    const { agentId } = body;

    if (!agentId || typeof agentId !== 'string') {
      return errorResponse('INVALID_AGENT', 'A valid agentId is required for assignment.', 400);
    }

    const order = await db.order.findUnique({
      where: { id },
      include: { agent: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } }, customer: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } } },
    });

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } },
    });

    if (!agent) {
      return errorResponse('AGENT_NOT_FOUND', `Agent with ID ${agentId} not found.`, 404);
    }

    if (!await agentOnboardingApproved(db, agentId)) return errorResponse('AGENT_KYC_REQUIRED', 'Complete agent identity verification and admin review before accepting pickups.', 409);

    if (order.agentId === agentId && order.status === 'AGENT_ASSIGNED') {
      return successResponse(order, 200, { message: 'Agent is already assigned to this order.' });
    }

    if (agent.status !== 'AVAILABLE' && order.agentId !== agentId) {
      return errorResponse('AGENT_NOT_AVAILABLE', 'Agent is currently offline or unavailable for new assignments.', 400);
    }

    const oldStatus = order.status;
    const newStatus = 'AGENT_ASSIGNED';

    if (!validateStatusTransition(oldStatus, newStatus)) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot assign agent from order status ${oldStatus}.`, 400);
    }

    const assignmentNotification = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      agentId,
      agentUserId: agent.userId,
      status: newStatus,
    };

    const result = await db.$transaction(async (tx) => {
      if (!await agentOnboardingApproved(tx, agentId)) throw new Error('AGENT_KYC_REQUIRED');
      const currentAgent=await tx.agent.findUnique({where:{id:agentId}});
      if(!currentAgent||!hasFreshAgentPresence(currentAgent)||!['AVAILABLE','ASSIGNED'].includes(currentAgent.status))throw new Error('AGENT_LOCATION_REQUIRED');
      const busy=await tx.order.findFirst({where:{agentId,id:{not:order.id},status:{in:['AGENT_ASSIGNED','AGENT_ACCEPTED','AGENT_ON_WAY','AGENT_ARRIVED','WASTE_VERIFICATION','WEIGHING']}},select:{id:true}});
      if(busy)throw new Error('AGENT_LOCATION_REQUIRED');
      const updated = await tx.order.updateMany({
        where: { id, agentId: order.agentId, status: oldStatus, AND:[assignmentStillOpenWhere()] },
        data: { agentId, status: newStatus },
      });

      if (updated.count !== 1) {
        const currentOrder = await tx.order.findUnique({
          where: { id },
          include: { agent: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } }, customer: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } } },
        });
        return { changed: false as const, notificationCreated: false, order: currentOrder };
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          oldStatus,
          newStatus,
          changedByUserId: authUser?.userId || null,
          notes: `Assigned agent ${agent.user.name} (${agent.vehicleNumber})`,
        },
      });

      await tx.notification.create({
        data: {
          userId: order.customer.userId,
          orderId: order.id,
          type: 'WHATSAPP',
          recipient: order.customer.user.phone,
          content: `Agent ${agent.user.name} (${agent.vehicleNumber}) has been assigned to your Junk It Out pickup ${order.orderNumber}.`,
          status: 'SENT',
        },
      });

      const notificationCreated = order.financialDirection !== 'CUSTOMER_PAYS' || order.paymentStatus === 'CAPTURED'
        ? await persistAgentBookingNotificationOnce(tx, assignmentNotification)
        : false;

      await tx.agent.update({
        where: { id: agentId },
        data: { status: 'ASSIGNED' },
      });

      await tx.auditLog.create({
        data: {
          userId: authUser?.userId || null,
          userName: authUser ? authUser.phone : 'Admin',
          action: 'AGENT_ASSIGNED',
          oldValue: order.agent ? order.agent.user.name : 'Unassigned',
          newValue: agent.user.name,
        },
      });

      const assignedOrder = await tx.order.findUnique({
        where: { id },
        include: {
          agent: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
          customer: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
          address: true,
          items: { include: { category: true } },
        },
      });

      return { changed: true as const, notificationCreated, order: assignedOrder };
    });

    if (!result.changed) {
      if (result.order?.agentId === agentId && result.order.status === 'AGENT_ASSIGNED') {
        return successResponse(result.order, 200, { message: 'Agent is already assigned to this order.' });
      }
      return errorResponse('CONFLICT', 'Order assignment changed before this request completed.', 409);
    }

    invalidateAdminAgentsCache();
    invalidateAdminStatsCache();

    if (result.order) {
      broadcaster.broadcast('ORDER_UPDATED', result.order);
    }
    broadcaster.broadcast('ORDER_ASSIGNED', { orderId: id, agentId, agentName: agent.user.name });
    broadcastAgentBookingNotification(assignmentNotification, result.notificationCreated, (event, payload) =>
      broadcaster.broadcast(event, payload),
    );

    return successResponse(result.order);
  } catch (err: any) {
    if(err?.message==='AGENT_LOCATION_REQUIRED')return errorResponse('AGENT_LOCATION_REQUIRED','Agent must be online with fresh, verified Bengaluru GPS and no other pickup.',409);
    if (err?.message === 'AGENT_KYC_REQUIRED') return errorResponse('AGENT_KYC_REQUIRED', 'Agent identity verification and review are required.', 409);
    console.error('Assign agent error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to assign agent.', 500);
  }
}
