# Community, discovery, messaging, and trust rollout

Validated November 15, 2026 on isolated local accounts; no production accounts, real payments, or actual verification claims were used in tests.

## Implemented

- Opt-in intent statuses (chatting, meeting tonight, browsing, making friends) with 1/2/4/8-hour automatic expiry.
- Up to eight shared interests and three profile prompts, with direct quoted replies to prompts, photos, and messages.
- Quick intent/interest/photo-reviewed filters, Plus remembered discovery preferences, and profile-completion guidance with useful empty states.
- Authenticated live inbox updates, unread refresh events, polling recovery, duplicate-message suppression, and no automatic read receipts while the tab is hidden.
- Free location hiding and reporting/blocking, durable safety preferences/reports, optional private photo review, admin review queues, and main-photo-bound badges. Photo review is not identity verification or a safety guarantee.
- Community plans at public venues, city/category search, RSVP/leave, host/admin cancellation, attendee counts without public attendee lists, and plan reporting.
- Opt-in encrypted Web Push for supported browsers. VAPID signing keys and device registrations persist; no personal message content goes into push payloads. PUBLIC_APP_URL must be the public HTTPS app URL. iOS requires Home Screen installation and user permission.
- Plus off-grid discovery controls and more useful profile, privacy, notifications, and membership settings.

## Security fixes and deployment notes

Guest public actor IDs are now keyed opaque identifiers rather than session credentials. Presence, chat, blocks, reports, and guest chat attachment paths use the public ID. Public IDs cannot authenticate. Legacy guest sessions must start a fresh guest session; registered accounts are unaffected. New guest sessions retain separate identities and the display name Anon.

Member preferences/review metadata use the existing persistent account data. New community state, moderation state, signing keys, and guest-identity version records use PostgreSQL when configured, or a mode-0600 JSON file at backend/.data/community.json. Persistent storage is required across server replacements. No card data is stored by this feature batch.

Verification selfies are a separate private media kind, inaccessible through public image routes or albums. Only admins reviewing pending submissions can retrieve them. Proof images are deleted after review/withdrawal and expired pending requests are cleaned hourly after seven days. Changing the main photo removes the badge. Administrators cannot approve their own photos.

## Verification

- npm run typecheck: pass.
- npm test -- --coverage=false: 28 suites / 293 tests pass.
- npm run build: pass; existing large MapLibre chunk warning remains.
- API coverage includes expiration/validation, paid gates, off-grid access for prior contacts, hidden presence, private proof authorization/approval/replacement, plan ownership and blocked-member behavior, push destination restrictions, and guest credential non-disclosure.
- Chromium checks cover phone/desktop intent and interest filters, prompts, private selfie submission/admin review using red-pixel fixtures, live messages in under the polling interval, quoted replies, a hidden-tab read-receipt check, public plans/RSVP at 320/390/768/1440px, privacy controls, notification settings, and the worker artifact. No JavaScript exceptions.
- Web Push tests mock delivery and test key persistence and expired-subscription removal. Real-device notification delivery and physical iOS/Android keyboards remain device acceptance checks.

## Dependency review

Added web-push and its TypeScript definitions. Applied compatible transitive security updates. The production audit now reports three remaining advisories: MapLibre GL (critical, fixed by a major upgrade), Nodemailer (high, fixed by a major upgrade), and qs (moderate). No forced major dependency migration was made in this feature batch. The map renderer continues to escape user content before placing it in popup markup.
