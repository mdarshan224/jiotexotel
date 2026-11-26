'use client';
import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, LoaderCircle } from 'lucide-react';
const Chat = lazy(() => import('@/components/CustomerSupportChatWidget'));
export default function SupportChatLauncher() {
  const [mounted, setMounted] = useState(false);
  const [customer,setCustomer]=useState(false);
  useEffect(()=>{let live=true;const check=()=>fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json()).then(j=>{if(live)setCustomer(j?.data?.user?.role==='CUSTOMER'||j?.user?.role==='CUSTOMER');}).catch(()=>{if(live)setCustomer(false);});void check();window.addEventListener('focus',check);window.addEventListener('auth-changed',check);return()=>{live=false;window.removeEventListener('focus',check);window.removeEventListener('auth-changed',check);};},[]);
  useEffect(() => setMounted(true), []);
  const [loaded, setLoaded] = useState(false);
  if (!mounted || !customer) return null;
  return createPortal(loaded ? <Suspense fallback={<button className="support-chat-launcher fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] right-4 md:bottom-6 md:right-6 z-50 grid h-12 w-12 place-items-center rounded-full bg-slate-900 text-white" disabled aria-label="Opening support"><LoaderCircle className="animate-spin" size={20} /></button>}><Chat initiallyOpen /></Suspense>
    : <button onClick={() => setLoaded(true)} type="button" aria-label="Open 24/7 AI Customer Support" className="support-chat-launcher fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] right-4 md:bottom-6 md:right-6 z-50 grid h-12 w-12 place-items-center rounded-full bg-slate-900 text-emerald-300 shadow-lg ring-1 ring-emerald-500/30"><Bot size={22} /></button>, document.body);
}
