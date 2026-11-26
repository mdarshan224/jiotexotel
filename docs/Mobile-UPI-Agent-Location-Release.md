# Mobile UPI and Bengaluru agent presence

Released 23 November 2026, India time.

**UPI correction, 26 November 2026:** Removed the intent-only custom payment block and disabled-default-method preference after they made UPI disappear on unsupported intent platforms. Mobile checkout now uses Razorpay’s documented standard migration configuration: hide only Collect and let Razorpay select supported Intent/QR methods. The original release description below is historical for the mobile payment block; this correction supersedes it. Desktop customer pages now include the provided iOS and Android download links.

## Customer payments

All booking, retry, subscription and wallet top-up entry points continue using Razorpay Standard Checkout and the authenticated customer's prefilled mobile number. No payment credentials are included in this source package.

Mobile checkout now explicitly configures UPI Intent (`flows: ['intent']`) and excludes Collect. Its standard Razorpay payment block also retains cards, wallets and netbanking; default blocks cannot reintroduce the UPI-ID field. Detection covers Android, iPhone/iPad and the mobile layout even with a custom or desktop user agent. Android WebView identification retains `webview_intent: true`. Desktop layout and checkout remain unchanged.

Sources: [Razorpay migration](https://razorpay.com/docs/announcements/upi-collect-migration/standard-integration), [instrument configuration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/configure-payment-methods/understand-configuration), [WebView integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/webview).

A physical Android/iOS device must still verify the external UPI app switch and return to checkout. A website-to-app wrapper must allow supported payment deep links or use Razorpay's native SDK. Standard Checkout's simulated test-mode UPI-ID entry does not prove real UPI Intent support; device acceptance must use a live merchant checkout. No live charges or calls were initiated for QA.

## Agent online permission and tracking

- Going online requires precise device location with accuracy of 100 metres or better, captured within 30 seconds. Out-of-range, stale, future, replayed or implausible jumps are rejected.
- Conservative Bengaluru operating bounds are combined with Google Geocoding's `locality` result, including India country confirmation. An address, city name or district supplied by the device is never accepted as locality proof.
- Google Geocoding must be enabled for the existing server-side `GOOGLE_MAPS_API_KEY`. City verification fails closed on missing credentials, restrictions or provider errors. A city proof is reused for at most two minutes and within 250 metres of its verified coordinate.
- Precise location stays on while online, including while waiting without an order. A fresh heartbeat is requested every 20 seconds; the server's eligibility lease is 90 seconds. The UI goes offline after 60 seconds without a successful refresh, location permission denial, or a rejected location. Closing/backgrounding a browser can stop updates; the server excludes stale agents automatically.
- Going offline or logging out clears eligibility. Existing pickup assignments are retained. Idle location is stored as one current point; active pickup history remains scoped to its assigned order.

## Nearest pickup routing

Only available, identity-approved, service-area-eligible agents with fresh Bengaluru presence and no active pickup are considered. Distance uses current GPS and the pickup coordinate; equal-distance ties use agent ID. Open-order lists, detail access and accept requests all enforce the nearest eligible agent. Acceptance recalculates eligibility in the same atomic transaction that assigns the order, retaining payment and assignment-deadline checks. Explicit admin assignments require fresh verified presence and no other active pickup.

Dispatch targets one recipient. Notification keys include order and agent, preventing duplicate delivery while allowing recovery when a previous recipient becomes stale or unavailable. Idle heartbeats also retry pending dispatch. A previously notified agent does not permanently reserve the pickup; the currently nearest eligible agent is authoritative. Existing 30-minute assignment/refund rules, pickup OTP and earnings logic remain intact.

## Device integrity limitation and native work still needed

Browser geolocation and JavaScript are not trusted hardware attestation. These checks **cannot guarantee** that coordinates are physical or block every fake-GPS tool, rooted device or developer-mode device. Reported mock/developer flags are rejected, but a negative flag is not treated as proof. No user-agent/package-name check or JavaScript boolean is claimed to solve this.

The supplied mobile ZIP contains website code and no Android/iOS native project. Complete native enforcement requires the actual app source or builder:

1. Android: trusted native location via Fused Location Provider, reject `Location.isMock()`, enforce the developer-options policy natively, and use Play Integrity Standard requests with a server-verified nonce/request hash bound to the signed-in agent, fresh GPS payload and availability action. Validate package `com.junkitout.myapplication`, production signing certificate, recognized build, device integrity and replay protection on the server. Reject failed/unavailable attestation for strict native-only agent access.
2. iOS: App Attest/DeviceCheck, native precise location and available simulated-location indicators, verified server-side and bound to the request. iOS has no equivalent universal guarantee against every location-spoofing method.
3. Background agent tracking: native background location/service configuration, explicit platform permissions and app-store declarations. Browser timers are not reliable background tracking.
4. Android UPI: supported HTTPS checkout plus allowlisted UPI/intent scheme handoff through the native WebView bridge, or Razorpay's Android SDK. Handle missing apps and payment return safely; do not trust client payment success without existing server verification.

Native attestation is not enabled by this website release. It needs app signing/Play/App Attest configuration and cannot be fabricated from the website alone.

## Exotel

Only the virtual/caller number changes to **08047291777**. The recorded direct two-number bridge is preserved. Experimental dynamic incoming routing and custom greeting flow remain paused.

## Deployment and validation

Additive migration `0008_agent_location_presence` adds nullable GPS proof fields. No old/default coordinate is backfilled as trusted presence. Existing agents must grant location again. Source includes real SQLite transaction/API tests, mobile checkout configuration tests and the existing financial, privacy, account, subscription, OTP and Exotel regression suites. No customer records or provider financial state were altered for QA.
