'use client';
import {useEffect, useState} from 'react';
import CustomerPickupMilestones from './CustomerPickupMilestones';

export default function MobileHomeMilestones() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    let active = true, pending: AbortController | undefined;
    async function refresh() {
      pending?.abort();
      if (!media.matches) { setCustomerId(null); return; }
      const controller = new AbortController(); pending = controller;
      try {
        const response = await fetch('/api/auth/me', {cache: 'no-store', credentials: 'same-origin', signal: controller.signal});
        const result = await response.json(), user = result?.data?.user;
        if (active && !controller.signal.aborted) setCustomerId(response.ok && result.success && user?.role === 'CUSTOMER' && !user.deletionDueAt ? user.id : null);
      } catch { if (active && !controller.signal.aborted) setCustomerId(null); }
    }
    const authChanged = () => { setCustomerId(null); void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    media.addEventListener('change', authChanged); window.addEventListener('jio_auth_change', authChanged);
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
    return () => { active = false; pending?.abort(); media.removeEventListener('change', authChanged); window.removeEventListener('jio_auth_change', authChanged); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return customerId ? <CustomerPickupMilestones key={customerId} variant="mobile-home"/> : null;
}
