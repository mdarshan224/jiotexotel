import {describe,it,expect} from 'vitest';
import {appDownloadRedirect} from '@/lib/appDownloadRedirect';
import {APP_DOWNLOAD_LINKS} from '@/lib/appDownloads';
import {GET,HEAD} from '@/app/app/route';
function request(ua:string,url='https://junkitout.in/app',method='GET'){return new Request(url,{method,headers:{'user-agent':ua}});}
describe('Direct app store HTTP redirect',()=>{
 it.each([
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',APP_DOWNLOAD_LINKS.ios],
  ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)',APP_DOWNLOAD_LINKS.ios],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18 Mobile/15E148 Safari/604',APP_DOWNLOAD_LINKS.ios],
  ['Mozilla/5.0 (Linux; Android 16; Pixel 9) Chrome/143 Mobile Safari/537',APP_DOWNLOAD_LINKS.android],
 ])('immediately redirects %s without any landing HTML',async(ua,destination)=>{
  const response=appDownloadRedirect(request(ua))!;
  expect(response.status).toBe(302);expect(response.headers.get('Location')).toBe(destination);expect(await response.text()).toBe('');
  expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.get('vary')).toContain('User-Agent');
 });
 it('handles Android client hints without requiring JavaScript',()=>{
  const r=appDownloadRedirect(new Request('https://junkitout.in/app',{headers:{'sec-ch-ua-platform':'"Android"'}}))!;
  expect(r.headers.get('location')).toBe(APP_DOWNLOAD_LINKS.android);
 });
 it('does not render a page for unknown/desktop devices or guess a mobile platform',async()=>{
  const r=GET(request('Mozilla/5.0 (Windows NT 10.0)'));expect(r.headers.get('location')).toBe('https://junkitout.in/');expect(await r.text()).toBe('');
 });
 it('handles HEAD and the trailing slash at the edge',async()=>{
  const r=HEAD(request('Android','https://junkitout.in/app/','HEAD'));expect(r.status).toBe(302);expect(await r.text()).toBe('');
 });
 it('ignores arbitrary redirect parameters and keeps destinations fixed',()=>{
  const r=appDownloadRedirect(request('Android','https://junkitout.in/app?redirect=https://evil.example'))!;expect(r.headers.get('location')).toBe(APP_DOWNLOAD_LINKS.android);
 });
 it.each(['/','/book','/api/app','/application','/customer/wallet'])('does not intercept %s',path=>expect(appDownloadRedirect(request('Android','https://junkitout.in'+path))).toBeNull());
 it('does not redirect non-navigation writes',()=>expect(appDownloadRedirect(request('Android','https://junkitout.in/app','POST'))).toBeNull());
});
