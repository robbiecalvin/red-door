# Testing Policy — DualMode (Binding)

This document defines the mandatory testing standards for DualMode.

Testing exists to ENFORCE PRODUCT RULES.
Passing tests without enforcing rules is considered a FAILURE.

If code behavior contradicts:
- docs/product.md
- docs/mvp.md
- docs/acceptance_criteria.md
then the implementation is incorrect, regardless of test status.

---

## 1. Purpose of Tests

Tests serve three purposes ONLY:

1. Enforce mode boundaries (Cruise vs Date vs Hybrid)
2. Enforce privacy, safety, and consent rules
3. Prevent silent regression of critical constraints

Tests are NOT written to:
- maximize coverage vanity metrics
- snapshot UI output
- test framework behavior
- validate trivial getters/setters

---

## 2. Required Test Categories

### 2.1 Backend Unit Tests (Mandatory)

Every backend service file MUST have tests covering:

- Valid behavior
- Invalid behavior
- Rejected behavior

This includes:
- Illegal mode transitions
- Unauthorized access
- Blocked users
- Rate-limited actions
- Expired or invalid sessions

### 2.2 Rule Enforcement Tests (Mandatory)

Rule enforcement tests must exist for:

- Mode restrictions
- Anonymous user limitations
- Presence rejection in Date Mode
- Location randomization
- Chat retention rules
- Block and report enforcement

If a rule exists in docs/product.md, it MUST be enforced by at least one test.

### 2.3 Failure-Path Tests (Mandatory)

For every happy-path test, at least one failure-path test must exist.

Failure-path tests MUST assert:
- correct error type
- correct error message
- correct rejection reason

Silent failure is forbidden.

---

## 3. Coverage Requirements

Coverage is a MINIMUM, not a goal.

### Backend
- Overall service coverage: **≥ 80%**
- Critical rule services (must be listed explicitly):
  - modeService
  - presenceService
  - matchingService
- Critical services require **100% branch coverage**

If branch coverage is <100% on critical services, the feature is incomplete.

### Frontend
- Test non-visual logic only
- Do NOT test styling, layout, or rendering minutiae
- Test:
  - state transitions
  - permission gating
  - mode-aware behavior

---

## 4. Prohibited Test Types (Strict)

The following tests are NOT allowed:

- Snapshot tests
- Shallow rendering tests
- Tests without assertions
- Tests that only assert “truthy” or “defined”
- Tests that mock core product rules

If a test mocks the rule it is supposed to enforce, it is invalid.

---

## 5. Test Naming & Structure

### Naming Rules

- `describe()` blocks MUST describe user or system behavior
- `it()` blocks MUST follow Given / When / Then semantics

Example:
```ts
describe("presenceService", () => {
  it("rejects presence updates when user is in Date Mode", () => {
    // ...
  });
});

Avoid:

vague names

technical jargon without behavior context

internal implementation references

6. Mapping Tests to Acceptance Criteria

Every backend feature MUST explicitly map tests to acceptance criteria.

For each Given / When / Then in docs/acceptance_criteria.md:

At least one test MUST exist

The test name MUST reflect the scenario

If Codex cannot map a test to an acceptance criterion, the test is incomplete.

7. Definition of “Test Complete”

A feature is NOT complete unless:

Tests exist for all acceptance criteria

Failure paths are covered

Coverage thresholds are met

Tests would FAIL if a rule is removed

Green tests that do not fail when rules are broken are considered false positives.

8. Codex-Specific Enforcement

When generating or modifying code, Codex MUST:

List which acceptance criteria are covered

List which tests enforce each criterion

Explicitly state which failure cases are tested

If this mapping is missing, the implementation must be rejected.

9. Final Rule

If a test suite passes while allowing:

mode leakage

privacy violations

unauthorized access

silent failures

Then the test suite is WRONG.

Passing tests do not imply correctness.
Rule enforcement implies correctness.