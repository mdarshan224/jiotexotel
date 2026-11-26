'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowRight, ShoppingBasket } from 'lucide-react';
import { subscribePickupCart, readPickupCart, type PickupCartItem } from '@/lib/pickupCart';

/** One persistent entry to the existing cart; no duplicate checkout state. */
export default function MobileCartBar() {
  const path = usePathname();
  const [items, setItems] = useState<PickupCartItem[]>([]);
  useEffect(() => {
    const refresh = () => setItems(readPickupCart());
    refresh();
    const unsubscribeCart = subscribePickupCart(refresh);
    return () => unsubscribeCart();
  }, []);
  if (!items.length || path.startsWith('/admin') || path.startsWith('/agent') || path.startsWith('/book') || path.startsWith('/orders/')) return null;
  return <div className="mobile-cart-bar md:hidden">
    <button type="button" onClick={() => window.dispatchEvent(new Event('jio_open_cart'))} aria-label={`View cart, ${items.length} selected materials`}>
      <ShoppingBasket size={21} /><span><strong>{items.length} {items.length === 1 ? 'material' : 'materials'} added</strong><small>Ready for your doorstep pickup</small></span>
      <b>View cart</b><ArrowRight size={18} />
    </button>
  </div>;
}
