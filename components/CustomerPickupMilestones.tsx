'use client';
import {useEffect,useState} from 'react';
import PickupMilestoneCard from './PickupMilestoneCard';
import MobilePickupMilestoneCard from './MobilePickupMilestoneCard';
import type {PickupMilestoneProgress} from '@/lib/pickupMilestonesPolicy';
export default function CustomerPickupMilestones({variant='account'}:{variant?:'account'|'mobile-home'}){
 const [progress,setProgress]=useState<PickupMilestoneProgress|null>(null),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[unauthorized,setUnauthorized]=useState(false);
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  async function load(){
   try{const response=await fetch('/api/customer/pickup-milestones',{cache:'no-store',credentials:'same-origin',signal:controller.signal});const data=await response.json();if(!active)return;if(response.status===401){setProgress(null);setUnauthorized(true);return;}if(!response.ok||!data.success)throw new Error('Unavailable');setUnauthorized(false);setProgress(data.data);setFailed(false);}
   catch{if(active)setFailed(true);}
  }
  void load();const focus=()=>{if(document.visibilityState==='visible')void load();};window.addEventListener('focus',focus);
  return()=>{active=false;controller.abort();window.removeEventListener('focus',focus);};
 },[retry]);
 if(unauthorized)return null;
 if(progress)return variant==='mobile-home'?<MobilePickupMilestoneCard progress={progress}/>:<PickupMilestoneCard progress={progress}/>;
 if(failed)return <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><span>Pickup milestones are temporarily unavailable.</span><button onClick={()=>{setFailed(false);setRetry(n=>n+1);}} className="font-semibold text-emerald-700">Refresh milestones</button></div>;
 return <div role="status" className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-6 text-sm text-emerald-800">Loading your pickup milestones…</div>;
}
