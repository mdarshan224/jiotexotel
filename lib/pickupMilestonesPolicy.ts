export const PICKUP_MILESTONE_REWARD_PAISE=3000;
export const COMPLETED_PICKUP_STATUSES=['PICKUP_COMPLETED','SETTLEMENT_COMPLETED','COMPLETED'];
export const PICKUP_MILESTONE_TYPE='MILESTONE_REWARD';
export function pickupMilestoneTargets(completed:number){
 if(!Number.isSafeInteger(completed)||completed<0)throw new Error('Invalid completed pickup count.');
 const targets:number[]=[];
 for(let n=2;n*(n+1)/2<=completed;n++)targets.push(n*(n+1)/2);
 return targets;
}
export type PickupMilestoneProgress={completedPickups:number;totalRewardAmount:number;rewardedMilestones:number[];nextTarget:number;remainingPickups:number;segmentCompleted:number;segmentTotal:number;catchupPending:boolean;milestones:Array<{target:number;state:'CURRENT'|'LOCKED';rewardAmount:number}>};
export function pickupMilestoneProgress(completed:number,rewarded:number[]):PickupMilestoneProgress{
 pickupMilestoneTargets(completed);
 const earned=new Set(rewarded);let n=2;
 while(earned.has(n*(n+1)/2))n++;
 const next=n*(n+1)/2,previous=n===2?0:(n-1)*n/2;
 return {completedPickups:completed,totalRewardAmount:earned.size*30,rewardedMilestones:[...earned].sort((a,b)=>a-b),nextTarget:next,remainingPickups:Math.max(0,next-completed),segmentCompleted:Math.max(0,Math.min(next-previous,completed-previous)),segmentTotal:next-previous,catchupPending:completed>=next,milestones:[0,1,2].map((offset)=>({target:(n+offset)*(n+offset+1)/2,state:offset===0?'CURRENT':'LOCKED',rewardAmount:30}))};
}
