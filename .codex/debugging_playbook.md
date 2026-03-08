# Debugging Playbook

This document defines the required process for diagnosing and fixing bugs.

The goal is to ensure fixes address the **root cause**, not just the symptoms.

---

## Debugging Principles

When a bug occurs:

- do not guess
- do not apply speculative fixes
- do not modify multiple areas without justification

Every fix must be based on **evidence from the codebase or runtime behavior**.

---

## Required Debugging Workflow

The agent must follow this sequence:

1. reproduce the failure
2. examine error messages and stack traces
3. identify the failing component
4. trace the execution path leading to the failure
5. determine the root cause
6. implement the smallest possible fix
7. verify the fix with tests

Skipping steps is prohibited.

---

## Failure Reproduction

Before modifying code, the agent must:

- identify the failing test or runtime error
- reproduce the failure deterministically
- confirm the failure occurs before making changes

If the failure cannot be reproduced, the agent must stop and report uncertainty.

---

## Evidence Collection

The agent should collect evidence such as:

- stack traces
- failing assertions
- incorrect return values
- invalid state transitions

Changes must be justified by observed evidence.

---

## Root Cause Identification

A bug fix must address the **root cause**, not the visible symptom.

Examples:

**Symptom fix (incorrect):**

- add try/catch around failing code

**Root cause fix (correct):**

- correct invalid input validation that caused the failure

---

## Minimal Fix Rule

After identifying the root cause:

- implement the smallest possible fix
- avoid unrelated refactoring
- avoid modifying multiple modules unnecessarily

Large edits increase regression risk.

---

## Verification

After implementing a fix:

1. run the failing tests
2. run related tests
3. confirm no regressions occur

If tests do not exist for the bug scenario, the agent should:

- extend existing tests
- add a minimal test covering the failure case

---

## Regression Prevention

Bug fixes should include test coverage for:

- the failure scenario
- nearby edge cases when relevant

This ensures the bug does not reappear later.

---

## Uncertain Diagnoses

If the root cause cannot be determined with confidence, the agent must stop and report:

- the observed symptoms
- possible causes
- missing information required to proceed