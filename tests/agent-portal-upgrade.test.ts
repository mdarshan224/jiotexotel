import {describe,it,expect} from 'vitest';
import {agentPickupGroup,agentLedgerDirection,agentLedgerTotals,agentWeightRows} from '@/lib/agentPortal';
describe('Agent workspace regressions',()=>{
 it.each(['PICKUP_COMPLETED','SETTLEMENT_DONE','SETTLEMENT_COMPLETED','completed'])('recognizes terminal status %s',status=>expect(agentPickupGroup(status)).toBe('completed'));
 it('never counts cancellations as pending',()=>{expect(agentPickupGroup('CANCELLED')).toBe('cancelled');expect(agentPickupGroup('AGENT_ON_WAY')).toBe('active');});
 it('keeps entered doorstep weights during background refresh, but resets for another job',()=>{
  const items=[{id:'item',categoryId:'paper',estimatedWeight:3,category:{name:'Paper'}}];
  expect(agentWeightRows(items,[{itemId:'item',weightStr:'2.75'}],true)[0].weightStr).toBe('2.75');
  expect(agentWeightRows(items,[{itemId:'item',weightStr:'2.75'}],false)[0].weightStr).toBe('');
 });
 it('does not transfer drafts between different item IDs sharing a category',()=>{expect(agentWeightRows([{id:'new',categoryId:'paper'}],[{itemId:'old',categoryId:'paper',weightStr:'9'}],true)[0].weightStr).toBe('');});
 it('derives legacy manual adjustments from adjacent balances and leaves missing context unknown',()=>{
  const tx={type:'MANUAL_ADJUSTMENT',amount:20,balanceAfter:80};
  expect(agentLedgerDirection(tx,100)).toBe('DEBIT');expect(agentLedgerDirection(tx,60)).toBe('CREDIT');expect(agentLedgerDirection(tx)).toBe(null);expect(agentLedgerDirection(tx,90)).toBe(null);
 });
 it('counts successful credits and debits only, including manual entries',()=>{
  expect(agentLedgerTotals([{status:'SUCCESS',direction:'CREDIT',amount:25},{status:'FAILED',direction:'CREDIT',amount:999},{status:'SUCCESS',direction:'DEBIT',amount:5},{status:'SUCCESS',amount:40}])).toEqual({credits:25,debits:5});
 });
});
