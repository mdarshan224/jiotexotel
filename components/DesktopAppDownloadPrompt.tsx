'use client';
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {X,Sparkles,ScanLine} from 'lucide-react';
import CenteredModalLayer from '@/components/CenteredModalLayer';
import AppDownloadLinks from '@/components/AppDownloadLinks';
import {APP_DOWNLOAD_PROMPT_EVENT,APP_DOWNLOAD_SESSION_KEY,canShowAppDownloadPrompt} from '@/lib/appDownloads';

export default function DesktopAppDownloadPrompt(){
 const pathname=usePathname();
 const [open,setOpen]=useState(false);
 useEffect(()=>{
  const media=window.matchMedia('(min-width: 768px)');
  const eligible=()=>canShowAppDownloadPrompt(pathname,media.matches,navigator,
   window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true);
  const show=(automatic=false)=>{
   if(!eligible())return;
   if(automatic){
    try{if(sessionStorage.getItem(APP_DOWNLOAD_SESSION_KEY))return;}catch{}
    if(document.querySelector('[role="dialog"][aria-modal="true"]'))return;
   }
   setOpen(true);
   try{sessionStorage.setItem(APP_DOWNLOAD_SESSION_KEY,'1');}catch{}
  };
  const manuallyShow=()=>show(false);
  const resized=()=>{if(!eligible())setOpen(false);};
  const timer=window.setTimeout(()=>show(true),900);
  window.addEventListener(APP_DOWNLOAD_PROMPT_EVENT,manuallyShow);
  media.addEventListener('change',resized);
  return ()=>{window.clearTimeout(timer);window.removeEventListener(APP_DOWNLOAD_PROMPT_EVENT,manuallyShow);media.removeEventListener('change',resized);setOpen(false);};
 },[pathname]);
 if(!open)return null;
 return <CenteredModalLayer className="bg-emerald-950/40 backdrop-blur-sm"
   onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}
   onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}>
   <section role="dialog" aria-modal="true" aria-labelledby="app-download-title" aria-describedby="app-download-description"
    className="relative w-full max-w-[660px] rounded-[2rem] border border-white bg-gradient-to-br from-white to-emerald-50 p-8 text-slate-950 shadow-2xl">
    <button type="button" aria-label="Close app download popup" onClick={()=>setOpen(false)} className="absolute right-4 top-4 z-10 rounded-full bg-white p-2 text-slate-500 transition-colors hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-emerald-600"><X className="h-5 w-5"/></button>
    <div className="grid grid-cols-[1fr_220px] items-center gap-7">
     <div>
      <div className="relative mb-5 inline-block"><img src="/logo.png" alt="Junk It Out" width="64" height="64" className="h-16 w-16 rounded-2xl border border-emerald-100 bg-white p-2 shadow-sm"/><Sparkles className="absolute -right-5 -top-2 h-6 w-6 text-amber-400" aria-hidden="true"/></div>
      <p className="mb-2 text-sm font-semibold text-emerald-700">Your pickup companion</p>
      <h2 id="app-download-title" className="text-[32px] font-bold leading-tight tracking-tight">A little app.<br/>A cleaner city.</h2>
      <p id="app-download-description" className="mt-3 text-base leading-6 text-slate-600">Download Junk It Out to book pickups and follow every step from your phone.</p>
     </div>
     <div className="rounded-3xl border border-emerald-100 bg-white p-3 shadow-sm">
      <img src="/app-downloads/download-qr.png" alt="Scan this QR code to download the Junk It Out app" width="320" height="320" className="mx-auto h-[192px] w-[192px]"/>
      <p className="mt-1 flex items-center justify-center gap-2 text-sm font-bold text-emerald-800"><ScanLine className="h-4 w-4" aria-hidden="true"/>Scan to download</p>
     </div>
    </div>
    <div className="mt-6 flex flex-col items-center gap-4 border-t border-emerald-100 pt-5">
     <AppDownloadLinks/>
     <button type="button" onClick={()=>setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-white hover:text-emerald-800">Continue on website</button>
    </div>
   </section>
 </CenteredModalLayer>;
}
