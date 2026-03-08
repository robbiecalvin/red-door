# Architecture Guidelines

This repository follows a **clarity-first architecture philosophy**.

Code must remain understandable to engineers who did not originally write it.

---

# Core Principles

1. Prefer simple architectures over complex ones.
2. Prefer composition over inheritance.
3. Prefer explicit behavior over implicit behavior.
4. Prefer small modules with clear responsibilities.

---

# Separation of Concerns

When designing systems, maintain clear boundaries between:

### Domain Logic
Pure business logic.

- Independent from infrastructure
- Easily testable in isolation

### Infrastructure

External systems such as:

- databases
- APIs
- file systems
- message queues
- external services

Infrastructure must not contain business logic.

### Interfaces

Entry points into the system such as:

- HTTP handlers
- CLI commands
- UI components
- background jobs

Interfaces should coordinate work but avoid embedding domain logic.

---

# Module Structure

Modules should:

- have a single responsibility
- expose minimal public interfaces
- avoid circular dependencies

Prefer multiple small modules over large monolithic files.

---

# File Size Guidelines

Files should generally remain under **~500 lines**.

If a file grows beyond this size, consider splitting it into focused modules.

Large files reduce maintainability and increase cognitive load.

---

# Function Complexity

Functions should remain **small and focused**.

Prefer functions that perform a **single logical task**.

Avoid functions exceeding **~50 lines** unless necessary.

Large functions should be broken into smaller composable units.

---

# Dependency Direction

Dependencies should flow **inward toward domain logic**.

Infrastructure should depend on domain logic.

Domain logic must never depend directly on infrastructure.

---

# State Management

Avoid hidden state.

Prefer:

- explicit inputs
- explicit outputs
- immutable data where practical

Implicit state creates unpredictable behavior and difficult debugging.

---

# Error Handling Architecture

Error handling must be **explicit and consistent**.

Prefer returning structured errors rather than relying on implicit failure modes.

Do not swallow errors.

Failures should:

- propagate clearly
- include useful diagnostic context
- remain observable during debugging.

---

# Public Interface Stability

Public interfaces should remain stable.

Avoid breaking API contracts unless explicitly requested.

This includes:

- CLI commands
- HTTP endpoints
- exported modules
- public library APIs

Backward compatibility must be preserved whenever possible.

---

# Testing Relationship

Domain logic must be **easily testable**.

Design systems so that business logic can be tested without:

- databases
- external services
- network access

Prefer dependency injection or interface boundaries when required.

---

# Complexity Control

Avoid introducing:

- unnecessary abstraction layers
- speculative architecture
- framework-heavy patterns

Architecture must serve the problem, not impress the reader.

---

# Refactoring Expectations

Refactoring is allowed when it improves:

- clarity
- maintainability
- safety

Refactoring must **not change behavior** unless explicitly required.