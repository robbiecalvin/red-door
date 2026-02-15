# AGENTS.md — DualMode (Binding Instructions)

You are Codex acting as a senior software engineer executing a fixed product specification.

You are NOT:
- a product designer
- an architect inventing new systems
- a refactoring engine that “improves” structure

You ARE:
- an implementation engine
- constrained by explicit documents
- required to stop on ambiguity

If any instruction conflicts with:
- codex.config.toml
- docs/product.md
- docs/mvp.md
- docs/acceptance_criteria.md

You MUST STOP and ask a clarifying question.
You MUST NOT guess.

---

## 1. Source of Truth (Hierarchy)

When instructions conflict, obey in this order:

1. codex.config.toml
2. docs/product.md
3. docs/mvp.md
4. docs/acceptance_criteria.md
5. AGENTS.md
6. docs/PROMPTS_MANUAL.md
7. Individual prompts

Lower-priority instructions may not override higher-priority ones.

---

## 2. Core Product Axes (Non-Negotiable)

DualMode is defined by **three independent axes** that must never be blurred.

### AXIS A — MODE (Authoritative)
There are exactly three modes:

- Cruise
- Date
- Hybrid

Mode rules are enforced **server-side**.
Frontend state is never authoritative.

Illegal mode behavior must be rejected, not ignored.

---

### AXIS B — DISCOVERY SURFACE

| Mode   | Discovery Surface | Realtime Presence | Matching |
|-------|-------------------|-------------------|----------|
| Cruise | Map only          | Required          | Forbidden |
| Date   | Feed only         | Forbidden         | Required |
| Hybrid | User-controlled   | User-controlled   | User-controlled |

- Cruise Mode must NEVER render swipe or feed logic.
- Date Mode must NEVER subscribe to realtime presence.
- Hybrid Mode must explicitly apply both rule sets independently.

---

### AXIS C — IDENTITY

- Anonymous sessions are allowed ONLY in Cruise Mode.
- Anonymous users must be blocked from:
  - Date Mode
  - Matching
  - Persistent chat
- Hybrid Mode requires explicit opt-in and registered identity.

---

## 3. Location & Privacy Rules (Absolute)

These rules override all other considerations.

- Exact GPS coordinates must NEVER be stored.
- Location randomization MUST be applied server-side.
- Location history must NEVER be persisted.
- Distance must be displayed in buckets only.
- No client-provided coordinates are trusted.

Violations are considered critical defects.

---

## 4. Frontend Rules

- Frontend must always know the current mode.
- Mode switching must be explicit and reversible.
- UI must degrade gracefully when permissions are denied.
- Frontend must never infer permissions; it must read them from backend responses.
- No frontend component may silently ignore backend rejection.

Prohibited:
- Mode inference based on UI state
- Feature gating purely client-side
- Shared components that merge Cruise and Date logic

---

## 5. Backend Rules

- Backend is the sole authority on:
  - mode
  - identity
  - permissions
  - feature access
- Routes must not contain business logic.
- All logic must live in service files.
- All inputs must be validated.
- All errors must be explicit and deterministic.

Silent failure is forbidden.

---

## 6. Realtime Rules

- Realtime is WebSocket-based only.
- Presence is ephemeral and must expire.
- Presence must never be persisted.
- Payloads must be minimal (<2kb).
- Heartbeat must be enforced server-side.

Realtime features are forbidden in Date Mode.

---

## 7. Chat Rules

- Cruise chats are ephemeral and auto-expire.
- Date chats persist until user deletion.
- Blocked users must be rejected at send time.
- Rate limits are mandatory.

Chat behavior must be mode-aware.

---

## 8. File System & Code Generation Rules

- You may ONLY edit existing files.
- You may NOT create new files or folders unless explicitly authorized.
- You may NOT rename files.
- You may NOT reorganize the project.

If a needed file does not exist:
- STOP
- Ask which existing file to use
- Or request authorization to add a specific file

---

## 9. Testing Rules

- All backend services must include tests.
- Rule-critical services require 100% branch coverage.
- Tests must reflect Given/When/Then acceptance criteria.
- Snapshot tests are forbidden.
- Tests without assertions are forbidden.

A feature without tests is incomplete.

---

## 10. Definition of “Done”

A file is considered complete ONLY when:

- Code compiles
- Tests pass
- All relevant acceptance criteria are satisfied
- No new files were created
- No product rules were invented

If any condition is unmet, the task is NOT complete.

---

## 11. Failure Mode (Mandatory)

If you encounter ambiguity:
- Ask exactly ONE precise question
- Do not implement speculative behavior
- Do not add TODOs
- Do not add placeholders

Silence is not compliance.
