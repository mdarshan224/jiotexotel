import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {DesktopAppDownloadBanner} from '@/components/AppDownloadLinks';
import {APP_DOWNLOAD_LINKS} from '@/lib/appDownloads';
describe('Desktop mobile-app downloads',()=>{
 it('provides the exact iOS and Android listings in an accessible desktop-only section',()=>{
  const html=renderToStaticMarkup(<DesktopAppDownloadBanner/>);
  expect(html).toContain(APP_DOWNLOAD_LINKS.ios);expect(html).toContain(APP_DOWNLOAD_LINKS.android.replaceAll('&','&amp;'));
  expect(html).toContain('/app-downloads/app-store.png');expect(html).toContain('/app-downloads/google-play.png');
  expect(html).toContain('Download the Junk It Out app');expect(html).toContain('hidden ');expect(html).toContain('md:flex');
  expect(html.match(/target="_blank"/g)).toHaveLength(2);expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
 });
});
