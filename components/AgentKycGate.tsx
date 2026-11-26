'use client';
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
export default function AgentKycGate({children}:{children:React.ReactNode}){
 const path=usePathname(),[ready,setReady]=useState(false),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{if(path==='/agent/onboarding'){setReady(true);return;}let active=true;const controller=new AbortController();async function check(){setReady(false);setError(false);try{const response=await fetch('/api/auth/me',{cache:'no-store',signal:controller.signal}),data=await response.json();if(!active)return;if(data.data?.user?.role==='AGENT'&&data.data.user.agent?.onboardingApproved!==true){window.location.replace('/agent/onboarding');return;}if(!response.ok&&response.status!==401)throw new Error();setReady(true);}catch{if(active)setError(true);}}void check();window.addEventListener('jio_auth_change',check);return()=>{active=false;controller.abort();window.removeEventListener('jio_auth_change',check);};},[path,retry]);
 if(path==='/agent/onboarding')return children;
 if(error)return <div className="min-h-screen bg-slate-950 p-8 text-white"><p>Could not verify agent access.</p><button className="mt-4 rounded-xl bg-emerald-700 px-5 py-3" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>;
 return ready?children:<div role="status" className="min-h-screen bg-slate-950 p-8 text-white">Checking agent verification…</div>;
}
