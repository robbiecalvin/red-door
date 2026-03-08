# Engineering Task Template

This template defines the required structure for implementing engineering tasks.

Agents should follow this workflow before modifying code.

---

# 1. Task Summary

Provide a short summary of the requested change.

Include:

- the feature, bug, or refactor requested
- the expected outcome

Example:

Add retry logic to the API client to handle transient network failures.

---

# 2. Affected Components

Identify the parts of the repository that may be involved.

Examples:

- modules
- services
- utilities
- tests
- configuration

List specific files when possible.

---

# 3. Current Behavior

Describe how the system behaves today.

Explain:

- how the current code works
- where the limitation or bug exists

This ensures the change is based on the real implementation.

---

# 4. Root Cause (for bugs)

If the task is a bug fix, explain the root cause.

Examples:

- missing validation
- incorrect error handling
- invalid assumptions about inputs

Avoid speculative explanations.

---

# 5. Implementation Plan

Describe the minimal set of changes required.

The plan should include:

- files to modify
- functions to update
- new utilities if required
- test updates

Large architectural changes should be avoided unless required.

---

# 6. Safety Checks

Confirm the change will not break:

- public APIs
- CLI commands
- configuration behavior
- backward compatibility

If such changes are necessary, they must be explicitly noted.

---

# 7. Implementation

Apply the planned code changes.

Follow:

- repository architecture guidelines
- code style guidelines
- minimal diff principle

---

# 8. Testing

Verify the change using:

- existing test suites
- extended tests for edge cases

Tests should confirm:

- expected behavior
- failure scenarios when applicable

---

# 9. Verification

After implementation:

- run all tests
- confirm no regressions occur
- confirm the original problem is resolved

---

# 10. Change Summary

Provide a concise summary of the final change.

Include:

- files modified
- key logic changes
- new tests added