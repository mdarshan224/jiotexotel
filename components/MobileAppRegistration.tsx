'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
export default function MobileAppRegistration() {
  const path = usePathname();
  useEffect(() => {
    if (path.startsWith('/admin') || path.startsWith('/agent') || !('serviceWorker' in navigator) || !window.isSecureContext) return;
    const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); };
    if (document.readyState === 'complete') register(); else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, [path]);
  return null;
}
