import {Check, Compass, Crown, Gem, Leaf, Lock, Medal, Sparkles} from 'lucide-react';
import type {PickupMilestoneProgress, PickupTierId} from '@/lib/pickupMilestonesPolicy';

const icons = {explorer: Compass, starter: Leaf, silver: Medal, gold: Crown, platinum: Sparkles, diamond: Gem};
const colors: Record<PickupTierId, string> = {
  explorer: 'bg-emerald-100 text-emerald-700', starter: 'bg-teal-100 text-teal-700',
  silver: 'bg-slate-200 text-slate-600', gold: 'bg-amber-100 text-amber-700',
  platinum: 'bg-sky-100 text-sky-700', diamond: 'bg-violet-100 text-violet-700',
};

export default function PickupTierRoadmap({progress}: {progress: PickupMilestoneProgress}) {
  return <ol aria-label="Pickup tier roadmap" className="relative space-y-1">
    {progress.tiers.map((tier, index) => {
      const Icon = icons[tier.id];
      const locked = tier.state === 'LOCKED';
      return <li key={tier.id} aria-current={tier.state === 'CURRENT' ? 'step' : undefined} className="relative flex min-h-20 items-center gap-4 py-2">
        {index < progress.tiers.length - 1 && <span aria-hidden="true" className={`absolute left-6 top-14 h-10 w-px ${tier.state === 'ACHIEVED' ? 'bg-emerald-300' : 'border-l border-dashed border-slate-200'}`}/>}
        <span className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${locked ? 'bg-slate-100 text-slate-400' : colors[tier.id]} ${tier.state === 'CURRENT' ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}><Icon className="h-6 w-6" aria-hidden="true"/></span>
        <div className="min-w-0 flex-1"><p className={`font-bold ${locked ? 'text-slate-400' : 'text-slate-900'}`}>{tier.name}</p><p className="mt-1 text-sm leading-5 text-slate-500">{tier.state === 'CURRENT' ? 'Your current tier' : tier.state === 'ACHIEVED' ? 'Achieved' : tier.state === 'NEXT' ? `${progress.nextTarget} completed pickups · ₹${progress.nextRewardAmount} wallet reward` : 'Locked'}</p></div>
        {tier.state === 'ACHIEVED' ? <Check className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Achieved"/> : locked ? <Lock className="h-4 w-4 shrink-0 text-slate-400" aria-label="Locked"/> : <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${tier.state === 'CURRENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{tier.state === 'CURRENT' ? 'You' : 'Next'}</span>}
      </li>;
    })}
  </ol>;
}
