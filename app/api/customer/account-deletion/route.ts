import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { hasTrustedOrigin } from '@/lib/auth/requestSecurity';
import { signToken } from '@/lib/auth/jwt';
import { changeAccountDeletion } from '@/lib/accountDeletion';
import { AccountDeletionError } from '@/lib/accountDeletionPolicy';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    if (!hasTrustedOrigin(req) || req.headers.get('sec-fetch-site') === 'cross-site') return errorResponse('FORBIDDEN', 'Request not allowed.', 403);
    const auth = await getAuthUser(req);
    if (!auth) return errorResponse('UNAUTHORIZED', 'Please log in again.', 401);
    if (auth.role !== 'CUSTOMER' || auth.adminId || auth.agentId) return errorResponse('FORBIDDEN', 'Customer account required.', 403);
    const body = await req.json().catch(() => ({}));
    if (!['request', 'recover'].includes(body.action)) return errorResponse('INVALID_ACTION', 'Choose request or recover.', 400);
    if (body.action === 'request' && body.confirmation !== 'DELETE') return errorResponse('CONFIRMATION_REQUIRED', 'Type DELETE to confirm.', 400);
    const user = await changeAccountDeletion(auth.userId, body.action);
    const response = successResponse({ deletionDueAt: user.deletionDueAt,
      message: user.deletionDueAt ? 'Deletion requested. You can recover your account within 48 hours.' : 'Your account is active.' });
    response.headers.set('Cache-Control', 'no-store');
    response.cookies.set('jio_token', signToken({ userId: user.id, phone: user.phone, name: user.name,
      role: 'CUSTOMER', customerId: user.customer?.id, tokenVersion: user.tokenVersion }), {
      httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600,
    });
    return response;
  } catch (error) {
    if (error instanceof AccountDeletionError) return errorResponse('ACCOUNT_UNAVAILABLE', error.message, error.status);
    return errorResponse('DELETION_UNAVAILABLE', 'Unable to update your account. Please try again.', 503);
  }
}
