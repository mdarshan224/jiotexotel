# Customer test login and account deletion

## Delivered behavior

- Customer test mobile: **9876543210**. The only accepted static OTP is **563130**.
- Both requesting a code and verifying this test credential skip the SMS provider. No initial send request is necessary for verification. Other customers retain their existing OTP flow.
- This credential is enabled by default, including production, as requested. `CUSTOMER_STATIC_TEST_LOGIN_ENABLED=false` disables it. It never grants administrator or agent access. Treat this as a dedicated test customer account.
- Customer Profile now includes **Delete my account**, an explicit DELETE confirmation, a recovery deadline displayed in IST, and **Recover my account**.
- Deletion pauses access immediately and revokes existing sessions. A refreshed recovery session allows access to the profile and recovery action only. Login during the grace period opens the profile; login alone does not cancel deletion.
- Recovery is allowed strictly before 48 hours. Duplicate requests keep the original deadline. Customer IDs supplied by clients are ignored; the server uses the authenticated account.
- The cleanup job erases the customer and related database data and owned local/Blob uploads, including unattached uploads identified by the existing per-user filename prefix. It removes orders, addresses, invoices, payments, refunds/events, wallet/bonus records, subscriptions, reviews, complaints, tracking records, notifications, identifiable audit snapshots, and matching contact enquiries. Agent earnings entries retain their amounts but lose customer/order identifiers and descriptive personal data, preserving the agent ledger.
- A keyed HMAC phone fingerprint is retained solely to block onboarding for **30 days starting at successful permanent deletion**. The raw phone number is not stored in the block table. Expired blocks are ignored immediately and removed by the cleanup job.
- If cleanup is delayed or fails, recovery and login still close at the 48-hour deadline. Failed file cleanup retains ownership records for retry. Successful deletions are idempotent.

## Required rollout steps

This package is source code; it has not modified the live website, production database, or hosting configuration.

1. Deploy on the application's existing Node.js/PostgreSQL hosting stack. Preserve all existing secrets and services.
2. Configure `ACCOUNT_DELETION_HMAC_SECRET` with a newly generated random secret of at least 32 characters, plus `CRON_SECRET`. Keep the HMAC secret stable for at least the entire life of all active phone blocks; changing it invalidates existing fingerprints. These values must be server-only. Normal authentication fails closed if the deletion schema or HMAC secret is missing.
3. Apply `prisma/migrations/20261108120000_customer_account_deletion/migration.sql` to the existing database before enabling this release. If the deployment already tracks Prisma migration history correctly, run `npx prisma migrate deploy`. Do not replay old, untracked migrations against an existing database. The new migration adds two nullable User fields, one index and the DeletedPhoneBlock table; it does not remove customer records.
4. Run `npm ci`, `npx prisma generate`, and `npm run build`, then deploy.
5. Ensure `BLOB_READ_WRITE_TOKEN` is present for the existing production Blob store. Cleanup fails closed when production Blob credentials are unavailable. Local development uses `storage/uploads`.
6. `vercel.json` schedules `/api/internal/jobs/account-deletion` every minute. The hosting plan must support this interval. On other hosting, schedule authenticated POST (or GET) requests every minute, with `Authorization: Bearer <CRON_SECRET>`. The job must run unattended; it does not depend on someone visiting the website. Monitor non-2xx responses and retry them. Each invocation processes up to 25 accounts, oldest first; monitor backlog and increase capacity if needed.
7. Recovery closes at exactly the stored deadline. Physical erasure occurs on the next successful scheduled run, normally within a minute, rather than being guaranteed at the exact millisecond. Storage/database outages can delay erasure, but never reopen recovery.

## Scope of erasure

The cleanup covers this application's active database and its supported uploads. It cannot remotely delete payment-provider, SMS/WhatsApp-provider or support-webhook copies, hosting logs, previously downloaded exports, or historical backups. Manage retention/erasure for those systems separately. Legacy uploads with neither a customer-specific filename nor a remaining database reference cannot be attributed safely and need a separate inventory review. Do not describe these third-party and backup copies as automatically erased.

Deleting an account does not issue refunds or settle open pickups/wallet balances. The confirmation explains this and directs customers to resolve these with support first.

## Validation

- Production Next.js build completed successfully.
- Targeted tests cover the exact test credential, provider bypass, other-number provider routing, request authorization/confirmation, cross-origin rejection, scheduler authorization, recovery boundary, session restrictions and blocked/expired numbers.
- An isolated PostgreSQL integration test covers concurrent requests, deadline preservation, recovery, relational erasure with restrictive foreign keys, local photos and unattached uploads, storage-failure retry, idempotency, preservation of unrelated users, and onboarding after block expiry.
- The broad pre-existing regression suite was stopped by automatic approval review because an existing test attempted an external OpenAI API request. It is not reported as passing.
- No live-provider deletion, production migration or browser interaction test was performed.

Run targeted tests:

```sh
npx vitest run tests/account-deletion.test.ts tests/account-deletion-routes.test.ts tests/customer-otp-test-mode.test.ts
```

For the database integration test, use a new, empty isolated local PostgreSQL database with `test` in its name, set `DATABASE_URL` and `DIRECT_URL`, leave `BLOB_READ_WRITE_TOKEN` unset, and run:

```sh
npx prisma db push --skip-generate
node --conditions=react-server --import tsx tests/account-deletion.postgres.test.ts
```

Never point the integration test at a production database.
