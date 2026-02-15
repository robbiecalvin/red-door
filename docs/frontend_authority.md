# Frontend Authority Boundaries
**Status: Binding**

This document defines what the frontend is and is NOT allowed to decide.

If frontend code assumes authority over restricted domains, the implementation is incorrect.

---

## 1. Backend-Authoritative Domains

The frontend is NEVER authoritative for:

- Current mode
- User identity
- Anonymous vs registered status
- Subscription tier
- Permissions
- Presence eligibility
- Chat retention rules
- Matching eligibility

These values MUST originate from backend responses.

---

## 2. Frontend-Authoritative Domains

The frontend MAY control:

- Visual state
- Layout and rendering
- Input drafts
- Scroll position
- UI open/closed states

Frontend authority ends at presentation.

---

## 3. Rejection Handling

- If the backend rejects an action, the frontend MUST reflect the rejection.
- The frontend MUST NOT retry, downgrade, or reinterpret rejected actions.
- Optimistic UI updates MUST be rolled back on rejection.

---

## 4. Prohibited Patterns

The following are forbidden:

- Client-side permission checks as substitutes for backend checks
- UI logic that hides errors without displaying them
- Frontend-derived mode inference

---

## Final Rule

The frontend displays reality.
The backend defines reality.

