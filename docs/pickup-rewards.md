# Pickup rewards and tiers

Rewards accumulate at ₹10 per completed pickup and are released at milestones. Each credit covers only the additional pickups since the preceding milestone.

| Completed pickups | Reward added at this milestone | Tier unlocked |
| --- | --- | --- |
| 0 | — | Explorer |
| 3 | ₹30 | Starter |
| 6 | ₹30 | Silver |
| 10 | ₹40 | Gold |
| 15 | ₹50 | Platinum |
| 21 | ₹60 | Diamond |

Targets continue as triangular numbers: 28, 36, 45, and so on. The total earned at a target is target × ₹10; the new credit is the difference from the preceding milestone. For example, the sixth completed pickup adds another ₹30, bringing total milestone earnings to ₹60. Diamond remains the highest named tier; rewards continue beyond it. Total milestone rewards earned by 21 completed pickups are ₹210.

Only one reward target is exposed at a time. The next target is revealed after the preceding reward is successfully recorded. The roadmap shows all six tier names, with future tiers locked and future reward amounts/targets hidden. Tier upgrades follow credited milestones.

The reference-style compact banner appears on the actual home page for authenticated active customers at mobile widths. It refreshes when authentication changes or the page regains focus. Anonymous visitors, agents and accounts awaiting deletion do not see a customer reward card. The desktop home layout is unchanged. Account and wallet cards also show the active milestone and tier roadmap.

## Accounting and compatibility

- Count historical and new orders in PICKUP_COMPLETED, SETTLEMENT_COMPLETED or legacy COMPLETED status, once per order. Pending and cancelled orders do not count.
- Complete orders and award their milestone credit in the same database transaction. The customer progress and wallet endpoints reconcile any missed historical credits.
- Credits use the existing wallet ledger and non-expiring promotional bonus grants. Paid wallet funds are not increased. Existing bonus-first spending, bucket-specific refunds and account-deletion cleanup apply.
- Keep the stable first-credit key `pickup-milestone:v1:CUSTOMER:TARGET` to prevent an older in-flight request from issuing another first credit during deployment.
- Preserve all previous ₹30 ledger entries and their spent or unspent grants. If a historical flat reward is below the corrected incremental amount, create only the shortfall with the unique key `pickup-milestone:v2:CUSTOMER:TARGET`. Previously issued full-target credits and their upgrades remain intact and mark that milestone as fulfilled; never claw back a larger credit, rewrite history or reissue a spent bonus.
- Normal opens with no newly earned milestone avoid write transactions. Concurrent credit attempts retry bounded serialization conflicts.
- The existing authenticated `/api/internal/jobs/pickup-milestones` batch job applies historical rewards and upgrades idempotently. It remains protected by its dedicated HMAC credential, private/no-store responses and server-side database access.

No new database schema or Supabase tables are required: orders, credits, bonus allocations and completion transactions remain in the existing Site database. Supabase is available but is not used as a second wallet source of truth.
