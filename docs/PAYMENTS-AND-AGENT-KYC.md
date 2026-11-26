# Junk It Out — payments, weight adjustments and agent verification

Production origin: https://junkitout.in

## Razorpay Dashboard setup

Add webhook URL: **https://junkitout.in/api/payments/webhook**

Use the same signing secret as the Site's `RAZORPAY_WEBHOOK_SECRET` runtime setting. The webhook secret is separate from the API key secret. Never put either secret in frontend code. Preserve the existing live credentials.

Enable:
- `payment.authorized`
- `payment.captured`
- `payment.failed`
- `order.paid`
- `refund.created`
- `refund.processed`
- `refund.failed`
- `qr_code.credited`

Use automatic capture. Enable UPI and UPI QR on the merchant account. Merchant availability, bank outages and native WebView UPI-intent support remain provider/app dependent. Checkout remains Razorpay Standard Checkout with the signed-in customer's mobile prefilled.

Admin → Payment & KYC Setup shows configuration presence, mode, endpoint and events without displaying credentials. The Razorpay connector available in ChatGPT is read-only; dashboard webhook changes must be made by the merchant.

Recharges and prepaid subscriptions now fulfill from signed webhooks as well as checkout callbacks. Amount, currency, local gateway order and authenticated provider proof must match. Duplicate delivery is idempotent. Subscription purchases preserve their original offer duration and pickup count. These subscriptions are prepaid purchases/renewals; no auto-debit mandate is created.

## Refund policy and scheduled requests

Normal booking refunds, unassigned-pickup refunds and lower-weight differences are credited to the customer's wallet. Paid customer/agent cancellation endpoints remain blocked. Wallet-origin refunds restore original principal/bonus allocations and bonus expiry rather than converting promotional funds into paid funds.

For a scheduled pickup, a customer can request a reviewed refund more than one hour before scheduled start, before service begins. The request pauses dispatch. Admin → Scheduled Refunds allows approval or decline. Approval returns an online booking payment to its original account; wallet bookings return to wallet. Decline restores the prior pickup status. The server checks eligibility using the original request timestamp, so an eligible request can still be reviewed after the cutoff.

Previously submitted source refunds are reconciled with provider evidence; they are never silently reissued as wallet refunds. Uncertain provider submissions are held for reconciliation before another payment/refund request. Keep existing job schedules unchanged.

## Doorstep weight flow

1. Assigned approved agent marks arrival and verifies the customer-only pickup OTP.
2. Agent records every booked item's actual weight and reviews the bill.
3. Original booking price/offer stays fixed. Only actual minus estimated weight at saved per-kg rates is applied, in integer paise. Each item may be zero if total collected weight is positive.
4. Lower amount is returned to wallet atomically with successful pickup completion.
5. Higher amount can be paid through an order-bound fixed single-use merchant UPI QR shown to the agent, or through the customer's pickup tracker using Standard Checkout or wallet.
6. The server verifies provider payment ownership, amount and currency before allowing completion. A later second successful payment is returned to wallet once, without refunding the original booking twice.

Weight corrections are allowed before any gateway request. After gateway/QR issuance the bill is locked to prevent payment mismatch. Uncertain QR creation is looked up by its stable adjustment metadata rather than blindly creating another. If the QR expires, use the customer's Pay online option and check status before paying again. Do not collect to personal agent UPI accounts.

## Cashfree Secure ID onboarding

Runtime settings: `CASHFREE_SECURE_ID_CLIENT_ID`, `CASHFREE_SECURE_ID_CLIENT_SECRET`, `CASHFREE_SECURE_ID_PUBLIC_KEY`, `CASHFREE_SECURE_ID_MODE` (`production` or `sandbox`). Use Public Key authentication and the merchant's PEM key. Existing runtime secrets are preserved.

Enable these Cashfree verification products: DigiLocker Aadhaar, PAN, bank account synchronous verification, IFSC, driving licence, vehicle RC and name matching. Aadhaar uses DigiLocker consent; no discontinued offline Aadhaar OTP endpoint is used.

Agents complete `/agent/onboarding` before business API/dashboard access. Legacy Aadhaar-only approvals do not satisfy the new six-check requirement. Matching valid records approve automatically. Names, DOB, document validity and vehicle/licence compatibility are checked; incomplete, unavailable or ambiguous evidence remains offline for operations review. Commercial vehicle class/transport eligibility can require manual review when provider evidence is insufficient.

RC owner differences against Aadhaar/PAN require both RC front and back photos. Photos are private, restricted to the owning agent and administrators, with admin document access audited. Only masked identity/account identifiers, verification references and relevant status/name/DOB/vehicle metadata are retained; raw Aadhaar XML/photos and full PAN/bank/DL numbers are not saved. Provider inputs are fingerprinted with a server HMAC for safe retry handling.

Admin → Agent Verification displays all six checks, differences, private RC images and review actions. Manual approval requires all six valid provider checks (including valid-but-mismatching documents), required photos, a review note and explicit acknowledgement. Provider-invalid documents cannot be manually marked valid. Operations can allow re-verification of unresolved/mismatched checks after reviewing provider status; all decisions are audited.

No paid live identity verification, financial charge or real refund is performed as deployment QA. Complete one consented onboarding and a merchant-approved low-value live payment after enabling provider products/webhooks to confirm account-specific entitlements.

## Validation

The regression suite uses local SQLite/D1 transactions and mocked providers, covering exact weight pricing, wallet allocation restoration, blocked unpaid excess completion, duplicate QR/checkout payment handling, callback-free recharge/subscription fulfillment, webhook signatures, scheduled refund boundaries and strict KYC API gates. Migration 0009 is additive; it preserves existing tables and marks already-submitted source refunds for continued reconciliation.
