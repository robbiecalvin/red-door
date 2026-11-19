# Badehaus X implementation status

This review maps the November 19 master specification to the repository. A partial status covers the specific features listed in that row. Hosted checks and legal, operational, or provider decisions require separate evidence.

## Phase progress

Each filled segment is one locally verified milestone from the five listed for that phase. Hosted validation has its own milestone.

| Phase | Progress | Verified milestones | Remaining milestones |
| --- | --- | --- | --- |
| 1. Foundation | ■■■■■ 5/5 | Local signup and recovery, profiles and link privacy, Explore and core chat, versioned policy acceptance, hosted signup and email delivery | Approve and activate policy documents |
| 2. Core features | ■■■■■ 5/5 | Right Now, Postings, Private Groups, three-member text DMs, Live broadcasting beta | Hosted Live rollout |
| 3. Membership | ■■■■■ 5/5 | Standard Plus, public flyer promotion, Founding Members, Priority Members and placement, Priority referral pricing | Hosted Stripe test-mode checkout and renewal |
| 4. Growth | ■■■■■ 5/5 | Baseline analytics, marketing consent and unsubscribe, referrals, commission ledger, owner reporting | Hosted email and Stripe verification, payout policy |
| 5. Launch | ■□□□□ 1/5 | Local QA | Hosted and physical-device QA, legal review, operating procedures, launch |

| Specification | Status | Current evidence and remaining work |
| --- | --- | --- |
| 1. Branding | Partial | `App.tsx` and the discovery styles include the Badehaus X identity and refreshed member UI. Final wordmark, icon, domain, and brand guide need final assets or settings. |
| 2. Registration and authentication | Partial | `App.tsx`, `authService.ts`, and the registration browser check cover separate forms, age declaration, and email ownership. Password recovery exists. Signup supports versioned Terms and Privacy Policy acceptance and separate optional marketing consent. Hosted rollout needs approved policy URLs and a controlled external inbox for verification. |
| 3. Profiles | Partial | `profileService.ts`, `ProfileDetails.tsx`, and `MemberPanels.tsx` support images, details, prompts, preferences, and privacy. Settings contains the editor and replaces the standalone Profile sidebar entry. The legacy profile route still reaches the settings surface. Members can save Instagram and OnlyFans links independently. Links default to hidden and are shown only in eligible signed-in profile views. |
| 4. Discovery | Partial | `Router.tsx`, `MapView.tsx`, and `presenceService.ts` cover the grid, map, filters, approximate location, and blocks. Priority ranking requires eligibility, activity timestamps, a configurable radius, and tests that preserve visibility filters. |
| 5. Messaging | Partial | `chatService.ts`, the WebSocket gateway, and `ChatWindow.tsx` implement core messaging, media, replies, blocks, and read state. Explore and Inbox respect the current session mode for new conversations and Inbox follows existing channel history in Hybrid. Private Gathering discussions have independent history. Inbox supports invite-only, three-member text conversations with independent history, unread counts, and reporting. Group attachments and push notifications remain open. |
| 6. Streaming | Beta | Self-hosted LiveKit supports eligible free and Plus hosts, a Live tab and discovery badge, viewer limits, disconnect cleanup, reports, and admin stop. The beta requires a hosted media server, a cross-network rehearsal, and moderation coverage before activation. See [Live beta](live-beta.md). |
| 7. Right Now | Implemented | `memberService.ts` and `MemberPanels.tsx` support a separate Right Now toggle with a server-set 60-minute expiry, a red lightning badge, and an independent discovery filter. Members can schedule or cancel one upcoming 60-minute window. Future times stay private until activation, and starting immediately replaces the pending window. |
| 8. Groups and postings | Partial | `communityRepository.ts`, `publicPostingsService.ts`, and `CommunityPanel.tsx` cover community data and actions. Public Posting creation requires active Plus. The feed shows available creator photos, headlines, and optional Hosting or Travelling indicators. Private Groups are reachable from Groups. The API requires direct chat history for join requests, honors blocks, and limits addresses and coordinates to hosts and approved attendees. Hosts set a guest limit for new groups. Pending requests serve as the waitlist when full, and the host approves requests when a spot opens. Existing groups with no limit retain their prior behavior. Hosts can set an invitation deadline. The server rejects late acceptance and preserves confirmed attendees and requests already on the waitlist. Older invitations default to the group end time. Hosts can publish up to 12 weekly occurrences, with separate guest lists, approvals, and expiry per date. Each gathering has a separate text discussion for the host and approved attendees, available until the event ends. Open House is a drop-in format within listed hours for approved attendees. Hosts can remove attendees and cancel individual dates. Discussion reports preserve the reported message for review in the admin safety queue. |
| 9. Plus | Partial | `shared/plus.ts`, `subscriptionService.ts`, and `renewalEnrollment.ts` implement Standard Plus, fixed launch grants, and authorized renewal. Founding Members have three complimentary months, a public badge, and a separate C$4.99 monthly price with explicit enrollment. Priority membership grants Plus while approved. Configure the distinct Stripe prices and rehearse hosted billing before enabling sales. |
| 10. Priority Members | Implemented locally | Verified members apply with the invitation code, a completed profile, and a private screenshot. Admins approve or revoke, and members can resign. Discovery placement favors eligible online members before recently active members, respects filters and privacy, and uses the owner-configured radius. Recent activity uses in-memory approximate locations that expire after 24 hours. |
| 11. Promotions and referrals | Partial | The existing launch promotion now accepts `BADEHAUSXONLINE`. Approved Priority Members get personal referral codes. Registration attributes the code and unlocks a separate C$14.99 introductory checkout with C$9.99 monthly renewal. A signed webhook and a paid matching invoice activate the introductory entitlement. The Growth ledger records one commission per buyer, separates sandbox and live activity, and reconciles confirmed introductory refunds. Payouts are recorded after completion outside the app. |
| 12. Email and notifications | Partial | Verification, password recovery, and push handlers exist in `server.ts` and `pushService.ts`. Marketing consent is separate and opt-in at signup and in Settings. The owner can schedule segmented campaigns and read SMTP results. Recipients can unsubscribe without signing in. Hosted sender authentication, bounce handling, and delivery monitoring remain rollout work. |
| 13. Community support and inclusion | Partial | `CommunityPanel.tsx`, `MemberPanels.tsx`, and `reportService.ts` provide community and member safety entry points. Support content and operational coverage still need review. |
| 14. Leo List | Blocked | Public activation requires qualified Canadian legal review. Owner approval of the roadmap is recorded. |
| 15. Safety and privacy | Partial | Age declarations, blocks, reports, profile visibility, and restricted media exist in the auth, block, report, member, and media services. Launch still needs policy, operational, and end-to-end moderation review. |
| 16. Owner administration | Partial | `server.ts` protects admin routes and the app has review and analytics panels. Verify owner-only access for new business controls and audit sensitive actions. |
| 17. Legal readiness | Blocked | Product approval is available. The specified legal review and provider eligibility determinations remain external. |
| 18. Infrastructure | Partial | `postgresCore.ts` initializes schema, PostgreSQL repositories persist core state, and deploy and CI scripts exist. The hosting target and production migration checks depend on deployment decisions. |
| 19. Quality assurance | Partial | Jest, build, production install, and Chromium checks exist. Complete the plan's hosted, physical-device, and load verification before launch. |
| 20. Launch | Partial | `launchReadiness.ts` and the launch runbook cover technical checks. Campaign assets, distribution, and production validation remain open. |
| 21. Reporting | Partial | `analyticsService.ts` and `AdminAnalytics.tsx` support consent-aware engagement and paid conversion metrics. Referral and commission reporting depend on their source data models. |
| 22. Expansion | Needs decision | Later-market expansion, integrations, and AI features remain roadmap items. |

