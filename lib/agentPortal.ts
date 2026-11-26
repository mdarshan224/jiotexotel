import {isPickupCompletedStatus, normalizeOrderStatus} from './orders/lifecycle';
export const completedAgentStatuses = ['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED','SETTLEMENT_DONE','COMPLETED'];
export function agentPickupGroup(status: string) {
  return isPickupCompletedStatus(status) ? 'completed' : normalizeOrderStatus(status) === 'CANCELLED' ? 'cancelled' : 'active';
}
export function agentLedgerDirection(tx: {type:string;amount:number;balanceAfter:number}, previousBalance?:number): 'CREDIT'|'DEBIT'|null {
  if (['CREDIT','MANUAL_CREDIT','PICKUP_EARNINGS','REFUND'].includes(tx.type)) return 'CREDIT';
  if (['DEBIT','MANUAL_DEBIT'].includes(tx.type)) return 'DEBIT';
  if (previousBalance !== undefined && Number.isFinite(previousBalance)) {
    const delta=tx.balanceAfter-previousBalance;
    if (Math.abs(Math.abs(delta)-tx.amount)<0.005 && delta!==0) return delta>0?'CREDIT':'DEBIT';
  }
  return null;
}
export function agentLedgerTotals(transactions: Array<{status:string;direction?:string|null;amount:number}>) {
  return transactions.reduce((sum,tx)=>{
    if(tx.status==='SUCCESS' && Number.isFinite(tx.amount)) {
      if(tx.direction==='CREDIT') sum.credits+=tx.amount;
      if(tx.direction==='DEBIT') sum.debits+=tx.amount;
    }
    return sum;
  },{credits:0,debits:0});
}
export function agentWeightRows(items:any[], previous:any[], preserve:boolean) {
  return items.map(i=>({itemId:i.id,categoryId:i.categoryId,categoryName:i.category?.name||'Waste item',estimatedWeight:Number(i.estimatedWeight??0),weightStr:preserve ? (previous.find(p=>i.id ? p.itemId===i.id : p.categoryId===i.categoryId)?.weightStr ?? (i.actualWeight>0?String(i.actualWeight):'')) : (i.actualWeight>0?String(i.actualWeight):'')}));
}
