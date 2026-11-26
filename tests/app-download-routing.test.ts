import {describe,it,expect} from 'vitest';
import {APP_DOWNLOAD_LINKS,APP_DOWNLOAD_URL,appStoreDestination,canShowAppDownloadPrompt} from '@/lib/appDownloads';
const desktop={userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/143.0',platform:'Win32',maxTouchPoints:0};
describe('App-store smart download routing',()=>{
 it.each([
  {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'},
  {userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'},
  {userAgent:'Mozilla/5.0 (iPod touch; CPU iPhone OS 18_0 like Mac OS X)'},
  {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18 Safari/605',platform:'MacIntel',maxTouchPoints:5},
 ])('routes an Apple mobile device to its exact App Store listing',device=>expect(appStoreDestination(device)).toBe(APP_DOWNLOAD_LINKS.ios));
 it.each([
  {userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel 9) Chrome/143 Mobile Safari'},
  {userAgent:'Mozilla/5.0 (Linux; Android 15; Tablet) Chrome/143 Safari'},
  {userAgent:'CustomBrowser',userAgentData:{platform:'Android',mobile:true}},
 ])('routes Android to its exact Google Play listing',device=>expect(appStoreDestination(device)).toBe(APP_DOWNLOAD_LINKS.android));
 it.each([desktop,{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X)',platform:'MacIntel',maxTouchPoints:0},{userAgent:'Windows Phone 10.0; Android 6.0.1'},{}])('keeps manual store selection for desktop and unknown devices',device=>expect(appStoreDestination(device)).toBeNull());
 it('keeps the QR destination fixed to the merchant app URL',()=>expect(APP_DOWNLOAD_URL).toBe('https://junkitout.in/app'));
});
describe('Desktop download prompt boundary',()=>{
 it('allows public desktop entry pages',()=>{expect(canShowAppDownloadPrompt('/',true,desktop)).toBe(true);expect(canShowAppDownloadPrompt('/pricing',true,desktop)).toBe(true);});
 it.each(['/app','/book','/orders/test','/customer/wallet','/admin','/agent','/api/auth/me'])('never interrupts the %s flow',path=>expect(canShowAppDownloadPrompt(path,true,desktop)).toBe(false));
 it('never opens for mobile layout, mobile devices in desktop layout, or installed standalone apps',()=>{
  expect(canShowAppDownloadPrompt('/',false,desktop)).toBe(false);
  expect(canShowAppDownloadPrompt('/',true,{userAgent:'Android 16'})).toBe(false);
  expect(canShowAppDownloadPrompt('/',true,{userAgent:'iPad'})).toBe(false);
  expect(canShowAppDownloadPrompt('/',true,desktop,true)).toBe(false);
 });
});
