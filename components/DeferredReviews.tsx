'use client';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
const Reviews = lazy(() => import('@/components/CustomerReviews'));
export default function DeferredReviews() {
  const anchor = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!anchor.current || !('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '200px' });
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={anchor} className="min-h-48">{visible && <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-emerald-50" />}><Reviews /></Suspense>}</div>;
}
