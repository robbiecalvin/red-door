# DualMode API Notes (MVP)
**Status: Informational (Implementation-Aligned)**

This repo currently implements backend behavior primarily at the **service layer** (see `backend/src/services/*`).

## Safety Middleware (Intended, Not Present)

`docs/PROMPTS_MANUAL.md` specifies that if `backend/src/middleware` does not exist, we must **not create it** and instead implement safety checks inside services.

The following middleware filenames are the intended targets for a later refactor (names only, no implementation implied):

- `backend/src/middleware/requireSession.ts` (validate session and identity server-side)
- `backend/src/middleware/requireAgeGate.ts` (reject actions unless age gate is satisfied)
- `backend/src/middleware/rateLimit.ts` (request-level rate limiting where applicable)

For MVP, these checks are enforced inside services:

- Age gate: enforced in `modeService`, `presenceService`, `matchingService`, `chatService`, `blockService`, `reportService`
- Block: enforced at send time in `chatService` (and in `matchingService` when a block checker is provided)
- Message rate limit: enforced in `chatService`

## Realtime Message Envelope (Current)

The WebSocket gateway uses a strict message envelope:

- `{ "type": "auth", "payload": { "sessionToken": "..."} }` or `{ "type": "auth", "payload": { "jwt": "..."} }`
- `{ "type": "heartbeat", "payload": {} }`

Unknown message types are rejected deterministically.

## HTTP Routes (Current, MVP)

All session-authenticated HTTP routes require the header:

- `x-session-token: <sessionToken>`

Auth routes return a `sessionToken` that can be used for subsequent calls.

### Health
- `GET /health`

### Auth
- `POST /auth/guest`
- `POST /auth/register` body: `{ "email": string, "password": string }`
- `POST /auth/login` body: `{ "email": string, "password": string }`
- `POST /auth/verify-age` body: `{ "sessionToken": string, "ageYears": number }`
- `GET /session` (debug-friendly; returns current server session state)

### Mode
- `GET /mode`
- `POST /mode` body: `{ "mode": "cruise" | "date" | "hybrid" }`
- `POST /mode/hybrid-opt-in` body: `{ "optIn": boolean }`

### Presence
- `POST /presence` body: `{ "lat": number, "lng": number, "status"?: string }`

### Matching
- `POST /matching/swipe` body: `{ "toUserId": string, "direction": "like" | "pass" }`
- `GET /matching/matches`

### Dating
- `GET /dating/feed?limit=<number>`

### Chat
- `POST /chat/send` body: `{ "chatKind": "cruise" | "date", "toKey": string, "text": string }`
- `GET /chat/messages?chatKind=cruise|date&otherKey=<string>`

### Blocking
- `POST /block` body: `{ "targetKey": string }`
- `POST /unblock` body: `{ "targetKey": string }`

### Reporting
- `POST /report/user` body: `{ "targetKey": string, "reason": string }`
- `POST /report/message` body: `{ "messageId": string, "reason": string, "targetKey"?: string }`
