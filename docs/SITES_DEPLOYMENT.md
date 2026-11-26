# Junk It Out testing Site

## Hosting

This checkout runs on ChatGPT Sites with its DB binding for structured records and BUCKET binding for private uploaded files. PostgreSQL connection strings and external Blob credentials are not used by this deployment. Existing PostgreSQL migrations remain as source history; only generated `drizzle/` migrations are applied to the Sites database.

The testing database starts empty of customer records, agents and bookings. Its first request idempotently initializes the original waste catalog, service areas, subscription offers and authorized main administrator. Production records were not copied into this testing Site.

Test customer login: **9876543210 / 563130**. Both code request and verification skip the SMS provider for this number. Other numbers use the existing OTP integration once its environment settings are configured.

## Settings

Add provider configuration through Site settings: the existing SMS/WhatsApp, payment, Maps and optional support AI variable names are preserved. Server-only secrets must stay out of browser bundles. The Maps browser key is loaded from an explicit public-config allowlist at runtime, so adding it in Settings does not require a source rebuild. Restrict that browser key to the testing domain. The Site already has independently generated JWT_SECRET, ACCOUNT_DELETION_HMAC_SECRET and CRON_SECRET. Keep the deletion HMAC secret stable while any 30-day block is active. CUSTOMER_STATIC_TEST_LOGIN_ENABLED=false retires the test credential.

This Site is public. Its primary domain is junkitout.in; www.junkitout.in and the former testing.junkitout.in redirect browser pages to the primary domain while preserving paths and query strings. Customer, admin and agent APIs retain their application authentication. SITES_PRIVATE_JOBS_ENABLED is disabled. Scheduled jobs use the authenticated CRON_SECRET endpoints.

## Database compatibility and safeguards

The original application uses Prisma PostgreSQL transactions and row locks. The ordinary Prisma D1 driver ignores interactive transactions, so this Site adds a serializable optimistic transaction layer: evaluate a bounded consistent snapshot using SQLite, then replay all writes in a single D1 batch with a revision precondition. A conflict aborts the whole batch before business writes, preserving wallet/payment consistency. Individual writes increment the same revision atomically. No PostgreSQL row-lock statements are sent to SQLite.

This compatibility layer is deliberately bounded for this testing deployment: at most 10,000 total snapshot rows, 5,000 rows per table and 4 MiB of snapshot JSON. Beyond these limits, transactions fail closed until testing records are archived or the data layer is adapted for a larger workload. It is not a claim that this testing migration has been load-tested for production volumes.

Uploads use the Site's private bucket. Photos are served by the existing authorized view route; material catalog photos remain public. Account erasure removes attached and unattached customer uploads as well as related active database records. External providers, historical backups, logs and exported copies remain outside the app's erasure scope.

## Deletion maintenance

Recovery stops exactly 48 hours after the request. The next successful maintenance run permanently erases due accounts, then blocks their keyed phone fingerprint for 30 days after successful erasure. Up to 25 accounts are processed per invocation; failures return non-2xx and preserve retryable ownership records. A delayed job never reopens recovery or login.

For unattended maintenance, POST /api/internal/jobs/account-deletion and /api/internal/jobs/wallet-bonus-expiry with the configured CRON_SECRET bearer credential. The public Site must reject anonymous maintenance calls. An hourly task is linked to this Site.

## Verification

- The Sites production build and application TypeScript check pass.
- Targeted authentication/deletion tests check exact static code, provider bypass, recovery deadline, access restrictions and signup blocks.
- SQLite adapter integration checks nested writes and dates, rollback, concurrent debits, atomic ledger entries, stale snapshots and array transactions.
- Browser preview renders the customer profile login screen.
- Hosted migrations, domain/TLS and maintenance readiness are verified during publication. External SMS, WhatsApp, Maps and payment calls require the settings supplied by the owner.

Run `npm run test:sites`, `npm run test:sites-database`, and the Sites build helper when changing this port. Never run the old PostgreSQL test suite against the Sites database.
