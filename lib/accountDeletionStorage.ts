import 'server-only';
import { env } from 'cloudflare:workers';
import path from 'node:path';

import { db } from './db';

export async function deleteCustomerUploads(userId: string, customerId: string) {
  const [orders, complaints, weights] = await Promise.all([
    db.order.findMany({ where: { customerId }, select: { wastePhotos: true } }),
    db.complaint.findMany({ where: { customerId }, select: { photoUrl: true } }),
    db.weightRecord.findMany({ where: { order: { customerId } }, select: { scalePhotoUrl: true } }),
  ]);
  const urls = new Set<string>();
  for (const order of orders) {
    const photos = JSON.parse(order.wastePhotos || '[]');
    if (Array.isArray(photos)) for (const url of photos) if (typeof url === 'string') urls.add(url);
  }
  for (const item of complaints) if (item.photoUrl) urls.add(item.photoUrl);
  for (const item of weights) if (item.scalePhotoUrl) urls.add(item.scalePhotoUrl);
  const prefix = `waste-photo-u_${userId}-`;
  // Remove every owned upload, including photos never attached to a booking.
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
    if (page.objects.length) await env.BUCKET.delete(page.objects.map(object => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  for (const source of urls) {
    let target = source;
    if (source.startsWith('/api/upload/view?')) target = new URL(source, 'https://local.invalid').searchParams.get('url') || '';
    const filename = path.basename(target);
    if (/^waste-photo-[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) await env.BUCKET.delete(filename);
  }
}
