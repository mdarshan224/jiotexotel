# Mobile welcome and agent workspace upgrade

## Changes
- Mobile home: evergreen welcome copy, richer green pickup card, contrasting booking button and existing material photography. Desktop home layout unchanged.
- Agent dashboard: responsive toolbar and wider workspace, shift guidance and last-sync time, shortcuts to current job/history/wallet/dispatch, live job progress, searchable recent assignments with active/completed/cancelled filters and order-detail links.
- Cancelled and legacy completed statuses no longer inflate pending counts.
- Background assignment refresh preserves entered weights for the same order and item; a changed assignment resets the draft. Completion and financial values are displayed only after server confirmation. Completion refreshes the wallet.
- Manual refresh rechecks the agent profile. Wallet loading failures are visible instead of silently leaving stale figures.
- Wallet summaries include successful credits/debits only. Read API supplies a direction for known transaction types and legacy manual adjustments when adjacent recorded balances establish the amount/direction; ambiguous entries remain unsigned. No stored financial records are rewritten.
- Agent wallet: request lock and timeout, stale records cleared after session expiry, return-to-portal link, search of recent ledger entries, clearer manual credit/debit display, wider responsive layout.

## Validation
TypeScript no-emit check passed. Offline regression suite: 163 tests passed across 20 suites, including new weight-draft preservation, terminal-status grouping, ledger direction/totals and authenticated agent wallet scoping checks. No live pickup, payment, notification or financial record mutation was used in QA.

## Limits
History remains the most recent dashboard assignment window, not an unlimited archive. Wallet displays the most recent 100 records. Native background GPS, push delivery and a live agent shift were not device-tested. Existing agent authorization, status transition rules and financial policies are preserved.
