# DualMode Test Matrix (MVP)
**Status: Binding Companion Document**

This file maps each binding acceptance scenario from `docs/acceptance_criteria.md` to at least one concrete Jest test.

Rule: If a scenario has no mapped test, the implementation is incomplete.

---

## Acceptance Criteria Mapping

### `backend/src/services/modeService.ts`

- Scenario 1: Invalid Mode Transition
  - `tests/modeService.test.ts`
    - `Given a valid user session When an invalid mode transition is requested Then the service rejects the request with a deterministic, explicit error And the session’s current mode remains unchanged`
- Scenario 2: Anonymous User Requests Date Mode
  - `tests/modeService.test.ts`
    - `Given an anonymous (guest) session When Date Mode is requested Then the transition is rejected And the rejection reason explicitly indicates anonymous access is forbidden`

### `backend/src/services/presenceService.ts`

- Scenario 1: Presence Update in Cruise Mode
  - `tests/presenceService.test.ts`
    - `Given a session currently in Cruise Mode When a presence update is submitted with client-provided coordinates Then coordinates are randomized server-side And raw client coordinates are never stored or broadcast`
- Scenario 2: Presence Update in Date Mode
  - `tests/presenceService.test.ts`
    - `Given a session currently in Date Mode When a presence update is attempted Then the update is rejected And no presence data is stored, cached, or broadcast`

### `backend/src/services/matchingService.ts`

- Scenario 1: Mutual Positive Swipes
  - `tests/matchingService.test.ts`
    - `Given two registered users And both users submit positive swipe actions toward each other When the second positive swipe is recorded Then a match record is created And the match is persisted according to current storage rules`
- Scenario 2: Guest User Attempts Swipe
  - `tests/matchingService.test.ts`
    - `Given a guest (anonymous) user When any swipe action is attempted Then the request is rejected And no swipe or match data is stored`

### `backend/src/services/chatService.ts`

- Scenario 1: Cruise Mode Chat Expiry
  - `tests/chatService.test.ts`
    - `Given a chat created while both participants are in Cruise Mode When 72 hours have elapsed since message creation Then the messages are expired and no longer retrievable And expired messages cannot be restored`
- Scenario 2: Blocked User Attempts Messaging
  - `tests/chatService.test.ts`
    - `Given a user has been blocked by another user When the blocked user attempts to send a message Then message delivery is prevented And the sender receives an explicit rejection And no message data is persisted`

---

## Required Error Codes Coverage (docs/errors.md)

Each required error code is asserted by at least one Jest test below.

- `INVALID_MODE_TRANSITION`
  - `tests/modeService.test.ts` (invalid mode)
- `ANONYMOUS_FORBIDDEN`
  - `tests/modeService.test.ts` (guest -> date)
  - `tests/matchingService.test.ts` (guest swipe)
  - `tests/chatService.test.ts` (guest date chat when mode allows)
- `PRESENCE_NOT_ALLOWED`
  - `tests/presenceService.test.ts` (date mode presence)
- `MATCHING_NOT_ALLOWED`
  - `tests/matchingService.test.ts` (cruise mode swipe)
- `CHAT_EXPIRED`
  - `tests/chatService.test.ts` (cruise expiry)
- `USER_BLOCKED`
  - `tests/chatService.test.ts` (blocked send)
- `RATE_LIMITED`
  - `tests/chatService.test.ts` (21st message rejected)
- `AGE_GATE_REQUIRED`
  - `tests/authService.test.ts` (verifyAge rejects <18)
  - `tests/modeService.test.ts` (mode change requires age verification)
  - `tests/presenceService.test.ts` (presence requires age verification)
  - `tests/matchingService.test.ts` (swipe requires age verification)
  - `tests/chatService.test.ts` (send requires age verification)
  - `tests/blockService.test.ts` / `tests/reportService.test.ts`
- `UNAUTHORIZED_ACTION`
  - `tests/matchingService.test.ts` (invalid direction/target)
  - `tests/chatService.test.ts` (invalid recipient/message/kind)
  - `tests/reportService.test.ts` (invalid target/reason)
- `INVALID_SESSION`
  - `tests/authService.test.ts` (expired/unknown session)
  - `tests/modeService.test.ts` / `tests/presenceService.test.ts` / `tests/matchingService.test.ts` / `tests/chatService.test.ts`

