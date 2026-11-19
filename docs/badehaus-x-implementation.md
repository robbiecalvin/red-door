# Badehaus X implementation status

This review maps the November 19 master specification to the repository. A partial status covers the specific features listed in that row. Hosted checks and legal, operational, or provider decisions require separate evidence.

| Specification | Status | Current evidence and remaining work |
| --- | --- | --- |
| 1. Branding | Partial | `App.tsx` and the discovery styles include the Badehaus X identity and refreshed member UI. Final wordmark, icon, domain, and brand guide need final assets or settings. |
| 2. Registration and authentication | Partial | `App.tsx`, `authService.ts`, and the registration browser check cover separate forms, age declaration, and email ownership. Password recovery exists. Record acceptance of Terms and Privacy Policy and establish separate marketing consent. Hosted email delivery still needs verification. |
| 3. Profiles | Partial | `profileService.ts`, `ProfileDetails.tsx`, and `MemberPanels.tsx` support images, details, prompts, preferences, and privacy. Settings contains the editor and replaces the standalone Profile sidebar entry. The legacy profile route still reaches the settings surface. External links with independent visibility remain open. |
| 4. Discovery | Partial | `Router.tsx`, `MapView.tsx`, and `presenceService.ts` cover the grid, map, filters, approximate location, and blocks. Priority ranking requires eligibility, activity timestamps, a configurable radius, and tests that preserve visibility filters. |
| 5. Messaging | Partial | `chatService.ts`, the WebSocket gateway, and `ChatWindow.tsx` implement core messaging, media, replies, blocks, and read state. Explore and Inbox respect the current session mode for new conversations and Inbox follows existing channel history in Hybrid. Private group history isolation still needs its own workflow and QA. |
| 6. Streaming | Blocked | Existing call signaling supports direct calls. Public broadcasting requires a provider, lifecycle, eligibility, and moderation decisions. |
| 7. Right Now | Partial | `memberService.ts` and `MemberPanels.tsx` support expiring intent and discovery filtering. The specified 60-minute status and lightning presentation require a separate change. |
| 8. Groups and postings | Partial | `communityRepository.ts`, `publicPostingsService.ts`, and `CommunityPanel.tsx` cover community data and actions. Verify host approval before private address disclosure and implement group messaging with independent history. |
| 9. Plus | Partial | `shared/plus.ts`, `subscriptionService.ts`, and `renewalEnrollment.ts` implement Standard Plus, fixed launch grants, and authorized renewal. Founding and Priority tiers need separate entitlements and billing. Free and Plus limits still need the final matrix. |
| 10. Priority Members | Missing | Current Plus grants and discovery have no dedicated Priority invitation, public eligibility model, or ranking treatment. |
| 11. Promotions and referrals | Partial | The existing launch promotion now accepts `BADEHAUSXONLINE`. Referrer attribution, Priority offers, commission events, reversal rules, and payout operations remain separate work. |
| 12. Email and notifications | Partial | Verification, password recovery, and push handlers exist in `server.ts` and `pushService.ts`. Marketing needs consent records, unsubscribe handling, sending operations, and reporting. |
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
