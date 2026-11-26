'use client';
import {Dialog} from 'radix-ui';
import {X} from 'lucide-react';
import PickupTierRoadmap from './PickupTierRoadmap';
import type {PickupMilestoneProgress} from '@/lib/pickupMilestonesPolicy';

export default function PickupTiersDialog({progress}: {progress: PickupMilestoneProgress}) {
  return <Dialog.Root>
    <Dialog.Trigger className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-emerald-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-600">View tiers</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-sm"/>
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[90] max-h-[min(90dvh,760px)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-3xl border border-emerald-100 bg-white p-5 text-slate-900 shadow-2xl outline-none sm:p-6">
        <div className="pr-11"><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Junk It Out rewards</p><Dialog.Title className="mt-2 text-2xl font-extrabold tracking-tight">Your tier journey</Dialog.Title><Dialog.Description className="mb-4 mt-2 text-sm leading-6 text-slate-500">Every completed pickup brings you closer. Finish your current milestone to reveal the next reward.</Dialog.Description></div>
        <Dialog.Close aria-label="Close tier roadmap" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-600"><X className="h-5 w-5"/></Dialog.Close>
        <PickupTierRoadmap progress={progress}/>
        <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">{progress.currentTier.id === 'diamond' ? 'Diamond unlocked. Your pickup milestones and wallet rewards keep going.' : 'Tier names are your roadmap. Only the next milestone is open at a time.'}</p>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
