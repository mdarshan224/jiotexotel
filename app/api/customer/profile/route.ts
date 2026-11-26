import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { hasTrustedOrigin } from '@/lib/auth/requestSecurity';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function PATCH(req: NextRequest) {
  if (!hasTrustedOrigin(req) || req.headers.get('sec-fetch-site') === 'cross-site') return errorResponse('FORBIDDEN', 'Request not allowed.', 403);
  try {
    const auth = await getAuthUser(req);
    if (!auth) return errorResponse('UNAUTHORIZED', 'Please sign in again.', 401);
    if (auth.role !== 'CUSTOMER' || auth.adminId || auth.agentId) return errorResponse('FORBIDDEN', 'Customer account required.', 403);
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name)) return errorResponse('INVALID_NAME', 'Enter a name between 1 and 80 characters.', 400);
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return errorResponse('INVALID_EMAIL', 'Enter a valid email address.', 400);
    const result = await db.user.updateMany({ where: { id: auth.userId, role: 'CUSTOMER', deletionDueAt: null }, data: { name, email: email || null } });
    if (!result.count) return errorResponse('ACCOUNT_UNAVAILABLE', 'Recover your account before changing your details.', 409);
    const response = successResponse({ name, email: email || null });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    if (error?.code === 'P2002') return errorResponse('EMAIL_IN_USE', 'This email is already linked to another account.', 409);
    return errorResponse('UPDATE_FAILED', 'Could not save your details. Please try again.', 503);
  }
}
