# Junk It Out partner portal

The portal at `/agent` uses the supplied partner-app screenshots as a layout reference, with Junk It Out branding and its existing pickup workflows.

## Screens

- **Sign in / sign up:** mobile OTP, full-name and terms consent for new accounts. No earnings, KYC documents or private workspace is rendered before authentication.
- **Onboarding:** guided Identity, Bank account and Vehicle sections. All six existing verification checks remain required. Mismatches and RC documents continue through operations review.
- **Home:** online/offline switch, location status, current pickup, real daily pickup earnings, completed pickup count and recent assignments.
- **Earnings:** seven-day chart, previous-week navigation, wallet balance, searchable transaction history and retry controls. Chart totals come from immutable pickup earning records, not a truncated transaction list.
- **Pickups:** paginated own assignments with active/completed/cancelled filters and links to the existing pickup detail/actions.
- **Help:** location troubleshooting, pickup OTP and weighing guidance, earnings and verification information, and the existing operations contact.
- **More:** own profile, vehicle, verification, pickup history, earnings, support, legal links and agent-only sign out.

Dates in the weekly chart follow Asia/Kolkata. Each week begins Monday. Zero earnings remain zero; the screens contain no sample incentive or income promises.

## Data and access

`GET /api/agent/overview?week=0` returns only the signed-in, KYC-approved agent's earnings and pickup counts. Week offsets range from 0 to -52.

`GET /api/agent/pickups?filter=all&page=0` returns at most 20 own assignments per page. Allowed filters are all, active, completed and cancelled. The response projects only the pickup number, status, time, redacted area and that agent's credited earnings. Customer phone, full address and identity fields are not included.

Both endpoints are read-only and use private, no-store responses. Existing server-side KYC authorization applies. No database migration or runtime-secret change is needed for this release.

## Validation

- 482 automated tests passed across 44 test files, including real SQLite/D1-adapter tests for ownership, pagination, privacy and IST earnings boundaries.
- TypeScript check and production build passed.
- Desktop and narrow-screen sign-in presentation inspected in the browser.
- Payment, refund, customer-wallet, subscription, OTP, KYC and agent-earnings regressions passed in the existing test suite. Live financial transactions and real KYC submissions were not created for QA.

The source archive excludes environment files, dependency folders, local test data and deployment credentials. Configure runtime secrets through hosting settings.
