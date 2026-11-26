import { env } from 'cloudflare:workers';
import catalog from './initialCatalog.json';
let initialized = false;
export function initializeSite() {
  if (initialized) return Promise.resolve();
  return initialize().then(() => { initialized = true; });
}
async function initialize() {
  const marker = await env.DB.prepare('SELECT id FROM "_SiteBootstrap" WHERE id = 1').first();
  if (marker) return;
  const now = new Date().toISOString().replace('Z','+00:00');
  const statements = [env.DB.prepare('INSERT OR IGNORE INTO "_SiteRevision" (id, version) VALUES (1, 0)')];
  // Preserve the original authorized administrator; no sample customers or agents.
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO "User" (id, phone, name, role, tokenVersion, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?)').bind('site-main-admin','7676272709','Junk It Out Operations Admin','SUPER_ADMIN',now,now));
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO "Admin" (id, userId, department, accessLevel, createdAt) VALUES (?, ?, ?, ?, ?)').bind('site-admin-profile','site-main-admin','Operations & Management','SUPER_ADMIN',now));
  for (const [i, category] of catalog.categories.entries()) {
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO "WasteCategory" (id, name, description, icon, type, pricePerKg, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(`catalog-${i}`,category.name,category.description,category.icon,category.type,category.pricePerKg,now,now));
  }
  for (const [i, area] of catalog.serviceAreasData.entries()) {
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO "ServiceArea" (id, name, city, status, etaMinutes, basePickupCharge, boundaryPolygon, centerLat, centerLng, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(`area-${i}`,area.name,'Bengaluru',area.name.includes('BTM')||area.name.includes('JP Nagar')?'ACTIVE':'INACTIVE',area.etaMinutes,area.basePickupCharge,area.boundaryPolygon,area.centerLat,area.centerLng,now));
  }
  for (const [i, offer] of catalog.subscriptionOffers.entries()) {
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO "SubscriptionOffer" (id, name, description, durationMonths, price, benefitsJson, displayOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(`offer-${i}`,offer.name,offer.description,offer.durationMonths,offer.price,offer.benefitsJson,i,now,now));
  }
  statements.push(env.DB.prepare('UPDATE "_SiteRevision" SET version = version + 1 WHERE id = 1'));
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO "_SiteBootstrap" (id) VALUES (1)'));
  await env.DB.batch(statements);
}
