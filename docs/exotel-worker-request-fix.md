# Exotel request compatibility fix

A production POST /api/admin/voice/calls returned HTTP 503 after roughly one second. Its SupportCall record was UNKNOWN without a provider SID, and the authenticated provider's outbound-call list was empty.

The exact Exotel request options were reproduced using the deployment's Workerd compatibility date and nodejs_compat flag. The Worker rejected redirect: 'error' with a TypeError before making a network request: only 'follow' or 'manual' are implemented at the edge. This option in the integration caused the generic unconfirmed-call message.

Exotel requests now use redirect: 'manual' and reject all 3xx responses explicitly. They never follow redirects with account credentials. Sanitized transport/redirect diagnostics contain only method, error type, or HTTP status; no authorization header, phone number, callback token or response body is logged.

A one-time data migration releases the pre-fix UNKNOWN attempts without provider SIDs as FAILED. All attempts with provider SIDs are preserved. Before this version, the invalid fetch option made it impossible for these app requests to reach Exotel. The migration does not initiate or retry any call. Normal protections for genuinely uncertain outcomes remain unchanged after deployment.

Verification: 208 offline regression tests and TypeScript checks passed. A new integration script bundles the real Exotel module and executes it in Workerd, testing balance GET, bridge POST and redirect rejection against a separate local fixture Worker; all network egress from the fixture Worker is denied. No chargeable calls are used in that test.

Automatic approval review rejected a validation request to the live call-creation endpoint due to possible chargeable-call risk. It was not retried or bypassed. The fix was established with local runtime diagnostics and mocked provider responses instead. Live ringing/audio remain an acceptance check for the operator.
