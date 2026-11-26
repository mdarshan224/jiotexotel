'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {LoaderCircle} from 'lucide-react';
import {agentPageAccess} from '@/lib/agentSession';
import {useAgentSession} from './AgentSession';
import AgentAuthScreen from './AgentAuthScreen';
export default function AgentKycGate({children}:{children:React.ReactNode}){
 const path=usePathname(),{session,refresh}=useAgentSession(),access=agentPageAccess(session,path);
 useEffect(()=>{if(access==='redirect')window.location.replace('/agent/onboarding');},[access]);
 if(access==='guest')return <AgentAuthScreen/>;
 if(access==='error')return <section className="flex min-h-[100dvh] items-center justify-center bg-[#f3f8f4] p-6"><div className="max-w-sm rounded-3xl border bg-white p-7 text-center"><h1 className="text-xl font-bold">Let’s reconnect.</h1><p className="mt-3 text-sm leading-6 text-slate-500">We couldn’t check your session. Please check your connection and try again.</p><button className="mt-5 min-h-12 rounded-xl bg-emerald-800 px-6 font-semibold text-white" onClick={()=>void refresh()}>Try again</button></div></section>;
 if(access==='checking'||access==='redirect')return <div role="status" aria-live="polite" className="flex min-h-[100dvh] items-center justify-center gap-3 bg-[#f3f8f4] p-6 text-sm font-semibold text-emerald-900"><LoaderCircle size={22} className="animate-spin"/>Opening your partner portal…</div>;
 return children;
}
