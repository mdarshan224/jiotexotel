# Junk It Out mobile web application

The customer experience uses a mobile app shell with persistent cart actions, Razorpay Standard Checkout, information and policy links in Account, and home-screen installation metadata. Desktop presentation is retained.

## Payment integration

Booking, outstanding-order payments, wallet top-ups and subscription payments use Razorpay Standard Checkout (`checkout.js`). Razorpay owns payment-method selection, card entry, UPI QR/intent and authentication UI. The custom payment form and SDK have been removed. Existing server-created orders and verification endpoints retain signature, ownership, amount, currency and capture checks. Completion uses the handler flow without a custom callback redirect. Wallet payment remains a separate internal balance option.

No live charge is performed by the automated tests. Validate actual success, bank authentication, cancellation, pending status and webhook reconciliation using the merchant's Razorpay test/live configuration before claiming live payment certification.

## Mobile installation and offline behavior

The manifest supports standalone installation through the browser's Add to Home Screen command. The Account page shows an installation button when the browser supplies an install prompt. This source is a web application; it is not a signed Android APK or iOS binary.

The service worker keeps only the public offline page and logo. It never caches account HTML, API responses, OTPs, wallet balances or payment confirmations. All navigation remains network-first; failed offline navigation displays a connection message and prompts customers to check payment status after reconnecting.

## Hosting

Publish through ChatGPT Sites with its existing database/storage bindings. Configure secrets in the Site's environment settings. Source archives deliberately exclude real environment files, credentials, dependency folders, build caches and local database state.

## Payment method and customer contact update — 8 November 2026

- Razorpay Standard Checkout receives the authenticated customer's current +91 mobile number across booking, order retries, top-ups, and subscription payments. Contact entry is hidden/read-only; no fake customer email is generated.
- UPI, cards, wallets and netbanking can be selected before opening checkout. Razorpay displays only the selected enabled method. Junk It Out balance remains a separate payment option.
- The static login number 9876543210 is rejected by Razorpay's contact validation in browser testing. It now gets an actionable message instead of an unusable checkout. Static login itself remains unchanged; real payments require a real-number login.
- Shortened wallet/subscription gateway receipt references to Razorpay's 40-character limit.
- Wallet top-up retries now include the public checkout key, reject completed/failed/mismatched attempts, and accept valid decimal currency amounts without floating-point false rejections.
- Payment setup errors, expired sessions, cancellation, duplicate opening and verification failures retain recoverable UI feedback.
- Validation: automated payment/profile/pricing/retry checks, TypeScript and production build. Native Razorpay UPI-only and card-only screens inspected without a charge. Payment settlement and bank authentication were not exercised.

## Centered dialogs and review sandbox — 8 November 2026
- Login, location, address, order confirmations, agent and admin modal dialogs now render into a shared body portal, centered independently of transformed page containers.
- Visual viewport sizing follows mobile keyboard changes; safe-area padding, scrollable panels, focus containment and background scroll locking keep forms usable on short screens. Mobile modal inputs use 16px text to avoid iOS focus zoom.
- Razorpay runtime credentials switched to the supplied test pair (stored as secrets outside source).
- The static review login retains 9876543210 / 563130. Under test keys only, its checkout contact uses the sandbox number 9000090000; real customer contact details are unchanged. Live checkout does not use this substitution.
- 72 automated checks pass. Browser verified centered login/dismissal and native Razorpay test checkout opening without contact re-entry. No payment charged. Native iOS device/TestFlight validation remains necessary before submission.

- Deployment blocker for payments: supplied test key/secret returned HTTP 401 Unauthorized from the Razorpay Orders API. Test public checkout UI opens, but server authentication requires corrected credentials; no claim of end-to-end payment readiness.

## Standard Razorpay checkout only — 8 November 2026
- Removed the portal's UPI/card/wallet/netbanking selector from booking, payment retry and wallet/subscription flows. Pay online opens unrestricted Razorpay Standard Checkout directly.
- Replaced runtime Razorpay keys with the latest supplied test pair; authenticated read against Razorpay Orders API returned HTTP 200. No charge made.
- Removed live-key placeholders from settings and tests and checkout credentials from local environment files. Customer mobile prefill and centered login fixes retained.
- Validation: 72 automated checks, TypeScript and production build.

## Persistent browser cart — 8 November 2026
- Cart now persists in localStorage across reloads, browser restarts and navigation for guests and signed-in customers on both layouts.
- Existing session carts migrate automatically; booking restores saved items without requiring a cart query parameter.
- Cart drawer, navigation count, mobile bar and booking selection refresh on browser back/forward restoration and cross-tab storage changes.
- Explicit removal and successful-booking clearing persist; storage restrictions retain a usable in-memory cart.
- Validation: 77 tests including persistence, migration, authentication events, clearing, back navigation, tab updates and blocked storage; TypeScript and production build.

## Android UPI Intent correction — 21 November 2026
- Android checkout hides Razorpay's UPI Collect (manual UPI ID) flow using its documented display.hide configuration, allowing Standard Checkout to offer supported Intent/QR flows.
- Android WebViews additionally pass webview_intent:true. Existing iOS and desktop checkout options remain unchanged.
- Applies through the shared checkout adapter to bookings, payment retries, wallet recharges and subscriptions; server signature verification is unchanged.
- Android app source is absent from this repository. The app must handle Razorpay's UPI deep links in its WebViewClient (or native SDK); website configuration cannot supply missing native intent handling. Real Android app/UPI handoff must be validated on a physical device; no live charge made here.
