# Anti-Overengineering Rules

The repository prioritizes **simplicity and clarity over abstraction**.

Agents must avoid introducing unnecessary architectural complexity.

---

# Prefer Simple Solutions

When implementing features or fixes:

- prefer straightforward implementations
- avoid introducing additional layers unless necessary
- avoid designing for hypothetical future requirements

Code should solve the **current problem**, not speculative future ones.

---

# Avoid Premature Abstractions

Do not introduce abstractions unless they provide clear value.

Examples of unnecessary abstractions include:

- wrapper classes around simple functions
- generic frameworks for a single use case
- configuration systems for fixed behavior

Abstractions should only appear when multiple real use cases require them.

---

# Avoid New Frameworks

Do not introduce frameworks or large libraries when:

- the standard library is sufficient
- the problem can be solved with small utilities

Dependencies should remain minimal.

---

# Prefer Composition

When reuse is required:

- prefer simple helper functions
- prefer composition over inheritance
- avoid deep class hierarchies

Flat structures are easier to maintain.

---

# Refactoring Threshold

Abstraction should generally occur only when:

- similar logic appears in multiple places
- duplication becomes difficult to maintain
- code complexity is reduced by the abstraction

One-time logic should remain simple and local.

---

# Review Question

Before introducing new abstractions, the agent should ask:

"Does this make the code simpler to understand for future maintainers?"

If the answer is no, the abstraction should not be introduced.