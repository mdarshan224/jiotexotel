export const COMPLETED_PICKUP_STATUSES = ['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED', 'COMPLETED'];
export const PICKUP_MILESTONE_TYPE = 'MILESTONE_REWARD';
export const LEGACY_PICKUP_MILESTONE_REWARD_PAISE = 3000;

export function isPickupMilestoneTarget(target: number) {
  return Number.isSafeInteger(target) && target >= 3 && Number.isInteger((Math.sqrt(8 * target + 1) - 1) / 2);
}

export function pickupMilestoneRewardPaise(target: number) {
  if (!isPickupMilestoneTarget(target) || !Number.isSafeInteger(target * 1000)) throw new Error('Invalid pickup milestone.');
  const n = (Math.sqrt(8 * target + 1) - 1) / 2;
  const previous = n === 2 ? 0 : (n - 1) * n / 2;
  // ₹10 for each additional completed pickup since the preceding milestone.
  return (target - previous) * 1000;
}

export function pickupMilestoneTargets(completed: number) {
  if (!Number.isSafeInteger(completed) || completed < 0) throw new Error('Invalid completed pickup count.');
  const targets: number[] = [];
  for (let n = 2; n * (n + 1) / 2 <= completed; n++) targets.push(n * (n + 1) / 2);
  return targets;
}

const TIERS = [
  { id: 'explorer', name: 'Explorer', target: 0 },
  { id: 'starter', name: 'Starter', target: 3 },
  { id: 'silver', name: 'Silver', target: 6 },
  { id: 'gold', name: 'Gold', target: 10 },
  { id: 'platinum', name: 'Platinum', target: 15 },
  { id: 'diamond', name: 'Diamond', target: 21 },
] as const;
export type PickupTierId = typeof TIERS[number]['id'];
export type PickupTier = { id: PickupTierId; name: string; state: 'ACHIEVED' | 'CURRENT' | 'NEXT' | 'LOCKED' };
export type PickupMilestoneProgress = {
  completedPickups: number; totalRewardAmount: number; rewardedMilestones: number[];
  nextTarget: number; nextRewardAmount: number; remainingPickups: number;
  segmentCompleted: number; segmentTotal: number; catchupPending: boolean;
  currentTier: { id: PickupTierId; name: string }; tiers: PickupTier[];
  milestones: Array<{ target: number; state: 'CURRENT'; rewardAmount: number }>;
};

export function pickupMilestoneProgress(completed: number, rewarded: number[], totalRewardPaise?: number): PickupMilestoneProgress {
  pickupMilestoneTargets(completed);
  const earned = new Set(rewarded);
  let n = 2;
  while (earned.has(n * (n + 1) / 2)) n++;
  const next = n * (n + 1) / 2, previous = n === 2 ? 0 : (n - 1) * n / 2;
  const reward = pickupMilestoneRewardPaise(next) / 100;
  const tierIndex = TIERS.reduce((index, tier, i) => tier.target <= previous ? i : index, 0);
  const tier = TIERS[tierIndex];
  return {
    completedPickups: completed,
    totalRewardAmount: (totalRewardPaise ?? [...earned].reduce((sum, target) => sum + pickupMilestoneRewardPaise(target), 0)) / 100,
    rewardedMilestones: [...earned].sort((a, b) => a - b),
    nextTarget: next, nextRewardAmount: reward, remainingPickups: Math.max(0, next - completed),
    segmentCompleted: Math.max(0, Math.min(next - previous, completed - previous)), segmentTotal: next - previous,
    catchupPending: completed >= next, currentTier: { id: tier.id, name: tier.name },
    tiers: TIERS.map((entry, i) => ({ id: entry.id, name: entry.name, state: i < tierIndex ? 'ACHIEVED' : i === tierIndex ? 'CURRENT' : i === tierIndex + 1 ? 'NEXT' : 'LOCKED' })),
    // Future reward amounts and targets appear only when the preceding milestone is credited.
    milestones: [{ target: next, state: 'CURRENT', rewardAmount: reward }],
  };
}
