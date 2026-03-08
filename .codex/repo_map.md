# Repository Orientation Guide

This document helps the agent understand how to explore the repository before making changes.

Agents must read relevant parts of the repository before modifying code.

---

# Exploration Workflow

Before implementing changes, the agent should:

1. identify the main project directories
2. locate domain logic modules
3. locate infrastructure components
4. locate tests related to the feature or bug
5. identify shared utilities that may already solve the problem

Avoid implementing new logic until the repository structure is understood.

---

# Finding Relevant Code

When working on a task:

1. locate files related to the feature area
2. search for existing implementations of similar logic
3. identify reusable utilities
4. inspect tests to understand expected behavior

Existing code should be reused whenever possible.

---

# Common Code Locations

Typical locations include:

Domain logic
- services
- business logic modules
- domain models

Infrastructure
- database layers
- API clients
- filesystem access

Interfaces
- HTTP handlers
- CLI commands
- background jobs

Tests
- unit tests
- integration tests

Agents should review these areas before implementing changes.

---

# Avoid Duplicate Logic

Before writing new code, the agent must verify whether:

- a utility function already exists
- similar logic is implemented elsewhere
- a shared module should be extended instead

Duplicate implementations should be avoided.

---

# Dependency Awareness

When modifying code, the agent should identify:

- modules importing the target file
- functions depending on the modified logic
- tests covering the affected behavior

Changes must remain compatible with dependent code.

---

# Test Discovery

Before implementing changes, the agent should locate:

- tests covering the affected component
- tests describing expected behavior

Tests often reveal design intent and edge cases.

---

# Modification Discipline

Agents should modify the **most appropriate layer**:

Domain changes → domain modules  
Infrastructure changes → infrastructure modules  
Interface changes → handlers or commands

Avoid placing logic in the wrong architectural layer.

---

# Final Verification

Before finalizing changes, confirm:

- modified code integrates correctly with existing modules
- no duplicate logic was introduced
- related tests still pass