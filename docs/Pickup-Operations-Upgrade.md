# Pickup operations upgrade — 23 November 2026

**Exotel rollback:** the previous recorded direct bridge is active with 08047291777. Custom flow URL selection and dynamic incoming routing are paused. The later Exotel setup section is retained for a future integration and is not active.

## Doorstep verification
Customer Track Pickup is the sole surface for the start OTP, after the agent marks arrival. An authenticated customer must own the pickup. Assigned agents enter that code; weighing/completion APIs and admin lifecycle transitions enforce verification in the same transaction. Five wrong attempts lock entry for five minutes. No plaintext expected OTP is stored or broadcast, and no OTP SMS is sent.

## Assignment and refunds
New ASAP bookings get a 30-minute assignment deadline from creation. New scheduled bookings use the selected slot start in Asia/Kolkata plus 30 minutes. Old bookings keep policy version zero; this release does not bulk-cancel historical bookings. Customer/agent cancellation is disabled after placement. Admin operational cancellation remains available.

The authenticated unassigned-refunds job atomically closes due, unassigned requests and restores a reserved subscription pickup once. Captured Razorpay payments receive a durable refund intent using the captured payment amount. Wallet refunds restore their original allocation. A stable refund marker and transactional claim prevent multiple submissions; ambiguous provider outcomes are reconciled against Razorpay refund records, not blindly retried. Bank/provider processing time can exceed job initiation time. An authenticated GET to the job URL provides read-only readiness counts without changing money or pickup records. A separate tiny Cloudflare Worker (`junkitout-refund-timer`, source `ops/refund-timer.mjs`) calls only this job every minute. The app and database remain on Sites. Its encrypted, isolated token is accepted only by this refund job; JWT secrets are not copied to the timer. HTTP requests cannot invoke the timer. Check Cloudflare execution logs and the app payment/refund records for failures. Cron changes can take up to 15 minutes to propagate initially. After propagation, a due pickup is processed at the next minute check; bank/provider completion takes additional time. Opening a tracking page is not a scheduler.

Client verification, payment reconciliation and provider capture webhooks protect the cancellation/late-capture race. The API does not dispatch an expired pickup, and agent acceptance checks the deadline atomically.

## Google tracking
The owning customer receives a Google traffic-aware road route after acceptance, using fresh order-scoped agent GPS. Google Routes API and Maps JavaScript API must be enabled for the configured keys with appropriate billing/restrictions. No current GPS or failed routing produces an unavailable ETA, never an invented travel time. Agent app location permission and active sharing are required; background GPS behavior depends on the installed app container/OS.

## Order-aware support
The authenticated assistant uses sanitized, customer-owned pickup/payment context. OTPs, phone numbers, provider payment IDs and exact addresses are excluded from model context. The assistant cannot perform financial changes. Explicit issue submission creates a retry-safe complaint and an internal admin notification. Existing support tickets are visible in Help & support. AI failure falls back to current account status. Rate limits are durable and keyed to the authenticated account.

## Exotel — JunkItOutProg / 08047291777
Open `/admin/integrations/exotel` while signed in as an administrator. Copy the exact private Primary Dynamic URL and Support Fallback URL displayed there. They include a scoped token; keep the full URLs in Exotel, not in customer/agent app code.

1. In JunkItOutProg use Greeting → Connect → Hangup, attached to 08047291777.
2. Greeting: “Welcome to Junk It Out. Please wait while we connect your call. This call is being recorded.” TTS or 8 kHz mono WAV can be used.
3. Regular Connect / Dial Whom: select numbers returned by URL; paste the Primary URL. It returns HTTP 200, `text/plain`, containing only the current destination in E.164 format, e.g. `+91XXXXXXXXXX`. An unknown, ambiguous or unauthorized relationship returns no destination; an invalid token returns HTTP 403. Disable repeated number-fetching unless your flow requires it.
4. Enable call recording and the callee recording announcement in the regular Connect applet. For Programmable Connect v1.0, the endpoint automatically detects `Exotel-Version: 1.0`, or append `&format=json`. It then returns `application/json` with `fetch_after_attempt:false`, `destination.numbers`, `record:true`, `recording_channels:"dual"`, ringing/conversation limits and callee announcement. Do not use the separate CCM v1.1 response mode.
5. For HTTP failure in the first Connect applet, use the same Primary URL as its optional HTTP fallback. This differs from an unanswered telephone call.
6. For “nobody answers”, add a second Connect applet using the Support Fallback URL. Select an authorized on-call support administrator in the Junk It Out settings page. The server fetches that member’s current registered number; no destination number is hardcoded. Connect the second applet’s no-answer/no-destination paths to an unavailable greeting and Hangup. With no on-call member configured, it returns no destination rather than guessing.
7. Exotel appends `CallSid`; it is required. Caller query fields (`From`, `CallFrom`, `To`, etc.) are not trusted for identity. The server independently reads the call from the configured Exotel account and validates caller, account, direction and virtual number. `CustomField` identifies an existing app-started call; its caller and provider SID are revalidated.
8. Calls are recorded against the matching order. More than one active pickup requires the order’s in-app Call button; no “latest order” guessing occurs. Agents receive neither customer numbers nor recording URLs.
9. To make app-initiated calls play this greeting too, save the actual Exotel flow URL (account path ending `/exoml/start_voice/<AppID>`) in settings. The application name alone cannot identify that URL. Until saved, recorded app bridge calling continues.

Phone network delivery, recording availability and audio playback require a real end-to-end call after the dashboard is configured; automated regression tests make no real calls or charges.
