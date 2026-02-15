# Error & Rejection Contract
**Status: Binding**

This document defines the mandatory structure, semantics, and philosophy of all errors and rejections in DualMode.

If an implementation emits errors that do not conform to this document, the implementation is incorrect.

---

## 1. Error Philosophy

All errors and rejections MUST be:

- Explicit
- Deterministic
- Server-authoritative
- Machine-readable
- Human-readable

Silent failure is forbidden.
Ambiguous failure is forbidden.
Client-side inference is forbidden.

---

## 2. Error Object Shape (Mandatory)

All errors returned by backend services MUST conform to the following structure:

```json
{
  "code": "STRING_IDENTIFIER",
  "message": "Human-readable explanation",
  "context": { "optional": "metadata" }
}

code is required and MUST be stable.

message is required and MUST be suitable for direct user display.

context is optional and MUST NOT contain sensitive data.

3. Required Error Codes (Minimum Set)

The following error codes MUST exist and MUST be used where applicable:

INVALID_MODE_TRANSITION

ANONYMOUS_FORBIDDEN

PRESENCE_NOT_ALLOWED

MATCHING_NOT_ALLOWED

CHAT_EXPIRED

USER_BLOCKED

RATE_LIMITED

AGE_GATE_REQUIRED

UNAUTHORIZED_ACTION

INVALID_SESSION

Additional documented error codes (used by Profile/Media services):

INVALID_INPUT

PROFILE_NOT_FOUND

MEDIA_TYPE_NOT_ALLOWED

MEDIA_TOO_LARGE

MEDIA_UPLOAD_INCOMPLETE

STORAGE_ERROR

Additional documented error codes (Community/Discovery services):

FAVORITE_NOT_FOUND

POSTING_TYPE_NOT_ALLOWED

SUBMISSION_NOT_FOUND

RATING_OUT_OF_RANGE

Additional documented error codes (Auth verification):

EMAIL_VERIFICATION_REQUIRED

INVALID_VERIFICATION_CODE

Implementations may add additional error codes ONLY if documented here.

4. Frontend Handling Rules

The frontend MUST display error messages verbatim.

The frontend MUST NOT reword, reinterpret, or infer causes.

The frontend MUST NOT suppress errors except where explicitly allowed.

If an error is returned, the UI must reflect rejection immediately.

5. Testing Requirement

Every error code MUST be enforced by at least one test.
Tests MUST FAIL if an error is removed or replaced with a generic rejection.

Final Rule

If an action fails and the reason is not explicitly communicated via this contract, the implementation is incorrect.
