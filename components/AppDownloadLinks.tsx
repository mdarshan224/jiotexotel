import AppDownloadQrButton from '@/components/AppDownloadQrButton';
import { APP_DOWNLOAD_LINKS } from '@/lib/appDownloads';

const badges = [
  {href:APP_DOWNLOAD_LINKS.ios,label:'Download Junk It Out on the App Store',src:'/app-downloads/app-store.png',alt:'Download on the App Store',width:800,height:800,imageWidth:'100%',left:'0'},
  {href:APP_DOWNLOAD_LINKS.android,label:'Download Junk It Out on Google Play',src:'/app-downloads/google-play.png',alt:'Get it on Google Play',width:361,height:139,imageWidth:'114.6032%',left:'-7.3016%'},
];

export default function AppDownloadLinks({compact = false}:{compact?:boolean}) {
  return <div className={`flex flex-wrap items-center justify-center gap-3 ${compact?'':'shrink-0'}`}>
    {badges.map(badge=><a key={badge.href} href={badge.href} target="_blank" rel="noopener noreferrer"
      aria-label={badge.label}
      className="inline-flex rounded-lg transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500">
      {/* Display the original uploaded artwork, clipping only its outer canvas padding. */}
      <span className="relative block h-14 w-[188px] overflow-hidden rounded-lg">
        <img src={badge.src} alt={badge.alt} width={badge.width} height={badge.height}
          className="absolute top-1/2 block max-w-none -translate-y-1/2"
          style={{width:badge.imageWidth,height:'auto',left:badge.left}} />
      </span>
    </a>)}
  </div>;
}

export function DesktopAppDownloadBanner(){
 return <section aria-labelledby="download-app-heading" className="hidden items-center justify-between gap-6 rounded-3xl border border-emerald-200 bg-emerald-50 px-7 py-6 md:flex lg:px-9">
   <div className="max-w-lg">
    <p className="text-sm font-semibold text-emerald-700">Available for iPhone and Android</p>
    <h2 id="download-app-heading" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Download the Junk It Out app</h2>
    <p className="mt-2 text-base leading-6 text-slate-600">Book doorstep pickups and track your collection from your phone.</p>
   </div>
   <div className="shrink-0 text-center"><AppDownloadLinks /><AppDownloadQrButton/></div>
 </section>;
}
