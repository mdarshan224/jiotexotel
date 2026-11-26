'use client';
import { useEffect, useState } from 'react';
export default function MobileAppCapabilities() {
  const [prompt, setPrompt] = useState<any>(null);
  useEffect(() => {
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event); };
    const installed = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', beforeInstall); window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', installed); };
  }, []);
  return prompt ? <button type="button" className="md:hidden min-h-11 w-full rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800" onClick={async()=>{await prompt.prompt();await prompt.userChoice;setPrompt(null);}}>Add Junk It Out to your home screen</button> : <p className="md:hidden text-center text-[10px] text-slate-400">For an app experience, use your browser’s Add to Home Screen option.</p>;
}
