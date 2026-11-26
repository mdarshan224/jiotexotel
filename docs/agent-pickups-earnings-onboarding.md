# Agent pickup repairs, earnings and Secure ID

## Pickup screen and contact privacy

Agent history opens `/agent/pickups/[id]`. The generic order route also renders an agent-specific view when its authenticated response identifies the viewer as an agent. The original crash was `item.subtotal.toFixed()` on the narrow agent API projection, which omitted `subtotal`.

`agentOrder` is the closed response projection for agent order reads and action responses. It excludes customer phones/email, raw notes, invoices, payment records and customer receipts. Contact-like numeric strings in permitted text are redacted. Agent SSE carries identifiers/status and sanitized offer summaries, never hydrated customer/order objects. Agent review/complaint responses and notification text use the same redaction. Customer receipt downloads are restricted to the customer and admins. Agent calls have no direct-number fallback.

All new Exotel support and pickup bridges request `Record=true`. Recordings remain with Exotel; no real call was placed during QA.

## Earnings policy

The owner specified 65% to agents and 35% to the company, with GST within the company service fee share. `splitPickupEarnings` uses integer paise and the existing configured GST rate. It never adds tax to the pickup total or deducts it from the agent's 65%.

For a ₹100 final pickup amount at 18% GST:

| Allocation | Amount |
| --- | ---: |
| Agent wallet credit | ₹65.00 |
| Company share including GST | ₹35.00 |
| Company service fee excluding GST | ₹29.66 |
| GST within company share | ₹5.34 |

The GST-inclusive arithmetic is gross / (1 + rate) for the taxable service fee, with the remainder recorded as tax. See [CBIC valuation rules, Rule 35](https://cbic-gst.gov.in/valuation-rules.html). This implements the owner's commercial split using the existing rate; it does not change tax classifications.

Completion, allocation snapshot, wallet credit, ledger entry and invoice tax fields commit in one guarded database transaction. `PickupEarning.orderId` and the wallet reference `agent-earning-<orderId>` deduplicate retries. Once recorded, allocation amounts do not change on replay. A zero final amount records a zero allocation and creates no artificial wallet credit. GST and CGST/SGST or IGST reconcile exactly to the company share.

Migration 0006 reconciles missing positive-value completed pickups without crediting unfinished or cancelled orders. It preserves existing balances and successful earnings and can be rerun without another credit. Historic issued invoices and customer payment records remain intact. Their new internal earnings allocation is visible in `/admin/agent-earnings`.

## Cashfree Secure ID agent onboarding

- Agent entry point: `/agent/onboarding` and the agent navigation.
- Admin review: `/admin/agent-onboarding`.
- Server-owned profile and verification IDs; no client-selected agent/phone.
- Explicit agent consent before sharing registered name, mobile and optional email.
- Cashfree hosted KYC Links; raw Aadhaar/PAN/bank documents are not stored here.
- Save only reference, consent time, expiry, allowlisted form URL, check types/statuses and admin review.
- No automatic SMS/email creation notification (`notification_types: []`).
- Unknown create outcomes retain their verification ID and are checked by GET before another attempt. Expired links can be renewed with fresh consent.
- Provider completion with successful check statuses and explicit admin approval is required for new agents to go online or receive/accept jobs. Existing agents retain their access.
- Provider redirects are rejected. Browser input/redirects cannot mark an agent verified.

Secrets are supplied through Site settings only:

- `CASHFREE_SECURE_ID_CLIENT_ID`
- `CASHFREE_SECURE_ID_CLIENT_SECRET`
- `CASHFREE_SECURE_ID_PUBLIC_KEY` (complete extracted PEM)
- Optional `CASHFREE_SECURE_ID_MODE` (`production` by default)
- Optional `CASHFREE_SECURE_ID_TEMPLATE` (`Aadhaar_verification` by default)

The default template verifies Aadhaar only. For additional PAN/bank/driving licence checks, configure a custom KYC Link template in Cashfree and set its exact name. The agent reads and consents to the checks shown in that hosted form.

Generate the public key in Cashfree → Secure ID → Developers → Two-Factor Authentication. Switch the active method to Public Key, generate/download, then extract the production ZIP with the password emailed by Cashfree. Paste the PEM into the secret above. Redeploy after a runtime setting change.

Provider references: [authentication and RSA-OAEP SHA1](https://www.cashfree.com/docs/api-reference/vrs/getting-started), [create link](https://www.cashfree.com/docs/api-reference/vrs/v2/kyc-links/generate-form-link), [status query](https://www.cashfree.com/docs/api-reference/vrs/v2/kyc-links/get-form-status). Status requests use the documented `verificationID` query parameter. No production identity verification or new KYC record is created by QA.

## Validation

- TypeScript compilation.
- Existing wallet/payment/subscription/account-deletion/Exotel regression suites.
- Real local SQLite pickup completion, credit retry/rollback, reconciliation and phone-free API tests.
- UI rendering regression for missing item subtotal; local browser inspection of the actual agent detail component with a fixture.
- Public-key signature decryption test and actual Worker-runtime fixture tests for Cashfree signing/requests and Exotel recording/redirect options. All provider fixtures deny external network egress.
- Existing invoice/GST, agent assignment SMS and WhatsApp error-handling suites.

Live provider credential validation is read-only. No production phone call, payment or agent identity verification is performed during development.
