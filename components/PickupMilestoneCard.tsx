import {Gift,Sparkles,Trophy} from 'lucide-react';
import PickupTiersDialog from './PickupTiersDialog';
import Link from '@/components/AppLink';
import type {PickupMilestoneProgress} from '@/lib/pickupMilestonesPolicy';
export default function PickupMilestoneCard({progress}:{progress:PickupMilestoneProgress}){
 const percent=Math.min(100,Math.round(progress.segmentCompleted/progress.segmentTotal*100));
 return <section aria-labelledby="pickup-milestone-heading" className="overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-5 shadow-sm sm:p-6">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white"><Trophy className="h-6 w-6" aria-hidden="true"/></span><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">{progress.currentTier.name} · Pickup milestones</p><h2 id="pickup-milestone-heading" className="mt-1 text-xl font-bold tracking-tight text-slate-950">A little closer to your next ₹{progress.nextRewardAmount}</h2></div></div>
   <span className="rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-sm font-bold text-emerald-800">₹{progress.totalRewardAmount} earned</span>
  </div>
  <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold text-slate-700">{progress.completedPickups} completed {progress.completedPickups===1?'pickup':'pickups'}</span><span className="font-bold text-emerald-700">Next target: {progress.nextTarget}</span></div>
  <div role="progressbar" aria-label="Pickup milestone progress" aria-valuemin={0} aria-valuemax={progress.segmentTotal} aria-valuenow={progress.segmentCompleted} className="mt-3 h-2.5 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{width:`${percent}%`}}/></div>
  <p className="mt-2 text-sm leading-6 text-slate-600">{progress.catchupPending?'Your completed-pickup rewards are being added to your wallet.':`${progress.remainingPickups} more completed ${progress.remainingPickups===1?'pickup':'pickups'} to unlock ₹${progress.nextRewardAmount} in your wallet.`}</p>
  <ol className="mt-5" aria-label="Your next pickup milestone">
   {progress.milestones.map(milestone=><li key={milestone.target} className="flex items-center gap-4 rounded-2xl border border-emerald-300 bg-white p-4 shadow-sm">
    <Gift className="h-7 w-7 text-emerald-600" aria-hidden="true"/>
    <div><p className="text-lg font-bold text-slate-900">{milestone.target} <span className="text-sm font-medium">pickups</span></p><p className="mt-1 text-sm text-slate-500">Your current milestone</p></div><p className="ml-auto text-2xl font-bold text-emerald-700">₹{milestone.rewardAmount}</p>
   </li>)}
  </ol>
  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-100 pt-4"><p className="flex items-center gap-2 text-xs leading-5 text-slate-500"><Sparkles className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true"/>₹10 per completed pickup, credited at milestones. Past completed pickups count too.</p><div className="flex items-center gap-3"><PickupTiersDialog progress={progress}/><Link href="/customer/wallet" className="text-sm font-bold text-emerald-700 underline-offset-4 hover:underline">View wallet</Link></div></div>
 </section>;
}
