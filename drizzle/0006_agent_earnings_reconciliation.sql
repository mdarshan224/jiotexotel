-- Reconcile completed pickups missed by the former amount:0 implementation.
-- Immutable 65/35 allocation; GST is INCLUDED within company share.
-- Existing successful earnings, receipts, payments and customer balances are untouched.
INSERT OR IGNORE INTO PickupEarning
 (id,orderId,agentId,grossPaise,agentPaise,companyGrossPaise,serviceFeePaise,gstPaise,cgstPaise,sgstPaise,igstPaise,gstRate,policy,createdAt)
WITH gross AS (
 SELECT o.id AS orderId,o.agentId,CAST(ROUND(o.finalAmount*100) AS INTEGER) AS grossPaise,
 CASE WHEN o.gstRate BETWEEN 0 AND 1 THEN o.gstRate ELSE 0.18 END AS gstRate
 FROM `Order` o WHERE o.agentId IS NOT NULL AND o.status IN ('PICKUP_COMPLETED','SETTLEMENT_COMPLETED') AND o.finalAmount>0
 AND NOT EXISTS (SELECT 1 FROM AgentWalletTransaction t WHERE t.status='SUCCESS' AND (t.referenceId='agent-earning-'||o.id OR (t.orderId=o.id AND t.type='PICKUP_EARNINGS')))
), shares AS (
 SELECT *,CAST(ROUND(grossPaise*0.65) AS INTEGER) AS agentPaise FROM gross
), fees AS (
 SELECT *,grossPaise-agentPaise AS companyGrossPaise,CAST(ROUND((grossPaise-agentPaise)/(1+gstRate)) AS INTEGER) AS serviceFeePaise FROM shares
), taxes AS (
 SELECT *,companyGrossPaise-serviceFeePaise AS gstPaise FROM fees
)
SELECT 'earning-backfill-'||orderId,orderId,agentId,grossPaise,agentPaise,companyGrossPaise,serviceFeePaise,gstPaise,
 CAST(ROUND(gstPaise/2.0) AS INTEGER),gstPaise-CAST(ROUND(gstPaise/2.0) AS INTEGER),0,gstRate,'65_35_GST_INCLUDED_V1',strftime('%Y-%m-%dT%H:%M:%f+00:00','now') FROM taxes;
--> statement-breakpoint
INSERT OR IGNORE INTO AgentWallet (id,agentId,balance,createdAt,updatedAt)
SELECT 'wallet-backfill-'||agentId,agentId,0,strftime('%Y-%m-%dT%H:%M:%f+00:00','now'),strftime('%Y-%m-%dT%H:%M:%f+00:00','now') FROM PickupEarning;
--> statement-breakpoint
INSERT OR IGNORE INTO AgentWalletTransaction
 (id,walletId,agentId,type,amount,balanceAfter,status,referenceId,orderId,reason,createdAt,updatedAt)
SELECT 'ledger-backfill-'||e.orderId,w.id,e.agentId,'PICKUP_EARNINGS',e.agentPaise/100.0,0,'MIGRATION_PENDING',
 'agent-earning-'||e.orderId,e.orderId,'65% pickup earnings reconciliation for #'||o.orderNumber,
 strftime('%Y-%m-%dT%H:%M:%f+00:00','now'),strftime('%Y-%m-%dT%H:%M:%f+00:00','now')
FROM PickupEarning e JOIN AgentWallet w ON w.agentId=e.agentId JOIN `Order` o ON o.id=e.orderId
WHERE e.id='earning-backfill-'||e.orderId AND e.agentPaise>0;
--> statement-breakpoint
UPDATE AgentWalletTransaction SET balanceAfter = (
 SELECT ROUND(w.balance + (SELECT SUM(t.amount) FROM AgentWalletTransaction t
 WHERE t.walletId=AgentWalletTransaction.walletId AND t.status='MIGRATION_PENDING'
 AND t.id<=AgentWalletTransaction.id),2) FROM AgentWallet w WHERE w.id=AgentWalletTransaction.walletId
) WHERE status='MIGRATION_PENDING' AND id LIKE 'ledger-backfill-%';
--> statement-breakpoint
UPDATE AgentWallet SET balance=ROUND(balance+COALESCE((SELECT SUM(t.amount) FROM AgentWalletTransaction t
 WHERE t.walletId=AgentWallet.id AND t.status='MIGRATION_PENDING' AND t.id LIKE 'ledger-backfill-%'),0),2),
 updatedAt=strftime('%Y-%m-%dT%H:%M:%f+00:00','now')
 WHERE EXISTS (SELECT 1 FROM AgentWalletTransaction t WHERE t.walletId=AgentWallet.id AND t.status='MIGRATION_PENDING' AND t.id LIKE 'ledger-backfill-%');
--> statement-breakpoint
UPDATE AgentWalletTransaction SET status='SUCCESS' WHERE status='MIGRATION_PENDING' AND id LIKE 'ledger-backfill-%';
