import {Check, Gift, Sparkles} from 'lucide-react';
import Link from '@/components/AppLink';
import PickupTiersDialog from './PickupTiersDialog';
import type {PickupMilestoneProgress} from '@/lib/pickupMilestonesPolicy';

export default function MobilePickupMilestoneCard({progress}: {progress: PickupMilestoneProgress}) {
  const percent = Math.round(progress.segmentCompleted / progress.segmentTotal * 100);
  return <section aria-label="Your pickup rewards" className="mt-5 overflow-hidden rounded-[26px] border border-emerald-200/70 bg-gradient-to-br from-[#d8f6e8] via-[#e9faf0] to-[#d8f1ed] p-4 shadow-[0_5px_20px_#17472b08]">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-xl font-extrabold tracking-tight text-slate-950">Pick up. Level up.</p><p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><Sparkles className="h-3.5 w-3.5" aria-hidden="true"/>{progress.currentTier.name} tier</p></div>
      <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
        {progress.rewardedMilestones.slice(-2).map(target => <span key={target} className="grid h-7 w-7 place-items-center rounded-full bg-emerald-600 text-white"><Check className="h-4 w-4"/></span>)}
        {progress.rewardedMilestones.length > 0 && <span className="w-3 border-t-2 border-dotted border-emerald-600/50"/>}
        <span className="grid h-11 w-11 place-items-center rounded-full border border-white bg-white/60 shadow-sm ring-2 ring-emerald-400/60 ring-offset-2 ring-offset-emerald-50"><Gift className="h-6 w-6 text-emerald-700" strokeWidth={1.7}/></span>
      </div>
    </div>
    <div className="mb-3 mt-4">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-emerald-900"><span>{progress.completedPickups} completed {progress.completedPickups === 1 ? 'pickup' : 'pickups'}</span><span>{progress.segmentCompleted}/{progress.segmentTotal} to next reward</span></div>
      <div role="progressbar" aria-label="Current pickup reward progress" aria-valuemin={0} aria-valuemax={progress.segmentTotal} aria-valuenow={progress.segmentCompleted} className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/75"><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{width: `${percent}%`}}/></div>
    </div>
    <div className="flex items-center gap-3 rounded-[20px] bg-white p-3.5 shadow-sm">
      <div className="min-w-0 flex-1"><p className="text-base font-extrabold text-slate-950">Unlock ₹{progress.nextRewardAmount}</p><p className="mt-1 text-sm leading-5 text-slate-500">{progress.catchupPending ? 'Your earned reward is being added.' : `${progress.remainingPickups} more ${progress.remainingPickups === 1 ? 'pickup' : 'pickups'} to your ${progress.nextTarget}-pickup milestone.`}</p></div>
      <Link href={progress.catchupPending ? '/customer/wallet' : '/book?cart=1'} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-3.5 text-sm font-bold text-white shadow-sm">{progress.catchupPending ? 'Wallet' : 'Book now'}</Link>
    </div>
    <div className="-mb-1 mt-1 flex flex-wrap items-center justify-between gap-x-2"><Link href="/customer/wallet" className="inline-flex min-h-11 items-center text-xs font-semibold text-emerald-900">₹{progress.totalRewardAmount} earned in wallet</Link><PickupTiersDialog progress={progress}/></div>
  </section>;
}
