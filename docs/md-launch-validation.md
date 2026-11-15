# MD linking and launch membership validation

Validated locally on November 15, 2026. No production accounts were changed and no real payments were made.

- Full Jest suite: 301 tests across 29 suites pass. API smoke coverage includes signed bridge authentication/tamper/replay checks, account binding, 50-km discovery filtering, hidden provider account IDs, paid-code verification, message idempotence, private WebSocket payload projection, blocks, revocation and key rotation.
- Billing API fixtures exercise explicit consent, Stripe SetupIntent confirmation, January 1 schedule creation, duplicate webhook delivery, cancellation, replay after cancellation and preservation of the fixed complimentary expiry. These fixtures do not establish that the live Stripe account/webhook is configured.
- TypeScript checking and production builds pass. A second build with `DUALMODE_PUBLIC_APP_URL=https://thereddoor.app/` generates the expected CNAME, canonical URL and social image URLs. Default URL remains unchanged until deployment configuration switches it.
- Chromium flow passes at 320, 390, 768 and 1440 pixels without horizontal overflow. Tested the free MD gate, free profile-hiding toggle, account promo redemption, provider tutorial, one-time secret display/hiding, signed provider linking/live state, recurring-consent checkbox, intercepted billing handoff, MD purchase/return fixture, account-bound paid-code unlock, buyer/provider replies and billing reminder on the next explicit login. No browser exceptions observed.
- Fixed root-document hash routing so returning from MD opens the MD tab instead of Explore.

Screenshots are available in the execution workspace under `/workspace/artifacts/md-*.png`. Cross-platform tests use an isolated local MD fixture and Stripe stubs. Actual domain DNS/TLS, hosted Stripe Checkout/webhooks, schedule execution and MD interoperability remain deployment checks described in [deployment instructions](md-launch-deployment.md). The other environment must implement the [MD contract](md-integration-contract.md).
