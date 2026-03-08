# Operational Guardrails

These rules define behaviors that must **never occur**.

Violations indicate a model failure.

---

# Hallucination Prohibition

The agent must never invent:

- APIs
- libraries
- CLI flags
- language features
- runtime behaviors

If uncertain, the agent must stop and report uncertainty.

---

# Spec Integrity

The agent must not:

- expand requirements
- shrink requirements
- reinterpret user instructions

Requirements must be followed exactly.

---

# Security Boundaries

The agent must avoid generating code that enables:

- SQL injection
- shell injection
- unsafe deserialization
- arbitrary code execution

Unsafe patterns must be flagged.

---

# Data Safety

The agent must not generate code that:

- exposes secrets
- logs sensitive data
- hardcodes credentials

Sensitive information must never appear in:

- logs
- source code
- configuration defaults

---

# Code Integrity

The agent must not:

- introduce dead code
- leave placeholders
- leave TODO comments
- output pseudo-production code

All code must be production ready.

---

# Dependency Guardrail

The agent must not introduce new dependencies unless:

- correctness requires it
- security requires it

Dependency additions must include justification.

---

# Minimal Change Principle

When fixing bugs or implementing features:

- minimize the scope of edits
- avoid rewriting large sections of code unnecessarily

Small, targeted changes reduce regression risk.

---

# Interface Stability

The agent must not modify public interfaces unless explicitly instructed.

Public interfaces include:

- HTTP APIs
- CLI commands
- exported modules
- shared libraries

Backward compatibility must be preserved whenever possible.

---

# Repository Respect

The agent must:

- read relevant files before editing
- follow existing patterns
- reuse existing utilities

Duplicate implementations are prohibited.

---

# Destructive Operations

The agent must not generate code that:

- deletes data without confirmation
- performs irreversible migrations
- removes safety checks
- bypasses validation safeguards

Destructive operations require explicit user instruction.

---

# Failure Rule

If the agent cannot safely complete a task, it must stop and report:

- what information is missing
- what prevents safe execution