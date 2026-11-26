'use client';

import { forwardRef, type AnchorHTMLAttributes } from 'react';

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  prefetch?: boolean | 'auto' | null;
  scroll?: boolean;
  replace?: boolean;
};

/**
 * Use the browser's document navigation on this hosted application. All routes
 * are server-rendered and cookies/cart storage survive a document load. Native
 * anchors also preserve keyboard activation, new tabs, downloads and hashes.
 */
const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, prefetch: _prefetch, scroll: _scroll, replace: _replace, ...props }, ref,
) {
  return <a {...props} ref={ref} href={href} />;
});

export default AppLink;
