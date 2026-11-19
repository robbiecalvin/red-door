# Badehaus X execution roadmap

Updated November 14, 2026. This tracks the six-phase product plan agreed in chat. Work uses the existing checkout; no PLANS.md workflow was invoked.

## Batch 1 — reliability and baseline measurement

Implemented and locally validated:

- Real HTTP smoke tests launch an isolated backend in a temporary directory, with a local Stripe fixture. No real payment methods, Stripe credentials or customer accounts are used.
- Covered price readiness, unauthenticated/admin boundaries, registration/age/profile rules, direct messages, blocking, private chat recipients, upload authorization, private album sharing/revocation, checkout, signed webhooks, payment replay, unpaid invoices, failed renewal, cancellation, expired access, launch grants, privacy opt-out and password reset/session revocation.
- Paid access now requires an active subscription **and a confirmed paid latest invoice**. An open invoice or `invoice.payment_failed` event cannot grant another period. Archived prices remain valid for existing paid subscriptions; they remain unavailable for new Checkout purchases.
- Cruise messages now expire after 72 hours in the running server, correcting its previous one-year configuration. Cleanup also applies the current policy to persisted messages carrying an older, overly long expiry. Message reads enforce expiry immediately; background cleanup runs hourly.
- Local/PostgreSQL uploads require one-time authorization tickets issued after authenticated initiation. Raw private/chat downloads are blocked. Chat download links check conversation participation, blocks, session validity and message expiry; S3 redirects have a maximum 60-second authorization window.
- Realtime private messages and call signals are filtered to their participants. WebSocket authentication is refreshed against the current session. Login JWTs bind to that session, so reset/revocation/expiry applies to realtime access too. Legacy JWT-only clients without session binding must sign in again.
- The verification endpoint no longer issues passwordless sessions for already-verified emails. Verification codes have a five-attempt limit per 15-minute window, including across resend requests.
- Password recovery uses a hashed, single-use 256-bit link with a 15-minute expiry and a one-minute per-email request cooldown. New passwords require at least 10 characters with uppercase, lowercase, number and symbol. Successful reset revokes all existing sessions. The reset token is carried in the URL fragment and removed from browser history after capture. Delivery requires configured SMTP and an HTTPS PUBLIC_APP_URL; there is no console-token fallback.
- New or newly promoted administrator accounts require a code delivered to their configured email address. A phone supplied during signup cannot prove ownership of an administrator email. Existing explicitly stored administrator roles remain valid. Verification codes are no longer logged as a delivery fallback.
- Optional usage measurement is off by default for individual activity. Registration includes an unchecked consent option; settings can change it or delete the individual measurement record. There are no third-party analytics scripts, tracking cookies, message bodies, photo contents or coordinates in the analytics store.
- An administrator activity dashboard is accessible from the account menu. It includes registrations, checkout starts, confirmed paid periods, payment failures, conversation replies and separate free/launch/paid/other-Plus cohorts. It also includes opt-in profile/message activation and seven-day return measurements. Stripe sandbox payments are separated from live payment/conversion counts.

**Batch 1's production completion gate remains open.** The cloud task cannot reach the deployed app/API under its current enforced network policy, and production Stripe/SMTP credentials are not injected into this task. This is not evidence that Render is misconfigured. Actual Stripe test-mode checkout, real webhook delivery, customer-portal cancellation and recovery-email delivery must still be verified against the deployed backend. PostgreSQL/S3-specific deployment paths were updated but were not exercised against real external services in this task.

## Next: phase 2 — trust and moderation

- Complete the live billing and email checks above before calling the release payment-ready.
- Audit anonymous public identifiers: public guest presence/chat keys must not expose authentication credentials. This is a priority before broader community promotion.
- Persist report records and add a moderation queue with review status, assigned ownership and resolution timestamps.
- Define a report-response process and escalation route.
- Review the full location/media/session model, retention jobs, SMTP delivery and sensitive logging.
- Address existing production dependency audit findings in a focused dependency-update release.
- Audit the single-instance persistence model before scaling to multiple backend instances.

## Phase 3 — first five minutes

- Streamline required profile setup and permission explanations.
- Add interest tags, connection preferences and optional conversation prompts.
- Improve empty discovery states with a wider area and relevant groups.
- Use the newly measured opt-in activation baseline to choose a concrete improvement target.
- Add relevant upgrade prompts only at paid-feature selections or limits.

## Phase 4 — proper group rooms

- Design named rooms, membership records, invitations, explicit acceptance and removal/leave controls.
- Enforce membership and Plus eligibility server-side; do not implement private rooms as public spot boards.
- Apply global blocking, report controls and the existing Cruise expiry policy.
- Validate unauthorized access, revocation, subscription expiry and message expiry.

## Phase 5 — dependable mobile use

- Add installability and an intentional connection-loss experience.
- Improve loading, retries and delivery feedback across core flows.
- Add opt-in notifications with discreet previews.
- Complete supported-device, slow-network, keyboard, focus-management and reduced-motion checks.
- Make cancellation and promo expiry understandable in the app.

## Phase 6 — focused community launch

User decisions/operations required: select the launch city and initial audience, recruit founding members, establish local partnerships and assign moderation coverage. Implement event/community support once those inputs are available. Review replies, return visits, moderation load and paid conversion weekly. Expand only after the pilot establishes sustained activity and the safety/reliability gates pass.
