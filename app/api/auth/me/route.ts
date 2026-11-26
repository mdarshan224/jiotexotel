import {agentOnboardingApproved} from '@/lib/cashfree/agentOnboarding';
import {hasFreshAgentPresence,ONLINE_AGENT_STATUSES} from '@/lib/agents/locationPolicy';
import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { db, isDatabaseConfigurationError } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

async function currentSession(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      const hasSessionCookie =
        req.cookies.has('jio_token') ||
        req.cookies.has('jio_admin_token') ||
        req.cookies.has('jio_agent_token');

      if (!hasSessionCookie) {
        return successResponse({
          authenticated: false,
          user: null,
        });
      }

      return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);
    }

    const isAgent = authUser.role === 'AGENT' || Boolean(authUser.agentId);

    let user = await db.user.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        phone: true,
        deletionDueAt: true,
        name: true,
        email: true,
        role: true,
        customer: true,
        agent: isAgent,
        admin: true,
        addresses: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User profile not found.', 444);
    }

    const agentProfileComplete = user.role !== 'AGENT' || Boolean(user.agent);
    const onboardingApproved=user.agent?await agentOnboardingApproved(db,user.agent.id):false;

    return successResponse({
      user: {
        id: user.id,
        phone: user.phone,
        deletionDueAt: user.deletionDueAt,
        name: user.name,
        email: user.email,
        role: authUser.role || user.role,
        customer: user.customer,
        agent: user.agent?{...user.agent,onboardingApproved,status:!onboardingApproved||ONLINE_AGENT_STATUSES.includes(user.agent.status)&&!hasFreshAgentPresence(user.agent)?'OFFLINE':user.agent.status}:user.agent,
        admin: user.admin,
        addresses: user.addresses,
      },
      agentProfileComplete,
      ...(user.role === 'AGENT' && !user.agent
        ? { message: 'Agent profile is incomplete. Please contact administrator.' }
        : {}),
    });
  } catch (err: any) {
    console.error('Auth me error:', err);
    const message = String(err?.message || '');
    const databaseUnavailable =
      isDatabaseConfigurationError(err) ||
      message.includes('Authentication failed against database server') ||
      message.includes('Can\'t reach database server') ||
      message.includes('P1001') ||
      message.includes('P1000') ||
      message.includes('[YOUR-PASSWORD]');

    return errorResponse(
      databaseUnavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR',
      databaseUnavailable
        ? 'The database credentials are invalid or the database is unreachable. Verify DATABASE_URL and restart the server.'
        : 'Failed to retrieve profile.',
      databaseUnavailable ? 503 : 500
    );
  }
}

export async function GET(req:NextRequest){const response=await currentSession(req);response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie, Authorization, Referer, X-Jio-Portal');return response;}
