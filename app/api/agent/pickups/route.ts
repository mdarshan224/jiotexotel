import {NextRequest, NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {db} from '@/lib/db';
import {completedAgentStatuses} from '@/lib/agentPortal';
import {redactContactText} from '@/lib/orders/agentOrder';
const headers = {'Cache-Control': 'private, no-store'};
export async function GET(req: NextRequest) {
 const auth = await getAuthUser(req);
 if (auth?.role !== 'AGENT' || !auth.agentId) return NextResponse.json({success: false, message: 'Authenticated agent access is required.'}, {status: 401, headers});
 const filter = req.nextUrl.searchParams.get('filter') || 'all', page = Number(req.nextUrl.searchParams.get('page') || '0');
 if (!['all','active','completed','cancelled'].includes(filter) || !Number.isInteger(page) || page < 0 || page > 10000) return NextResponse.json({success: false, message: 'Invalid pickup filter.'}, {status: 400, headers});
 const status = filter === 'completed' ? {in: completedAgentStatuses} : filter === 'active' ? {notIn: [...completedAgentStatuses, 'CANCELLED']} : filter === 'cancelled' ? 'CANCELLED' : undefined;
 try {
  const rows = await db.order.findMany({where: {agentId: auth.agentId, ...(status ? {status} : {})}, select: {id: true, orderNumber: true, status: true, createdAt: true, scheduledSlot: true, address: {select: {area: true}}, pickupEarning: {select: {agentPaise: true}}}, orderBy: [{createdAt: 'desc'}, {id: 'desc'}], skip: page * 20, take: 21});
  return NextResponse.json({success: true, data: {orders: rows.slice(0,20).map(row => ({id: row.id, orderNumber: row.orderNumber, status: row.status, createdAt: row.createdAt, scheduledSlot: redactContactText(row.scheduledSlot), area: redactContactText(row.address?.area) || 'Bengaluru', earnings: row.pickupEarning ? row.pickupEarning.agentPaise / 100 : null})), hasMore: rows.length > 20}}, {headers});
 } catch { return NextResponse.json({success: false, message: 'Could not load your pickups.'}, {status: 500, headers}); }
}
