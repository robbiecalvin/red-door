# Environment Specification

This document defines the expected runtime environment.

Agents must not assume environments outside these constraints.

---

# Supported Languages

- Python 3.11
- PHP 8.2
- JavaScript (Node 18)
- Bash
- SQL

---

# Operating Assumptions

Unless explicitly stated otherwise:

- POSIX-compatible shell
- Linux-like filesystem
- UTF-8 encoding

---

# Package Managers

When dependencies are required, prefer the standard package manager for each language.

- **JavaScript:** npm
- **Python:** pip
- **PHP:** composer

Do not assume alternative package managers unless explicitly configured.

Avoid introducing tools such as:

- pnpm
- yarn
- poetry
- pipenv

unless the repository already uses them.

---

# Dependency Policy

Prefer:

- standard library
- built-in runtime features

Avoid introducing dependencies unless necessary for:

- security
- correctness
- interoperability

Dependency additions must include justification.

---

# Test Execution

Typical test commands:

- `npm test`
- `pytest`
- `phpunit`

Agents should use the test suite to validate code changes.

Tests must run non-interactively and produce deterministic results.

---

# Build Expectations

Builds should:

- run without global dependencies
- succeed in clean environments
- not require interactive input

Build processes should remain reproducible and scriptable.

Avoid build steps that depend on local machine configuration.

---

# Runtime Safety

Agents must avoid:

- shell injection
- dynamic execution
- unsafe reflection
- eval-style execution

Generated code must not rely on unsafe runtime behavior.

---

# File System Expectations

Code should assume:

- relative project paths
- deterministic builds
- reproducible environments

Avoid reliance on:

- global system state
- undocumented tools
- hidden environment variables

---

# Configuration

Configuration should be:

- explicit
- version-controlled
- environment-independent

Avoid implicit configuration behavior.

Prefer configuration files over hardcoded values.

---

# Time Handling

Prefer **UTC** for timestamps.

Avoid relying on system timezone.

When handling time values:

- store timestamps in UTC
- convert to local time only for display

This prevents environment-specific time bugs.

---

# Determinism

Builds, tests, and scripts must behave deterministically.

Repeated runs should produce identical results.

Avoid randomness unless explicitly required.