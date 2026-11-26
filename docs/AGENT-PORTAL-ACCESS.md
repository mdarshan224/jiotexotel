# Partner portal access and signup

The partner portal starts at https://junkitout.in/agent.

## Screen flow

- Logged out: only the centred login/signup screen. No KYC form, wallet, dashboard, pickup data or partner navigation is mounted while the session is unknown or missing. Opening a wallet, KYC or pickup URL directly has the same login gate.
- Signed in, KYC pending: redirected to onboarding. Verification progress and a sign-out action are available; business APIs and navigation stay locked.
- KYC approved: dashboard, assigned pickups, wallet and navigation become available. Existing Cashfree verification and admin review rules still apply.
- Session failure: a reconnect screen replaces protected content. Expired/revoked sessions return to login. Browser restores and auth changes recheck the session.

## Login and signup

Existing partners use their mobile number and OTP. New partners choose Sign up, enter their name and mobile, accept Terms/Privacy Policy, and verify the mobile OTP. New accounts are offline, have no fabricated vehicle registration or trusted GPS location, and require full KYC before taking work. A customer-only or administrative account is never silently converted into a partner account; use a separate mobile number for a new partner profile.

OTP resend cooldown and code autofill are supported. No real OTPs or identity checks are sent during automated tests.

## Session separation

Partner sign-in sets an HTTP-only `jio_agent_token`. Partner API requests select this session explicitly, including native app requests without a Referer. Existing customer and administrator sessions are preserved. Partner sign-out revokes the partner token and stops location presence. User and partner revocation versions are validated separately so repeated login/logout remains usable. Existing legacy partner cookies remain readable and are cleared when the owning partner signs out.

The UI gate supplements existing server-side authorization. Signed-out requests cannot read partner business APIs, and unapproved partners cannot bypass KYC through direct API calls. No database migration or payment configuration change is needed for this release.
