import {publicWeightAdjustment} from './weightAdjustment';
/** Agent responses use a closed projection. Customer contact fields never cross this boundary. */
export function redactContactText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(/\+?\d(?:[\s().-]*\d){9,14}(?!\d)/g, '[contact hidden]');
}
export function agentOrder(order: any) {
  if (!order) return order;
  const address = order.address;
  let pendingWeights:any[]=[];try{pendingWeights=JSON.parse(order.weightAdjustment?.weightsJson||'[]');}catch{}
  return {
    weightAdjustment:publicWeightAdjustment(order.weightAdjustment),
    viewerRole: 'AGENT',
    pickupStartVerified: Boolean(order.pickupGate?.verifiedAt && order.pickupGate?.verifiedAgentId === order.agentId),
    id: order.id, orderId: order.id, orderNumber: order.orderNumber,
    agentId: order.agentId, status: order.status, createdAt: order.createdAt,
    pickupType: order.pickupType, scheduledSlot: redactContactText(order.scheduledSlot),
    financialDirection: order.financialDirection, paymentStatus: order.paymentStatus,
    estimatedTotal: order.estimatedTotal, actualTotal: order.actualTotal,
    finalAmount: order.finalAmount, pickupCharge: order.pickupCharge,
    discountAmount: order.discountAmount,
    customer: { user: { name: redactContactText(order.customer?.user?.name) || 'Customer' } },
    address: address ? {
      name: redactContactText(address.name), houseNo: redactContactText(address.houseNo),
      street: redactContactText(address.street), area: redactContactText(address.area),
      pincode: address.pincode, lat: address.lat, lng: address.lng,
      pickupInstructions: redactContactText(address.pickupInstructions),
    } : null,
    items: (order.items || []).map((item: any) => ({
      id: item.id, categoryId: item.categoryId,
      estimatedWeight: item.estimatedWeight, actualWeight: item.actualWeight??pendingWeights.find((weight:any)=>weight.itemId===item.id)?.actualWeight,
      ratePerKg: item.ratePerKg,
      subtotal: Number.isFinite(item.subtotal) ? item.subtotal :
        (Number(item.actualWeight ?? item.estimatedWeight) || 0) * (Number(item.ratePerKg) || 0),
      category: { id: item.category?.id, name: redactContactText(item.category?.name), type: item.category?.type },
    })),
    statusHistory: (order.statusHistory || []).map((h: any) => ({ id: h.id, status: h.newStatus ?? h.status, timestamp: h.timestamp })),
  };
}

/** SSE tells the agent to refresh its authorized API; no hydrated orders or message text. */
export function agentEvent(payload: any) {
  return { id: payload?.id, orderId: payload?.orderId ?? payload?.id,
    orderNumber: payload?.orderNumber, agentId: payload?.agentId,
    status: payload?.status, serviceArea: redactContactText(payload?.serviceArea), estimatedQuantity: redactContactText(payload?.estimatedQuantity), notificationId: payload?.notificationId };
}
