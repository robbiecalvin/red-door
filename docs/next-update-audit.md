# Badehaus X next update audit

| Workstream | Existing implementation | Remaining work |
| --- | --- | --- |
| Email accounts and notifications | Resend HTTPS or SMTP transport, verification and recovery, referral-event emails, campaign sends, and owner summaries. The first update adds shared HTML and plain-text templates and an optional verified Priority sender. | Configure the remaining sender roles and inbound routing. Add missing event triggers, a durable transactional outbox, retries, and delivery monitoring. |
| Priority and EMT payouts | Invitation-code activation, personal referral codes, Stripe-confirmed credits, refund handling, and administrator review and recording of completed external payouts. | Add private EMT contact management and approved access controls, toolbar counters, third-Friday reporting, and a reconciled Sheets sync. Confirm counter definitions, cutoff, and chargeback rules before rollout. |
| Newsletter | Registration and settings opt-in, unsubscribe, segmentation, campaign scheduling, and SMTP acceptance reporting. | Confirm the publication weekday and whether aggregate signups can be published. Add data-driven weekly drafts and approval. |
| The Backroom | Existing member profile, role, and moderation primitives. | Confirm domain and reader eligibility. Build drafts, review, publication, and article pages. Prepare the launch manuscripts for editorial approval. |
| After Dark | Existing account age checks, Plus entitlements, and report and block infrastructure. | Confirm reader access and moderation timing. Build story submissions, likes, and moderation and verify provider eligibility. |
| Social | Existing analytics for registration, conversations, and Plus conversion. | Draft the four-week calendar, channel-specific copy, briefs, and imagery for approval. |
| Legal | Draft Terms and Privacy Policy plus configurable versioned acceptance. | Confirm operator details and review the community, moderation, payments, referral, newsletter, and user-content policies. Confirm which surfaces the rates and links rule covers. |
| Admin and rollout | Existing Growth, payment, safety, and launch diagnostics. | Add EMT and editorial administration, then reconcile staged payment and email evidence. |

The template pass uses current email triggers and their existing opt-in and delivery flags. HTML-escapes interpolated content and retains plain-text alternatives. Configure `PRIORITY_EMAIL_FROM` only after verifying the address with the email provider. Existing Priority notifications otherwise use the transactional sender. Marketing retains its existing sender, consent and unsubscribe headers. No schema migration or new dependency is needed for this pass.

## Confirmed decisions

- Newsletter publication is Tuesday morning. The exact Vancouver send time and scope of signup statistics are still open.
- Priority shows lifetime and current-month referrals, current-month earnings and the unpaid balance. The app groups months in Vancouver time. Outstanding credits carry forward in the display until paid or adjusted. Manual payouts are planned for the third Friday, with cutoff and chargeback treatment still to confirm.
- The Backroom URL is `https://badehausx.com/thebackroom`. The working interpretation is that published articles can be read by anyone, with the contribution workflow reserved for Priority members.
- Everyone can read After Dark under the platform's applicable age rules. Story review timing and extras are still open.
- Keep individuals unnamed in public material. The public business or legal entity identity and support or privacy contact still need confirmation.
