import {appStoreDestination} from './appDownloads';

/** Run before rendering or database bootstrap. Never cache a device-specific destination. */
export function appDownloadRedirect(request:Request):Response|null {
 const url=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method)||!/^\/app\/?$/.test(url.pathname))return null;
 const destination=appStoreDestination({
  userAgent:request.headers.get('user-agent')||'',
  userAgentData:{platform:(request.headers.get('sec-ch-ua-platform')||'').replace(/^"|"$/g,'')},
 });
 // Unknown devices return to the normal website rather than a guessed store or intermediate page.
 return new Response(null,{status:302,headers:{
  Location:destination||'https://junkitout.in/',
  'Cache-Control':'private, no-store, max-age=0',
  Vary:'User-Agent, Sec-CH-UA-Platform',
  'X-Robots-Tag':'noindex, nofollow',
 }});
}
