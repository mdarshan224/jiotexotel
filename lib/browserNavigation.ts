'use client';

let navigationPending = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', () => { navigationPending = false; });
}

function navigate(href: string, replace = false) {
  const target = new URL(href, window.location.href);
  if (!['https:', 'http:'].includes(target.protocol)) return;
  navigationPending = true;
  if (replace) window.location.replace(target.toString());
  else window.location.assign(target.toString());
}

const router = {
  push: (href: string) => navigate(href),
  replace: (href: string) => navigate(href, true),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  // A refresh immediately after replace/push must not cancel the destination.
  refresh: () => { if (!navigationPending) window.location.reload(); },
  prefetch: (_href: string) => {},
};

export function useRouter() { return router; }
