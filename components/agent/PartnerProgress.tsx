'use client';
import {useEffect,useState} from 'react';
import Link from '@/components/AppLink';
import {Wallet, PackageCheck, Clock3, ChevronRight, ShieldCheck, Navigation} from 'lucide-react';
import {agentFetch} from '@/lib/agentFetch';
import {type AgentOverview} from '@/lib/agentOverview';
import {partnerMoney} from './PartnerPage';
export default function PartnerProgress({refreshKey}: {refreshKey?: string}) {
 const [data,setData]=useState<AgentOverview|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();let live=true;const timeout=setTimeout(()=>controller.abort(),15000);setError(false);agentFetch('/api/agent/overview',{cache:'no-store',signal:controller.signal}).then(async r=>{const result=await r.json();if(!r.ok||!result.success)throw Error();if(live)setData(result.data);}).catch(()=>{if(live)setError(true);}).finally(()=>clearTimeout(timeout));return()=>{live=false;clearTimeout(timeout);controller.abort();};},[refreshKey,retry]);
 return <div className="partner-home-cards"><section className="partner-card partner-today"><div className="partner-section-title"><h2>Today’s progress</h2><Link href="/agent/wallet">Earnings <ChevronRight size={16}/></Link></div>{error?<p role="status">Progress couldn’t load. <button type="button" onClick={()=>setRetry(n=>n+1)} className="partner-text-button">Retry</button></p>:<div className="partner-stats"><div><Wallet size={19}/><strong>{data?partnerMoney(data.today.earnings):'—'}</strong><span>Earned today</span></div><div><PackageCheck size={19}/><strong>{data?.today.pickups ?? '—'}</strong><span>Completed today</span></div><div><Clock3 size={19}/><strong>{data?.active ?? '—'}</strong><span>Active pickups</span></div></div>}<p className="partner-caption">Today in Bengaluru · Earnings from completed pickups</p></section><div className="partner-quick-links"><Link href="/agent/pickups"><PackageCheck/><span>Your pickups</span></Link><Link href="/agent/onboarding"><ShieldCheck/><span>Verification</span></Link><Link href="/agent/help#location"><Navigation/><span>Location help</span></Link></div></div>;
}
