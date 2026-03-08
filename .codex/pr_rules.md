# Pull Request Rules

These rules define how code changes must be packaged for review.

The goal is to produce pull requests that are **easy to review, safe to merge, and clearly justified**.

---

# PR Scope

Pull requests must be **small and focused**.

Each PR should address a **single logical change**, such as:

- fixing a bug
- implementing a feature
- refactoring a specific module
- improving tests

Avoid combining unrelated changes in a single PR.

---

# Commit Discipline

Commits must be:

- atomic
- logically grouped
- descriptive

Avoid commits that bundle unrelated changes.

---

# Commit Message Format

Use clear and concise commit messages.

Format:

<type>: <short description>

Examples:

fix: correct null handling in auth middleware  
feat: add retry logic for API client  
refactor: simplify cache invalidation logic  
test: add coverage for edge cases in parser

---

# PR Description

Pull requests must include a clear description containing:

1. **What changed**
2. **Why the change was necessary**
3. **How the change was implemented**

Descriptions should be concise and factual.

---

# Bug Fix PRs

Bug fix pull requests must include:

- root cause explanation
- description of the fix
- confirmation that tests pass

If tests did not previously cover the bug, the PR should include a new test.

---

# Refactoring PRs

Refactoring pull requests must:

- preserve existing behavior
- include no functional changes
- explain the motivation for the refactor

Large refactors should be split into multiple PRs when possible.

---

# Test Expectations

Changes affecting logic must include appropriate tests.

Prefer:

- extending existing tests
- adding targeted tests for edge cases

Avoid redundant test suites.

---

# Reviewability

PRs should be easy to review.

Avoid:

- extremely large diffs
- unrelated formatting changes
- unnecessary file modifications

Small, focused diffs are preferred.

---

# CI Expectations

Before submission, ensure:

- tests pass
- builds succeed
- code compiles
- no linting errors occur (if linting is used)

Pull requests must not break CI.

---

# Safety Rule

If a change could impact:

- public APIs
- database schema
- authentication
- authorization

The PR description must explicitly mention the impact.