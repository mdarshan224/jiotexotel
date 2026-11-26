export const APP_DOWNLOAD_LINKS = {
  ios: 'https://apps.apple.com/in/app/junk-it-out/id6831986139',
  android: 'https://play.google.com/store/apps/details?id=com.junkitout.myapplication&pcampaignid=web_share',
} as const;

export const APP_DOWNLOAD_URL = 'https://junkitout.in/app';
export const APP_DOWNLOAD_PROMPT_EVENT = 'junkitout:show-app-download';
export const APP_DOWNLOAD_SESSION_KEY = 'junkitout:app-download-seen:v1';

export type AppDevice = {userAgent?:string;platform?:string;maxTouchPoints?:number;userAgentData?:{platform?:string;mobile?:boolean}};
/** Convenience routing only; these browser hints are never used for access control. */
export function detectAppPlatform(device:AppDevice):'ios'|'android'|null {
  const ua=device.userAgent||'';
  if(/Windows Phone|IEMobile/i.test(ua))return null;
  if(/iPhone|iPad|iPod|Macintosh.*Mobile/i.test(ua)||/^(iOS|iPadOS)$/i.test(device.userAgentData?.platform||''))return 'ios';
  if(/Android/i.test(ua)||/^Android$/i.test(device.userAgentData?.platform||''))return 'android';
  // iPadOS Safari can present a desktop Macintosh user agent.
  if((device.platform==='MacIntel'||/Macintosh/i.test(ua))&&(device.maxTouchPoints||0)>1)return 'ios';
  return null;
}
export function appStoreDestination(device:AppDevice){
  const platform=detectAppPlatform(device);
  return platform?APP_DOWNLOAD_LINKS[platform]:null;
}
export function canShowAppDownloadPrompt(pathname:string,desktopLayout:boolean,device:AppDevice,standalone=false){
  const publicPages=['/','/about','/pricing','/categories','/services','/service-areas','/accepted-waste','/contact','/faq','/privacy-policy','/terms'];
  return desktopLayout&&!standalone&&!detectAppPlatform(device)&&publicPages.includes(pathname);
}
