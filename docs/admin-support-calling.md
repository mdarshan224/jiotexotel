# Admin customer calling

Open Admin → Call Customers (/admin/calls). Search by customer name or mobile number, select an active customer, enter a support/team member's Indian mobile number, and press Call customer. The entered team mobile rings first; when answered, Exotel connects the selected customer's registered mobile through the configured business virtual number. This workflow does not require a pickup order.

The customer selection and team mobile are shown together before the administrator starts the call. No browser-supplied destination phone or initiating-user identity is trusted. The server retrieves the selected customer's phone from their account and records the authenticated administrator. Customer and agent sessions cannot use these endpoints. Pending-deletion accounts, the review login number, invalid numbers and identical caller/recipient numbers are rejected.

Support calls use the existing enabled Exotel account, configured virtual number, 600-second duration cap, 25-second ringing timeout, recording-off setting and server-verified provider status. The current Exotel keys, runtime settings, incoming flow and order-specific customer/agent calling rules are preserved.

The last 50 support calls show the customer, initiating administrator, time, team mobile's last four digits, status and duration. Check status refreshes the known SID from Exotel. The form polls its latest active call. Customer search returns up to 20 matches and supports mobile-number prefixes; the registered customer phone is used regardless of extra fields in a browser request.

A separate additive SupportCall table records the customer and initiating administrator, a keyed team-phone digest and last four digits, idempotency key, provider SID, state, duration and times. The full entered team phone is not stored in this table. Records cascade when the customer or initiating user is erased. Customer-facing calling endpoints cannot retrieve admin call records.

Duplicate attempt IDs return the original call result. Changing a customer or team number under the same attempt is rejected. Active or uncertain calls block overlapping calls to the same customer or from the same team mobile for 11 minutes; recent attempts have a 45-second cooldown. Limits are 20 attempts per initiating admin per hour and 5 per customer per hour. The provider POST is not retried automatically after an uncertain result. Administrators may check the Exotel dashboard when a provider SID could not be confirmed.

Support callbacks use a different HMAC namespace and scope from pickup callbacks. Callback body fields cannot set call status; the server fetches authoritative details for the stored provider SID. Terminal states cannot be overwritten by stale active polls.

Verification: 206 offline tests passed across 25 suites; TypeScript no-emit and database integration checks passed. New tests cover caller/recipient order, selected-customer lookup, admin-only access, CSRF rejection, changed-payload replay, duplicate and concurrent claims, busy team-mobile protection, rate limits, unknown outcomes, callback scope isolation, customer-data erasure and no leakage of raw team numbers in call records. No chargeable calls or customer-record edits were performed for QA. Ringing/audio and a real admin call remain live acceptance checks.
