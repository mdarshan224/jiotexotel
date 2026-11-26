import { NextRequest, NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';


import path from 'path';
import { db } from '@/lib/db';
import { getAuthUser, isAdminRole } from '@/lib/auth/middleware';
import { isCustomerOrderOwner, isAgentOrderAssigned } from '@/lib/orderAccess';

const PRIVATE_CACHE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

function extractFilename(targetUrl: string): string | null {
  try {
    let decoded = targetUrl;
    try {
      decoded = decodeURIComponent(targetUrl);
    } catch {
      // Keep original string if decode fails
    }
    let pathname = decoded.split('?')[0];
    if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
      pathname = new URL(decoded).pathname;
    }
    const filename = path.basename(pathname);
    return /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename) ? filename : null;
  } catch {
    return null;
  }
}

function isValidBlobTarget(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return /^(\/)?([a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp))$/i.test(targetUrl);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url')?.trim();
    const orderIdParam = searchParams.get('orderId')?.trim();

    if (!targetUrl) {
      return NextResponse.json(
        { success: false, message: 'Missing url parameter.' },
        { status: 400, headers: PRIVATE_CACHE_HEADERS }
      );
    }

    const filename = extractFilename(targetUrl);
    if (!filename) {
      return NextResponse.json(
        { success: false, message: 'Invalid photo URL.' },
        { status: 400, headers: PRIVATE_CACHE_HEADERS }
      );
    }

    const isPublicMaterialPhoto = filename.startsWith('material-photo-');
    const responseCacheHeaders = isPublicMaterialPhoto
      ? {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          'X-Content-Type-Options': 'nosniff',
        }
      : PRIVATE_CACHE_HEADERS;

    if (!isPublicMaterialPhoto) {
      // 1. Enforce Authentication for private customer/order photos
      const authUser = await getAuthUser(req);
      if (!authUser || !authUser.userId) {
        return NextResponse.json(
          { success: false, message: 'Authentication is required to view photos.' },
          { status: 401, headers: PRIVATE_CACHE_HEADERS }
        );
      }

      // 2. Authorize Access
      const isAdmin = isAdminRole(authUser) || authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN';
      const isDirectUploader = Boolean(authUser.userId && filename.includes(`u_${authUser.userId}`));

      let isAuthorized = isAdmin || isDirectUploader;

      if (!isAuthorized) {
        if (orderIdParam) {
          // Explicit order ID supplied: verify order exists and contains the requested photo
          const order = await db.order.findUnique({
            where: { id: orderIdParam },
            select: {
              id: true,
              customerId: true,
              agentId: true,
              wastePhotos: true,
              customer: { select: { userId: true } },
              agent: { select: { userId: true } },
              weightRecords: { select: { scalePhotoUrl: true } },
            },
          });

          if (!order) {
            return NextResponse.json(
              { success: false, message: 'Order not found.' },
              { status: 404, headers: PRIVATE_CACHE_HEADERS }
            );
          }

          // Verify photo actually belongs to this order to prevent IDOR
          const photoInWastePhotos =
            typeof order.wastePhotos === 'string' && order.wastePhotos.includes(filename);
          const photoInWeightRecords =
            Array.isArray(order.weightRecords) &&
            order.weightRecords.some((wr) => wr.scalePhotoUrl && wr.scalePhotoUrl.includes(filename));

          if (!photoInWastePhotos && !photoInWeightRecords) {
            return NextResponse.json(
              { success: false, message: 'Photo does not belong to the specified order.' },
              { status: 403, headers: PRIVATE_CACHE_HEADERS }
            );
          }

          const isCustomer = isCustomerOrderOwner(order, authUser);
          const isAgent =
            isAgentOrderAssigned(order, authUser) ||
            Boolean(authUser.userId && order.agent?.userId === authUser.userId);

          if (isCustomer || isAgent) {
            isAuthorized = true;
          }
        } else {
          // No orderId parameter supplied: query database for owning order or complaint
          const matchingOrder = await db.order.findFirst({
            where: {
              OR: [
                { wastePhotos: { contains: filename } },
                { weightRecords: { some: { scalePhotoUrl: { contains: filename } } } },
              ],
            },
            select: {
              id: true,
              customerId: true,
              agentId: true,
              customer: { select: { userId: true } },
              agent: { select: { userId: true } },
            },
          });

          if (matchingOrder) {
            const isCustomer = isCustomerOrderOwner(matchingOrder, authUser);
            const isAgent =
              isAgentOrderAssigned(matchingOrder, authUser) ||
              Boolean(authUser.userId && matchingOrder.agent?.userId === authUser.userId);

            if (isCustomer || isAgent) {
              isAuthorized = true;
            }
          } else {
            // Check if photo is associated with a customer complaint
            const matchingComplaint = await db.complaint.findFirst({
              where: { photoUrl: { contains: filename } },
              select: {
                customerId: true,
                order: { select: { agentId: true, agent: { select: { userId: true } } } },
              },
            });

            if (matchingComplaint) {
              const isCustomer =
                Boolean(authUser.customerId && authUser.customerId === matchingComplaint.customerId);
              const isAgent = Boolean(
                matchingComplaint.order &&
                  (isAgentOrderAssigned(matchingComplaint.order, authUser) ||
                    (authUser.userId && matchingComplaint.order.agent?.userId === authUser.userId))
              );

              if (isCustomer || isAgent) {
                isAuthorized = true;
              }
            }
          }
        }

        if (!isAuthorized) {
          return NextResponse.json(
            { success: false, message: 'You are not authorized to view this photo.' },
            { status: 403, headers: PRIVATE_CACHE_HEADERS }
          );
        }
      }
    }

    const object = await env.BUCKET.get(filename);
    if (!object) return NextResponse.json({ success: false, message: 'Photo not found.' }, { status: 404, headers: PRIVATE_CACHE_HEADERS });
    return new Response(object.body, { headers: {
      ...responseCacheHeaders,
      'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
      'Content-Length': String(object.size),
    } });
  } catch (error: any) {
    console.error('Error serving private photo:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to serve photo.' },
      { status: 500, headers: PRIVATE_CACHE_HEADERS }
    );
  }
}
