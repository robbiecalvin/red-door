# Reliability batch validation — November 14, 2026

## Passed

- `npm run typecheck`.
- `npm test`: **25 suites, 266 tests passed**, including the existing coverage gates. No snapshots or zero-test success claims.
- The full suite includes `apiSmoke.test.ts`, which runs the actual backend over HTTP/WebSocket in a temporary filesystem with a localhost Stripe fixture. It covers registration/age/profile validation, admin authorization, direct and realtime messages, blocks, 72-hour Cruise retention, authorized media uploads, private media sharing/revocation, checkout, unpaid invoices, signed webhook activation/replay, failure/cancellation/expiry, sandbox separation, launch grants, metrics opt-out, recovery-unavailable behavior and reset/session/JWT revocation.
- Browser checks against an isolated real backend: optional-consent registration, profile setup, privacy preference update, administrator dashboard at 390px and 1440px, password reset from a URL fragment (including navigation in an already-open app). No JavaScript page errors occurred. Phone screenshots are saved as task artifacts.
- `npm run build` completed. Existing large-bundle warning remains.
- `git diff --check`.

## Failed / not verified

- `npm audit --omit=dev --audit-level=high`: **failed** with 32 affected production packages (25 moderate, 4 high, 3 critical). High/critical affected dependency entries include body-parser, express, fast-xml-parser, maplibre-gl, nodemailer, path-to-regexp and proxy-addr. These advisories were present before this batch; dependency manifests/lockfile versions were not changed. A focused dependency update and compatibility check remains in phase 2. Do not report the complete CI pipeline as green while its audit gate fails.
- Actual Stripe test-mode checkout, real webhook delivery, live payment, portal cancellation and SMTP delivery were **not** performed. The cloud workspace's enforced egress policy blocks the deployed app and API, and no Stripe/SMTP credentials are injected here. This does not establish that Render is misconfigured. See the execution roadmap for the remaining production gate.
- PostgreSQL/S3-specific paths were updated but not validated against external PostgreSQL/S3 services in this task. Local JSON/object storage was exercised end to end.
- New-task snapshot restoration, publication of cloud environment settings, and completion of remote GitHub/Render deployment are not established by local tests.

## Release effects and scope

- Cruise messages older than 72 hours are expired and purged according to the published policy, including messages previously persisted with the incorrect one-year expiry. This is a deliberate retention correction.
- Private chat/media access rechecks participants, blocks, expiry and current sessions. S3 URLs already issued can remain usable for at most 60 seconds.
- Previously issued JWT-only realtime credentials without a session binding require a new sign-in; current browser session-token authentication remains supported.
- Existing explicitly stored administrator roles remain valid. New promotions require email verification.
- Account recovery is unavailable until SMTP and an HTTPS PUBLIC_APP_URL are configured; it does not pretend to send a reset email when delivery is unconfigured.
- Metrics are a single-writer baseline. Individual activity requires opt-in; the dashboard makes cohort/retention limits explicit. Counts are not an accounting ledger.
- Later product phases—moderation workflows, onboarding/interests, proper group rooms, notifications/installability and local-community rollout—have not been represented as completed. Follow `execution-roadmap.md`.
