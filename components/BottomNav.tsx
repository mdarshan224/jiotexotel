'use client';

import Link from '@/components/AppLink';
import { usePathname } from 'next/navigation';
import { Home, PackageCheck, LayoutGrid, Plus, UserRound } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith('/admin') || pathname.startsWith('/agent')) return null;
  const links = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/categories', label: 'Explore', icon: LayoutGrid },
    { href: '/book?cart=1', label: 'Book', icon: Plus, highlight: true },
    { href: '/customer/orders', label: 'Pickups', icon: PackageCheck },
    { href: '/customer/profile', label: 'Account', icon: UserRound },
  ];
  return <nav aria-label="Customer navigation" className="customer-mobile-nav mobile-app-dock md:hidden">
    {links.map(({ href, label, icon: Icon, highlight }) => {
      const target = href.split('?')[0];
      const active = pathname === target || (target === '/customer/orders' && (pathname.startsWith('/customer/orders/') || pathname === '/my-pickups'));
      return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`mobile-dock-item ${highlight ? 'mobile-dock-book' : ''} ${active ? 'is-active' : ''}`}>
        <span><Icon size={22} strokeWidth={active ? 2.4 : 1.8} /></span><strong>{label}</strong>
      </Link>;
    })}
  </nav>;
}
