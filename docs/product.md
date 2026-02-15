Red Door Product Specification

Status: Binding / Authoritative

This document defines Red Door in binding terms.

If any code behavior, test behavior, or implementation decision contradicts this document, the code is incorrect, regardless of test results, performance, or perceived usefulness.

This document is a source of truth.

1. Product Definition

Red Door is a cruise-first social platform.

Current active product scope:
- map-first real-time discovery
- chat grid + direct messaging
- profile, privacy, media, public postings, and submissions

Date feed and matching flows are reserved for future expansion and are not part of current frontend behavior.

2. Modes (Authoritative)

DualMode operates in exactly three modes. No additional modes may be inferred or created.

2.1 Cruise Mode

Cruise Mode is defined as follows:

Discovery occurs via map ONLY

Anonymous users are allowed

Real-time presence is required

Chats are ephemeral

Messages auto-expire within 72 hours

Expired messages are unrecoverable

Cruise Mode MUST NOT include:

Feed-based discovery

Swipe logic

Matching logic

Persistent chat

Profile-driven ranking

2.2 Date Mode (Reserved)

Date Mode is reserved for future implementation and is not part of current frontend scope.

2.3 Hybrid Mode (Reserved)

Hybrid Mode is reserved for future implementation and is not part of current frontend scope.

3. Location & Privacy Rules (Non-Negotiable)

The following rules override all other considerations:

Exact GPS coordinates MUST NEVER be stored

Location randomization MUST be applied server-side

Raw client-provided coordinates MUST NOT be trusted

Distance is displayed using bucketed ranges only

Location history MUST NOT be persisted

Any violation of these rules is considered a critical privacy defect.

4. Safety & Consent Rules

The following safety rules are mandatory across all modes:

Age gate (18+) is required

Blocking is global and immediate

Reporting is mandatory

Explicit content requires explicit user opt-in

Safety rules MUST be enforced server-side.
Client-side enforcement alone is insufficient and invalid.

5. Profiles & Media (Authoritative)

Registered users must be able to configure a persistent profile that is used for Date Mode discovery.

Profile fields (MVP):
- display name
- age
- short bio
- stats: height, race, cock size (in inches), cut/uncut, weight, position (top/bottom/side)

Profile media (MVP):
- main profile photo
- photo gallery
- video upload

Media storage rules:
- Media uploads MUST be direct-to-S3 (or S3-compatible) via presigned URLs.
- The backend MUST validate and record media metadata and ownership.
- The backend MUST reject uploads that are not authorized or do not meet declared constraints.

6. Social Discovery & Community (Authoritative)

6.1 Public Postings

- The product includes a public postings surface with two sections:
  - Ads
  - Events
- Guests may view public postings.
- Guests MUST NOT be allowed to create ads or events.
- Registered/subscriber users may create and view postings.

6.2 Favorites

- Registered/subscriber users may favorite and unfavorite other users.
- A favorites list must be available as a first-class discovery filter.
- Favorites operations are server-authoritative.

6.3 Discovery Filters

- Discovery filters may include profile fields:
  - age
  - race
  - height
  - weight
  - cock size
  - cut/uncut
- Filters must be explicit; no inferred filtering is allowed.

6.4 Messaging Channels

- The product supports:
  - Instant messaging channel
  - Direct/private messaging channel
- Channel permissions remain mode-aware and server-authoritative.

6.5 Calling

- In-chat audio calling and in-chat video calling entry points are supported.
- Calling initiation must be explicit user action.

6.6 Submissions

- The product includes a Submissions surface for short erotic stories.
- Users can publish stories.
- Stories are viewable by others.
- Stories include:
  - view count
  - star rating

5. Non-Negotiables

The following are absolute prohibitions:

No mode crossover logic

No silent failures

No placeholder implementations

No inferred behavior outside this document

If required behavior is not explicitly defined here, implementation must stop and ask.

Assumption is not implementation.

6. Authority Statement

This document supersedes:

Individual prompts

Code comments

Test assumptions

Convenience-driven decisions

If a conflict exists, this document wins.
