# Exotel setup for Junk It Out

## What this release provides

Order-specific customer ↔ agent calls using Exotel's Connect Two Numbers API. The registered mobile of the person tapping Call rings first; after they answer, Exotel dials the other participant. CallerId is the configured business virtual number. No Exotel agent/co-worker provisioning is needed for this V1 API; V3 CCM is a separate product setup.

Existing direct call links remain available while EXOTEL_ENABLED is absent/false. When enabled, bridge calls require complete configuration. This release does not remove every phone number from pre-existing order APIs or screens and is not a full personal-data masking retrofit.

## Private settings to add

Get Account SID, API Key and API Token from Exotel Dashboard → Settings → API Settings. Enter them into Site environment settings as EXOTEL_ACCOUNT_SID, EXOTEL_API_KEY and EXOTEL_API_TOKEN. Enter your purchased virtual number in EXOTEL_CALLER_ID, including its area code in the format Exotel lists. EXOTEL_HOST is api.in.exotel.com for Mumbai or api.exotel.com for Singapore; use your account's actual region, not the customer's location.

Keep EXOTEL_ENABLED=false initially. Open /admin/integrations/exotel and use Check account connection. This makes only an authenticated balance read and cannot certify ownership, outbound eligibility, or caller ID activation. Complete Exotel's account activation and calling prerequisites, then set EXOTEL_ENABLED=true. Start with an authorized test pickup and consenting test participants before customer rollout. The review login 9876543210 cannot place real phone calls.

No account credentials were provided during implementation. Exotel calls and credits remain unverified until setup is complete. Existing runtime secrets were not changed. No chargeable calls were made for QA.

## Call controls

The backend obtains participants from the authenticated order; the browser cannot choose arbitrary numbers. Only the owning customer/currently assigned agent can initiate calls, and only during supported active pickup stages. Staff cannot use this endpoint as an arbitrary dialler. CSRF origin checks apply. Duplicate attempt IDs replay the existing result. A claim is committed before contacting Exotel, using the existing atomic D1 adapter. The provider POST is never automatically retried.

A call has a 600-second maximum duration and 25-second ring timeout. Repeated attempts wait at least 45 seconds; active or uncertain requests are held for 11 minutes. A caller is limited to 5 attempts/hour and an order to 10/hour. Unknown provider outcomes remain UNKNOWN and require checking the Exotel dashboard if no SID was returned. A caller can explicitly start another attempt after the hold expires; no automatic redial occurs.

Recording is enabled for all new pickup and admin support bridges. Older calls cannot be recorded retrospectively. The new VoiceCall table stores order/caller references, provider SID, status, duration and times, rather than additional copies of phone numbers or recording URLs. Records cascade when the order or caller is deleted, including the existing customer deletion workflow.

## Status callbacks

The application sends a per-call HMAC-protected StatusCallback URL automatically. Do not manually copy a token into Exotel settings. The callback verifies its capability and fetches the stored Call SID using authenticated Exotel Call Details; it ignores caller-supplied status/SID fields. Signed URLs must not be shared or pasted into logs. The client can check status independently if a callback is delayed. Completed states cannot be overwritten by a stale active poll. JWT_SECRET rotation invalidates outstanding callback capabilities, so use status reconciliation for those calls.

## Incoming calls to the virtual number

This requires a flow attached to the ExoPhone inside Exotel. Suggested initial support flow: greeting → Connect applet → confirmed support team's number(s), with a no-answer message and working-hours rules. The app does not attach this flow or choose staff destination numbers. The pickup callback endpoint is not an inbound-call router. Tell the implementer the desired support destination and hours before enabling inbound routing. Startup-credit eligibility and call pricing must be checked in your actual Exotel account.

## Verification

Automated tests use local fixtures and mocked provider calls. They verify form-encoded V1 requests, registered-number normalization, region host allowlisting, credential redaction, recording-off defaults, callback capability/authoritative reads, order ownership and lifecycle restrictions, attempt deduplication, limits, unknown outcomes, and call-record cascades. No production calls or credits were used. Native phone ringing, voice quality, number display, Exotel account activation and incoming support routing remain live setup checks.

References:
- https://developer.exotel.com/docs/voice-v1/api-reference/connect-two-numbers
- https://developer.exotel.com/docs/voice-api/getting-started/authentication
- https://developer.exotel.com/docs/voice-v1/api-reference/status-callback
- https://developer.exotel.com/docs/voice-v1/api-reference/call-details
- https://developer.exotel.com/docs/voice-v1/api-reference/incoming-call

Release validation: 186 tests passed across 23 offline suites; TypeScript no-emit check passed. The local database integration suite also passed transaction rollback, concurrent wallet guards, stale-snapshot prevention and atomic ledger tests with the additive VoiceCall schema installed.

Account activation follow-up: read-only live checks confirmed API authorization, available credit, and that the supplied virtual number is present with voice capability. An existing incoming flow was detected and left unchanged. The connection check now supports the account's older Balance.Amount response as well as Account.BalanceData. No phone calls were placed. Updated validation: 191 offline tests passed, with TypeScript checks passing.

Admin support calls are now available at /admin/calls independently of pickup orders. Admins select an active customer and enter the team mobile to ring first. See admin-support-calling.md for limits, audit history, privacy and verification details. This is a separate admin-only workflow; the pickup endpoints continue to reject staff callers.
