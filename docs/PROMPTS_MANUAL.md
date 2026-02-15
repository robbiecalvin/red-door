# DualMode Codex Instructions Manual (Step-by-Step, Binding)

This file is the operational manual for using Codex on DualMode.
If a prompt or workflow step conflicts with `docs/product.md`, `AGENTS.md`, or `codex.config.toml`, the prompt is invalid.

---

## 0) Operating Rules (Read Once)
**You will only ever ask Codex to IMPLEMENT or MODIFY existing files.**  
Never ask it to “create a new architecture” or “organize the project.” That’s how you get surprise folders and nonsense abstractions.

**Prompt style rules:**
- Always specify the exact file path(s).
- Always specify inputs, outputs, and acceptance criteria.
- Always require tests for backend services and any non-trivial frontend logic.
- If Codex proposes new files: reject, and restate “use existing file paths only.”
- If Codex is uncertain: it must ask. If it guesses: reject.

**Hard constraints (must be repeated in prompts):**
- Cruise Mode: map + realtime + optional anonymity.
- Date Mode: feed + mutual match + no realtime presence + no anonymity.
- Hybrid Mode: explicit opt-in.
- Never store exact GPS; server-side randomization only; distance buckets only.

---

## 1) One-Time Bootstrapping Prompts (Run Exactly Once)

### 1.1 Context Lock Prompt (no code generation)
**Prompt:**
Read and internalize the following files fully:
- codex.config.toml
- AGENTS.md
- docs/product.md
- docs/PROMPTS_MANUAL.md

Do NOT generate code yet.
Return a checklist of constraints you will enforce during implementation, grouped by:
- Modes
- Location/Privacy
- Realtime
- Data retention
- Safety
- File structure rules

Confirm you will ONLY edit existing files and will not create new ones unless explicitly instructed.

### 1.2 Repo Sanity Prompt (optional, still no code generation)
**Prompt:**
Scan the repository structure and confirm it matches the intended layout.
Do not add or rename folders.
List any missing files that are referenced in docs but not present (do not create them).

---

## 2) Execution Order (Do Not Skip)
You build this in the order below to avoid circular dependencies and mode leakage.

1. Mode System (backend authority + frontend provider)
2. Auth & Identity (guest vs registered vs subscriber)
3. Realtime Gateway (WebSocket server skeleton)
4. Presence System (Cruise Mode only)
5. Dating Feed + Matching (Date Mode only)
6. Chat System (ephemeral vs persistent)
7. Safety & Moderation (age gate, block/report, rate limits)
8. Subscription Gating (Stripe integration + feature flags)
9. Documentation + Test Hardening

---

## 3) Implementation Prompts (Use These as “Tickets”)
Each section includes:
- Goal
- Files to edit
- Acceptance criteria
- Codex prompt

### 3.1 Mode System (Backend is Source of Truth)
**Goal:** A single authoritative mode state per user/session that gates features server-side and drives UI state client-side.

**Files:**
- backend/src/services/modeService.ts
- frontend/src/app/ModeProvider.tsx
- frontend/src/app/Router.tsx (if needed for view routing)

**Acceptance Criteria:**
- Mode values limited to: `cruise | date | hybrid`
- Anonymous sessions may select `cruise` only
- Server rejects illegal mode transitions (e.g. anonymous -> date)
- Frontend reads mode from backend and stores in ModeProvider
- Tests cover allowed/blocked transitions

**Prompt:**
Implement `backend/src/services/modeService.ts` and `frontend/src/app/ModeProvider.tsx`.
Requirements:
- Mode enum: cruise/date/hybrid
- API surface (define explicitly): getCurrentMode(session), setMode(session, mode)
- Enforce product rules from docs/product.md and AGENTS.md
- Add Jest tests for backend mode transitions
Do not create new files. Only edit the listed files.

---

### 3.2 Auth & Identity (Guest vs Registered vs Subscriber)
**Goal:** Auth that supports anonymous session tokens and registered JWT auth, plus subscription tier flags.

**Files:**
- backend/src/services/authService.ts

**Acceptance Criteria:**
- Guest token issuance (ephemeral session)
- Registered login/signup (JWT)
- Response includes: userType (guest/registered), tier (free/premium)
- No Date Mode access for guests (enforced by modeService)
- Tests for signup/login/guest-token

**Prompt:**
Implement `backend/src/services/authService.ts`.
Include:
- createGuestSession()
- register(email, password)
- login(email, password)
- issueJWT(user)
- return tier flags (free by default)
Add Jest tests for success and failure paths.
No new files.

---

### 3.3 WebSocket Gateway (Realtime Skeleton)
**Goal:** A single WS entry point that validates session, routes message types, and broadcasts safely.

**Files:**
- backend/src/realtime/websocketGateway.ts

**Acceptance Criteria:**
- Auth handshake required (guest token or JWT)
- Message envelope: { type, payload }
- Reject unknown message types
- Heartbeat enforced
- Payload size limit (<2kb per AGENTS)
- Unit tests for message validation

**Prompt:**
Implement `backend/src/realtime/websocketGateway.ts` with:
- connection auth (guest token/JWT)
- heartbeat interval and disconnect on timeout
- message validation and routing skeleton
- payload size checks
Add tests for handshake, invalid messages, and oversized payload rejection.
No new files.

---

### 3.4 Presence System (Cruise Mode Only)
**Goal:** Ephemeral presence with server-side location randomization and TTL expiry.

**Files:**
- backend/src/services/presenceService.ts
- frontend/src/features/cruise/CruisePresence.ts
- frontend/src/features/cruise/cruise.types.ts

