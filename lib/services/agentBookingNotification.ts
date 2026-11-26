import { redactContactText } from '@/lib/orders/agentOrder';
import type { Prisma } from '@prisma/client';

export type AgentBookingAssignment = {
  orderId: string;
  orderNumber: string;
  agentId: string;
  agentUserId: string;
  agentPhone?: string;
  status: string;
};

export type AgentPickupOffer = {
  notificationId?: string;
  orderId: string;
  orderNumber: string;
  agentId: string;
  agentUserId: string;
  agentPhone: string;
  pickupAddress: string;
  latitude: number;
  longitude: number;
  mapsLink: string;
};

export function getAgentBookingNotificationId(orderId: string, agentId: string) {
  return `agent-booking-assignment-${orderId}-${agentId}`;
}

export function buildAgentBookingNotificationData(assignment: AgentBookingAssignment) {
  return {
    id: getAgentBookingNotificationId(assignment.orderId, assignment.agentId),
    userId: assignment.agentUserId,
    orderId: assignment.orderId,
    type: 'AGENT_BOOKING_ASSIGNED',
    recipient: `agent:${assignment.agentId}`,
    content: `Pickup order ${assignment.orderNumber} has been assigned to you.`,
    status: 'QUEUED',
    provider: 'IN_APP',
    deliveryStatus: 'queued',
    statusDescription: 'Queued for agent realtime delivery.',
  };
}

/**
 * Persist one in-app assignment notification per booking. The deterministic
 * primary key makes concurrent/retried assignment handlers idempotent without
 * requiring a schema migration.
 */
export async function persistAgentBookingNotificationOnce(
  tx: Pick<Prisma.TransactionClient, 'notification'>,
  assignment: AgentBookingAssignment,
) {
  return (await persistUniqueNotifications(tx, [buildAgentBookingNotificationData(assignment)])) === 1;
}

export function getAgentAssignmentSmsNotificationId(orderId: string, agentId: string) {
  return `agent-assignment-sms-${orderId}-${agentId}`;
}

export function buildAgentAssignmentSmsNotificationData(
  assignment: AgentBookingAssignment & { agentPhone: string; content: string },
) {
  return {
    id: getAgentAssignmentSmsNotificationId(assignment.orderId, assignment.agentId),
    userId: assignment.agentUserId,
    orderId: assignment.orderId,
    type: 'AGENT_BOOKING_ASSIGNED_SMS',
    recipient: assignment.agentPhone,
    content: assignment.content,
    status: 'QUEUED',
    provider: 'FAST2SMS_SMS',
    deliveryStatus: 'queued',
    statusDescription: 'Queued for assigned-agent SMS delivery.',
  };
}

export async function persistAgentAssignmentSmsOnce(
  tx: Pick<Prisma.TransactionClient, 'notification'>,
  assignment: AgentBookingAssignment & { agentPhone: string; content: string },
) {
  return (await persistUniqueNotifications(tx, [buildAgentAssignmentSmsNotificationData(assignment)])) === 1;
}

export type AgentAssignmentSmsDeliveryResult = {
  success: boolean;
  requestId?: string;
  error?: string;
};

export async function deliverAgentAssignmentSms(
  notification: {
    id: string;
    recipient: string;
    content: string;
  },
  dependencies: {
    claim: (notificationId: string) => Promise<boolean>;
    send: (input: { agentPhone: string; message: string }) => Promise<AgentAssignmentSmsDeliveryResult>;
    markSent: (notificationId: string, requestId?: string) => Promise<void>;
    markFailed: (notificationId: string, error?: string) => Promise<void>;
  },
) {
  if (!(await dependencies.claim(notification.id))) return false;

  try {
    const result = await dependencies.send({
      agentPhone: notification.recipient,
      message: notification.content,
    });
    if (result.success) {
      await dependencies.markSent(notification.id, result.requestId);
      return true;
    }
    await dependencies.markFailed(notification.id, result.error);
  } catch (error) {
    await dependencies.markFailed(
      notification.id,
      error instanceof Error ? error.message : 'SMS delivery failed.',
    );
  }
  return false;
}

export function broadcastAgentBookingNotification(
  assignment: AgentBookingAssignment,
  created: boolean,
  broadcast: (event: string, payload: unknown) => void,
) {
  if (!created) return false;

  broadcast('AGENT_BOOKING_ASSIGNED', {
    notificationId: getAgentBookingNotificationId(assignment.orderId, assignment.agentId),
    orderId: assignment.orderId,
    orderNumber: assignment.orderNumber,
    agentId: assignment.agentId,
    status: assignment.status,
  });
  return true;
}

export function getAgentPickupNotificationId(orderId: string, agentId: string) {
  // Retry safe for this recipient; a stale/offline recipient cannot pin an order forever.
  return `agent-pickup-available-${orderId}-${agentId}`;
}

export function buildAgentPickupNotificationData(offer: AgentPickupOffer) {
  return {
    id: getAgentPickupNotificationId(offer.orderId, offer.agentId),
    userId: offer.agentUserId,
    orderId: offer.orderId,
    type: 'AGENT_PICKUP_AVAILABLE',
    recipient: offer.agentPhone,
    content: `Pickup ${offer.orderNumber} is available at ${redactContactText(offer.pickupAddress)} (${offer.latitude}, ${offer.longitude}). Map: ${offer.mapsLink}`,
    status: 'QUEUED',
    provider: 'FAST2SMS',
    deliveryStatus: 'queued',
    statusDescription: 'Queued for Fast2SMS WhatsApp delivery.',
  };
}

export async function persistAgentPickupNotificationsOnce(
  tx: Pick<Prisma.TransactionClient, 'notification'>,
  offers: AgentPickupOffer[],
) {
  if (offers.length === 0) return 0;
  return persistUniqueNotifications(tx, offers.map(buildAgentPickupNotificationData));
}

export type AgentPickupDeliveryResult = {
  success: boolean;
  requestId?: string;
};

/** Delivery state is persisted separately from job creation so failed sends can be retried. */
export async function deliverAgentPickupNotifications(
  offers: AgentPickupOffer[],
  dependencies: {
    claim: (notificationId: string) => Promise<boolean>;
    send: (offer: AgentPickupOffer) => Promise<AgentPickupDeliveryResult>;
    markSent: (notificationId: string, requestId?: string) => Promise<void>;
    markFailed: (notificationId: string) => Promise<void>;
  },
) {
  for (const offer of offers) {
    const notificationId = offer.notificationId || getAgentPickupNotificationId(offer.orderId, offer.agentId);
    if (!(await dependencies.claim(notificationId))) continue;

    try {
      const result = await dependencies.send(offer);
      if (result.success) {
        await dependencies.markSent(notificationId, result.requestId);
      } else {
        await dependencies.markFailed(notificationId);
      }
    } catch {
      await dependencies.markFailed(notificationId);
    }
  }
}

async function persistUniqueNotifications(tx: Pick<Prisma.TransactionClient, 'notification'>, rows: Prisma.NotificationCreateManyInput[]) {
  let count = 0;
  for (const row of rows) {
    if (await tx.notification.findUnique({ where: { id: row.id }, select: { id: true } })) continue;
    await tx.notification.create({ data: row });
    count++;
  }
  return count;
}
