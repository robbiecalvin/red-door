File-Level Acceptance Criteria

Format: Given / When / Then (Binding)

This document defines non-negotiable acceptance criteria for individual files.
If an implementation does not satisfy every scenario listed for a file, that file is not complete, regardless of test status.

Each scenario must be enforced by at least one test.

backend/src/services/modeService.ts
Scenario 1: Invalid Mode Transition

Given a valid user session
When an invalid mode transition is requested
Then the service rejects the request with a deterministic, explicit error
And the session’s current mode remains unchanged

Scenario 2: Anonymous User Requests Date Mode

Given an anonymous (guest) session
When Date Mode is requested
Then the transition is rejected
And the rejection reason explicitly indicates anonymous access is forbidden

backend/src/services/presenceService.ts
Scenario 1: Presence Update in Cruise Mode

Given a session currently in Cruise Mode
When a presence update is submitted with client-provided coordinates
Then coordinates are randomized server-side
And raw client coordinates are never stored or broadcast

Scenario 2: Presence Update in Date Mode

Given a session currently in Date Mode
When a presence update is attempted
Then the update is rejected
And no presence data is stored, cached, or broadcast

backend/src/services/matchingService.ts
Scenario 1: Mutual Positive Swipes

Given two registered users
And both users submit positive swipe actions toward each other
When the second positive swipe is recorded
Then a match record is created
And the match is persisted according to current storage rules

Scenario 2: Guest User Attempts Swipe

Given a guest (anonymous) user
When any swipe action is attempted
Then the request is rejected
And no swipe or match data is stored

backend/src/services/chatService.ts
Scenario 1: Cruise Mode Chat Expiry

Given a chat created while both participants are in Cruise Mode
When 72 hours have elapsed since message creation
Then the messages are expired and no longer retrievable
And expired messages cannot be restored

Scenario 2: Blocked User Attempts Messaging

Given a user has been blocked by another user
When the blocked user attempts to send a message
Then message delivery is prevented
And the sender receives an explicit rejection
And no message data is persisted

backend/src/services/profileService.ts
Scenario 1: Guest Cannot Configure Profile

Given a guest (anonymous) session
When a profile update is attempted
Then the request is rejected with an explicit error indicating anonymous access is forbidden
And no profile data is persisted

Scenario 2: Profile Update Validation

Given a registered session that has passed the age gate
When a profile update is submitted with invalid fields (e.g. empty display name, age < 18)
Then the request is rejected with a deterministic, explicit validation error
And the previously stored profile remains unchanged

Scenario 3: Profile Read After Update

Given a registered session that has passed the age gate
When a valid profile update is submitted
Then a subsequent profile read returns the updated fields

backend/src/services/mediaService.ts
Scenario 1: Presigned Upload for Authorized User

Given a registered session that has passed the age gate
When a media upload is initiated for an allowed media type within size limits
Then the service returns a presigned S3 upload URL
And the media metadata is recorded as owned by the initiating user

Scenario 2: Guest Cannot Initiate Media Upload

Given a guest (anonymous) session
When a media upload initiation is attempted
Then the request is rejected with an explicit error indicating anonymous access is forbidden

backend/src/services/favoritesService.ts
Scenario 1: Favorite Toggle

Given a registered session that passed age gate
When favorite is toggled for another valid user id
Then the user is deterministically added or removed from favorites
And the response includes the updated favorite state

Scenario 2: Guest Cannot Modify Favorites

Given a guest session
When favorite toggle is attempted
Then the request is rejected with ANONYMOUS_FORBIDDEN

backend/src/services/publicPostingsService.ts
Scenario 1: Guest View, No Post

Given a guest session
When public postings are listed
Then listings are returned
When post creation is attempted
Then creation is rejected with ANONYMOUS_FORBIDDEN

backend/src/services/submissionsService.ts
Scenario 1: View Count

Given an existing submission
When view is recorded
Then view count increases deterministically by one

Scenario 2: Star Rating

Given an existing submission
When a valid 1-5 star rating is submitted
Then aggregate rating fields are updated deterministically

Global Acceptance Rules

Every scenario above MUST have at least one corresponding test

Tests MUST FAIL if the described rule is removed or bypassed

Silent failure is forbidden

Partial enforcement is considered non-compliance

If a scenario is not explicitly listed here, it is not yet defined and must not be inferred.
