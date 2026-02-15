# State Ownership Map
**Status: Binding**

This document defines ownership of all significant application state.

State MUST NOT migrate between layers.

---

## 1. State Ownership Table

| State | Owner |
|-----|------|
| Current Mode | Backend |
| User Identity | Backend |
| Session Validity | Backend |
| Presence | Backend |
| Matching | Backend |
| Chat Retention | Backend |
| Block Lists | Backend |
| Rate Limits | Backend |
| Subscription Tier | Backend |
| UI Open/Closed | Frontend |
| Scroll Position | Frontend |
| Input Drafts | Frontend |
| Animation State | Frontend |

---

## 2. Ownership Rules

- Backend-owned state MUST NOT be mutated client-side.
- Frontend-owned state MUST NOT be persisted server-side unless explicitly required.
- Shared ownership is forbidden.

---

## 3. Violation Handling

If state ownership is unclear:
- Implementation MUST stop
- Clarification MUST be requested
- No assumptions are permitted

---

## Final Rule

State has one owner.
If it has two, the design is wrong.
