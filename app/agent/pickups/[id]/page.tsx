'use client';
import {agentFetch as fetch} from '@/lib/agentFetch';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from '@/components/AppLink';
import AgentPickupDetail from '@/components/AgentPickupDetail';
export default function AgentPickupPage(){
 const {id}=useParams<{id:string}>();
 const [order,setOrder]=useState<any>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError('');setOrder(null);fetch('/api/orders/'+encodeURIComponent(id),{cache:'no-store',signal:controller.signal}).then(async r=>{const j=await r.json();if(!r.ok||!j.success||j.data?.viewerRole!=='AGENT')throw new Error(j.message||'Sign in through the agent portal to view this pickup.');setOrder(j.data);}).catch(e=>{if(!controller.signal.aborted)setError(e.message||'Could not load pickup details.');});return()=>controller.abort();},[id,retry]);
 if(order)return <AgentPickupDetail order={order}/>;
 return <main className="min-h-screen bg-slate-950 text-white p-6 pb-28"><div className="mx-auto max-w-md space-y-5"><Link href="/agent">Your pickups</Link><h1 className="text-2xl font-bold">Pickup details</h1><p role="status">{error||'Loading pickup…'}</p>{error&&<button className="rounded-xl bg-emerald-600 px-5 py-3" onClick={()=>setRetry(n=>n+1)}>Try again</button>}</div></main>;
}
