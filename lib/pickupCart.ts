export type PickupCartItem = { categoryId: string; quantity: number };

export const ACTIVE_CUSTOMER_CATEGORIES = [
  'E-Waste',
  'Household Dry Waste',
  'Paper & Cardboard',
  'Plastic Waste',
] as const;

export function isCustomerPickupCategory(categoryName?: string | null): boolean {
  if (!categoryName) return false;
  return (ACTIVE_CUSTOMER_CATEGORIES as readonly string[]).includes(categoryName.trim());
}

const CART_KEY = 'junk-it-out-pickup-cart';
const CART_EVENT = 'junk-it-out-cart-updated';

function sanitizeCart(value: unknown): PickupCartItem[] {
  if (!Array.isArray(value)) return [];
  const items = new Map<string, PickupCartItem>();
  for (const item of value) {
    if (typeof item?.categoryId !== 'string' || !item.categoryId.trim()) continue;
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    items.set(item.categoryId, {categoryId:item.categoryId, quantity:Math.max(1,Math.min(500,Math.round(quantity)))});
  }
  return [...items.values()];
}
let memoryCart: PickupCartItem[] = [];
export function readPickupCart(): PickupCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(CART_KEY);
    if (stored !== null) return memoryCart = sanitizeCart(JSON.parse(stored));
    const legacy = window.sessionStorage.getItem(CART_KEY);
    if (legacy !== null) {
      memoryCart = sanitizeCart(JSON.parse(legacy));
      window.localStorage.setItem(CART_KEY, JSON.stringify(memoryCart));
      window.sessionStorage.removeItem(CART_KEY);
    }
  } catch { /* Storage restrictions must not break cart controls. */ }
  return memoryCart;
}
function saveCart(items: PickupCartItem[]) {
  memoryCart = sanitizeCart(items);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(memoryCart));
    window.sessionStorage.removeItem(CART_KEY);
  } catch { /* Retain an in-memory cart when browser storage is unavailable. */ }
  window.dispatchEvent(new Event(CART_EVENT));
}
/** Includes browser back/forward cache restoration and changes from other tabs. */
export function subscribePickupCart(refresh: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === CART_KEY || event.key === null) refresh(); };
  window.addEventListener(CART_EVENT, refresh);
  window.addEventListener('storage', storage);
  window.addEventListener('pageshow', refresh);
  return () => {
    window.removeEventListener(CART_EVENT, refresh);
    window.removeEventListener('storage', storage);
    window.removeEventListener('pageshow', refresh);
  };
}

export function addToPickupCart(categoryId: string) {
  const items = readPickupCart();
  const existing = items.find((item) => item.categoryId === categoryId);
  const next = existing
    ? items.map((item) => (item.categoryId === categoryId ? { ...item, quantity: Math.min(500, item.quantity + 1) } : item))
    : [...items, { categoryId, quantity: 1 }];
  saveCart(next);
  return next;
}

export function updatePickupCartQuantity(categoryId: string, quantity: number) {
  if (quantity <= 0) {
    return removeFromPickupCart(categoryId);
  }
  const safeQuantity = Math.max(1, Math.min(500, Math.round(Number(quantity) || 1)));
  const next = readPickupCart().map((item) => (item.categoryId === categoryId ? { ...item, quantity: safeQuantity } : item));
  saveCart(next);
  return next;
}

export function removeFromPickupCart(categoryId: string) {
  const next = readPickupCart().filter((item) => item.categoryId !== categoryId);
  saveCart(next);
  return next;
}

/**
 * Replaces the whole Pickup Cart with the given selection so that the cart
 * drawer always mirrors the materials and weights chosen on the booking page.
 * Writes (and notifies listeners) only when the contents actually change.
 */
export function replacePickupCart(items: PickupCartItem[]) {
  if (typeof window === 'undefined') return [];
  const next = items
    .filter((item) => item?.categoryId)
    .map((item) => ({
      categoryId: item.categoryId,
      quantity: Math.max(1, Math.min(500, Math.round(Number(item.quantity) || 1))),
    }));
  const current = readPickupCart();
  const same =
    current.length === next.length &&
    current.every((item, idx) => item.categoryId === next[idx].categoryId && item.quantity === next[idx].quantity);
  if (same) return current;
  saveCart(next);
  return next;
}

export function clearPickupCart() {
  if (typeof window === 'undefined') return;
  saveCart([]);
}

export const pickupCartEvent = CART_EVENT;
