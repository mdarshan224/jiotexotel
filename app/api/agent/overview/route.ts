import {NextRequest, NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {db} from '@/lib/db';
import {agentWeek, agentEarningDays} from '@/lib/agentOverview';
import {completedAgentStatuses} from '@/lib/agentPortal';
const headers = {'Cache-Control': 'private, no-store'};
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (auth?.role !== 'AGENT' || !auth.agentId) return NextResponse.json({success: false, message: 'Authenticated agent access is required.'}, {status: 401, headers});
  const value = req.nextUrl.searchParams.get('week') || '0';
  if (!/^(0|-[1-9]\d?)$/.test(value) || Number(value) < -52) return NextResponse.json({success: false, message: 'Choose a week within the last year.'}, {status: 400, headers});
  try {
    const week = agentWeek(new Date(), Number(value));
    const [earnings, todayEarnings, completed, active] = await Promise.all([
      db.pickupEarning.findMany({where: {agentId: auth.agentId, createdAt: {gte: week.start, lt: week.end}}, select: {agentPaise: true, createdAt: true}}),
      db.pickupEarning.aggregate({where: {agentId: auth.agentId, createdAt: {gte: week.today}}, _sum: {agentPaise: true}, _count: true}),
      db.order.count({where: {agentId: auth.agentId, status: {in: completedAgentStatuses}}}),
      db.order.count({where: {agentId: auth.agentId, status: {notIn: [...completedAgentStatuses, 'CANCELLED']}}}),
    ]);
    const days = agentEarningDays(week.days, earnings);
    return NextResponse.json({success: true, data: {week: {start: week.start.toISOString(), end: week.end.toISOString(), days, total: earnings.reduce((sum, row) => sum + row.agentPaise, 0) / 100}, today: {earnings: (todayEarnings._sum.agentPaise || 0) / 100, pickups: todayEarnings._count}, completed, active}}, {headers});
  } catch {
    return NextResponse.json({success: false, message: 'Could not load earnings. Please try again.'}, {status: 500, headers});
  }
}