**Acceptance Criteria:**
- Presence accepted ONLY if current mode is cruise or hybrid
- Reject presence updates in date mode
- Randomize coords server-side (never store raw input)
- TTL expiry (config: update every 15s, expiry 45s)
- Broadcast minimal payloads to nearby subscribers (basic version: broadcast to all connected clients)
- Frontend subscribes and maintains local presence map
- Tests cover: mode rejection, randomization applied, expiry

**Prompt:**
Implement presence end-to-end in the listed files.
Backend:
- updatePresence(session, lat, lng, status)
- apply server-side jitter (100m)
- store ephemeral presence in memory (initial) and document Redis upgrade path in docs later
- enforce TTL and periodic cleanup
- broadcast updates through websocketGateway
Frontend:
- connect to WS, handle presence_update messages, expose map-ready markers
Add Jest tests for backend presence rules.
No new files.

---

### 3.5 Cruise Map UI (Mapbox Rendering)
**Goal:** Render Mapbox map and presence pins; degrade gracefully without geolocation.

**Files:**
- frontend/src/features/cruise/CruiseMap.tsx
- frontend/src/features/map/MapView.tsx
- frontend/src/features/map/map.types.ts

**Acceptance Criteria:**
- Map renders with Mapbox GL
- Pins rendered from CruisePresence state
- If geolocation denied: still show map centered on default city with banner
- No swipe/feed components in Cruise view

**Prompt:**
Implement Cruise map rendering in the listed files.
- Use Mapbox GL
- Provide types for markers and map state
- Include basic UI for location permission denied
No new files.

---

### 3.6 Dating Feed + Matching (Date Mode Only)
**Goal:** Swipe/grid feed and mutual matching engine (no realtime presence).

**Files:**
- backend/src/services/matchingService.ts
- frontend/src/features/dating/DatingFeed.tsx
- frontend/src/features/dating/MatchEngine.ts
- frontend/src/features/dating/dating.types.ts

**Acceptance Criteria:**
- Guests blocked entirely
- Swipe actions stored (initial: in-memory stub allowed ONLY if clearly marked as MVP and replaced next step with Postgres)
- Mutual match creates a match record
- No presence or map dependencies
- Tests for match creation and guest rejection

**Prompt:**
Implement Date Mode matching and feed UI.
Backend:
- recordSwipe(fromUser, toUser, direction)
- checkMutualMatch(fromUser, toUser)
- createMatch(fromUser, toUser) when mutual
Frontend:
- simple swipe UI (buttons acceptable for MVP)
- call MatchEngine for state and backend integration
Add tests for backend matching logic.
No new files.

---

### 3.7 Chat System (Ephemeral vs Persistent)
**Goal:** Messaging where Cruise chats expire automatically and Date chats persist.

**Files:**
- backend/src/services/chatService.ts
- frontend/src/features/chat/ChatWindow.tsx
- frontend/src/features/chat/chat.types.ts

**Acceptance Criteria:**
- Cruise chats auto-expire at 72h
- Date chats persist until user deletion
- Blocked users cannot message
- Rate limit: 20/min
- Tests cover: expiry rules, block enforcement, rate limit

**Prompt:**
Implement chat service and basic UI.
- Define chat message types in chat.types.ts
- Enforce mode-based retention rules
- Implement block checks (stub if block service not yet built, but include explicit interface)
- Add Jest tests for key rules
No new files.

---

### 3.8 Safety: Age Gate, Blocking, Reporting, Rate Limiting
**Goal:** Baseline safety controls required for a location + chat platform.

**Files:**
- backend/src/middleware (existing folder; implement in-place by editing only if files exist, otherwise skip)
- docs/product.md (update if needed)

**Acceptance Criteria:**
- Age gate required before any app feature
- Block is global and immediate
- Reporting exists for users/messages
- Message rate limit enforced

**Prompt:**
If safety middleware files already exist, implement them.
If no files exist in backend/src/middleware, do NOT create new ones.
Instead, implement safety checks inside the relevant services (auth/chat/mode) and document the intended middleware filenames in docs/api.md.
Add tests covering rate limit and block/report behavior.

---

### 3.9 Subscription Gating (Stripe)
**Goal:** Premium feature flags and enforcement.

**Files:**
- backend/src/services/subscriptionService.ts
- frontend/src/features/subscription (folder exists; if no files, do NOT create new ones; document intended files)

**Acceptance Criteria:**
- Tier: free/premium
- Premium gates: incognito, advanced filters, boosts
- Backend is authoritative, frontend only displays

**Prompt:**
Implement `backend/src/services/subscriptionService.ts` with:
- getTier(user)
- requirePremium(session, feature)
- stub Stripe integration with clear interfaces (no fake keys)
Add tests for gating.
Do not create new frontend files; document intended UI files in docs/product.md.

---

## 4) “No New Files” Enforcement Prompts (Use When Codex Misbehaves)

### 4.1 If Codex tries to create new files
**Prompt:**
Stop. You are not allowed to create new files or folders.
Re-apply the solution using ONLY the existing file paths.
List the files you will edit and what will change in each, then implement.

### 4.2 If Codex invents product rules
**Prompt:**
Stop. You invented product behavior.
Re-read docs/product.md and implement ONLY what is specified.
If information is missing, ask a single precise question and do not implement the missing behavior.

---

## 5) Definition of Done (Per Feature)
A feature is “done” only if:
- Code compiles
- Tests exist and pass for the backend change
- No new files were created (unless explicitly authorized)
- Docs updated if behavior changes

---

## 6) MVP vs Phase 2 (Practical Notes)
MVP should allow:
- Cruise: map + presence + minimal chat
- Date: feed + match + persistent chat
- Mode switching with strict enforcement

Phase 2 adds:
- Postgres persistence (replace in-memory stubs)
- Redis presence store
- Advanced filtering
- Premium features and Stripe checkout UI

---

End of manual.
