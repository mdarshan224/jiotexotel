'use client';
import {ScanLine} from 'lucide-react';
import {APP_DOWNLOAD_PROMPT_EVENT} from '@/lib/appDownloads';
export default function AppDownloadQrButton(){
 return <button type="button" onClick={()=>window.dispatchEvent(new Event(APP_DOWNLOAD_PROMPT_EVENT))}
  className="mt-3 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"><ScanLine className="h-4 w-4" aria-hidden="true"/>Scan QR to download</button>;
}