## Foundation changes

- `App.tsx` separates login and registration credential drafts and retains verification as its own form. Profile editing is accessed through Settings.
- `Router.tsx` uses the allowed chat kind for the session and sends Inbox Fire messages in the selected thread's kind. The backend retains its age, mode, and block checks.
- `BillingSettings.tsx` gives the existing billing notice a “Remind me later” action. Its close and Escape behavior use the same dismissal.
- `shared/plus.ts` accepts the flyer code through the existing fixed-window promotion. The grant ends at midnight January 1, 2027 Pacific. Renewal continues to require separately authorized billing.
- The existing Explore, profile, and chat UI changes are part of the workspace baseline for this phase.

The registration support error can be returned by the backend when SMTP configuration is absent. Local tests can verify the delivery path with TLS SMTP fixtures. Diagnosing a hosted report requires that deployment’s configuration and delivery evidence. The verification requirement remains enforced.

## Validation and rollout

Run `npm run typecheck`, `npm test`, `npm run build`, and `node --import tsx scripts/check-registration-browser.ts` from the repository root. The browser script uses a locally trusted TLS SMTP fixture. The API smoke suite uses fixture billing and exercises valid, invalid, reused, and unavailable Priority codes.

This patch has no database migration or new secret requirement. Deploy the matching backend and frontend builds through the existing release process. Before promoting to production, check registration and verification in the target environment and verify the billing enrollment confirmation with an authorized test account. Rollback can redeploy the previous frontend and backend images. An already recorded flyer grant stays in the normal Plus data through its existing expiry.

### Membership deployment

Maintain separate Stripe prices in the same account and mode. Set `STRIPE_FOUNDER_PRICE_ID` to the active CAD 4.99 monthly Price ID, `STRIPE_PRIORITY_INTRO_PRICE_ID` to the active CAD 14.99 one-time Price ID, and `STRIPE_PRIORITY_RENEWAL_PRICE_ID` to the active CAD 9.99 monthly Price ID. The standard and flyer renewal retain `STRIPE_PLUS_PRICE_ID` at CAD 7.99 monthly.

Use the Stripe test-mode environment to confirm the founder Checkout shows zero initially and the approved monthly amount after the trial. Confirm the Priority referral Checkout collects the introductory amount on the initial invoice and schedules the separate renewal rate. Rehearse payment failures, cancellation, and incoming webhook processing before using live-mode prices.

### Growth rollout

The Growth dashboard is in **Settings → Account** for administrators. It lists referral attribution counts, introductory receipts and refunds, commission states, and campaign SMTP results. Referral notification and summary email use the transactional sender and require `REFERRAL_EMAIL_ENABLED=true`. Marketing is disabled by default and requires explicit activation with `MARKETING_SEND_ENABLED=true`, a verified `MARKETING_FROM`, `MARKETING_CONTACT_ADDRESS`, and `MARKETING_PUBLIC_API_URL`. Use an HTTPS API URL reachable from an email client. The unsubscribe endpoint handles both browser confirmation and provider one-click requests.

The scheduler needs a running backend. An idle Render instance can delay a campaign until the service wakes up. SMTP acceptance measures the immediate handoff. Validate sender authentication, provider bounce handling, and delivery monitoring before a live campaign. The sender avoids automatically retrying an ambiguous SMTP attempt after a crash.

Enable delivery of signed Stripe `charge.refunded` events alongside invoice events and confirm the introductory invoice is discoverable from the refunded charge. A full introductory refund reverses the commission, and a partial refund holds the commission for review. An already recorded payout stays in the audit record after a refund. The dashboard records external payouts and does not transfer money. Set the payout minimum, method, cadence, reversal window, and tax treatment before paying real commissions.
