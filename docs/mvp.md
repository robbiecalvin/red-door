1. MVP Objective

The MVP exists to prove three things only:

Real-time, map-based cruising + chat grid functionality works

Profile/privacy/media/public-posting/submission flows work

Mode enforcement remains server-side, not inferred client-side

No additional value propositions are part of MVP.

2. Included Functionality (Authoritative)
2.1 Cruise Mode (MVP Scope)

Cruise Mode MUST include:

Interactive map rendering

Real-time presence updates

Presence is ephemeral

Presence expires automatically

Anonymous guest sessions

Basic one-to-one chat

Chat is ephemeral

Messages expire after 72 hours

Expired messages are unrecoverable

Cruise Mode MUST NOT include:

Swipe logic

Matching logic

Persistent chat

Profile feeds

2.2 Date Mode (Reserved)

Date mode and matching are reserved for future scope and are not active in current frontend behavior.

2.3 Global Functionality (MVP Scope)

The following features apply across all modes and are required:

Explicit mode switching

Mandatory age gate (18+)

Block functionality

Report functionality

Message rate limiting

Distance bucketing (approximate ranges only)

Zero storage of exact GPS coordinates

User profile configuration (required)

- Registered users must be able to configure:
  - display name
  - age
  - short bio
  - stats: height, race, cock size (in inches), cut/uncut, weight, position (top/bottom/side)
- Profile media uploads are included in MVP:
  - main profile photo
  - photo gallery
  - video upload
- Media uploads must use S3-compatible object storage (direct-to-S3 via presigned URLs).
- Favorites system:
  - Registered users can favorite/unfavorite other users.
  - Favorites are shown as a dedicated list and can be used as a discovery filter.
- Discovery filtering:
  - Users can filter discovery surfaces by profile fields:
    - age
    - race
    - height
    - weight
    - cock size
    - cut/uncut
- Public postings:
  - Ads and events are visible to all users (including guests).
  - Guests are read-only and cannot create ads or events.
- Messaging channels:
  - Instant channel (ephemeral behavior aligned with Cruise constraints)
  - Direct channel (private messaging aligned with Date constraints)
- In-chat calling support:
  - Audio call entry point
  - Video call entry point
- Submissions:
  - Users can publish short erotic stories.
  - Submissions have view counts and star ratings.

Global functionality MUST NOT rely solely on frontend enforcement.

3. Explicitly Excluded from MVP

The following features are explicitly forbidden in MVP:

Paid subscriptions or monetization

Push notifications

Redis or Postgres performance optimizations beyond basic correctness

Administrative dashboards or moderation tooling

These features may exist only in future phases and must not be stubbed or partially implemented.

4. Enforcement Rules

If a feature is not listed in Section 2, it is not MVP

If a feature appears in Section 3, it must not appear in code

If MVP scope is unclear, implementation must stop and ask

Partial implementations, placeholders, or “future-proofing” are considered scope violations.

5. Definition of MVP Complete

The MVP is considered complete only when:

All included features are implemented

All acceptance criteria for included features are satisfied

All excluded features are absent

All mode boundaries are enforced server-side

Tests exist proving enforcement of the above

If any excluded feature exists in code, the MVP is not complete.
