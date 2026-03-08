# Codex Engineering Governance

This directory defines the behavior and constraints for AI-assisted engineering work in this repository.

Agents must treat these documents as the authoritative guidelines for all engineering tasks.

---

# Instruction Hierarchy

If instructions conflict, follow the order defined in:

instruction_priority.md

Safety and guardrails always take precedence.

---

# Core Behavioral Guidance

model_instructions.md

Defines the expected mindset and engineering process the agent must follow when implementing changes.

Key areas:

- engineering mindset
- problem solving process
- debugging discipline
- dependency awareness
- minimal change philosophy

---

# Safety Rules

guardrails.md

Defines behaviors that must **never occur**, including:

- hallucinated APIs
- insecure code patterns
- secret exposure
- destructive operations without confirmation

These rules override all other instructions.

---

# Engineering Process

These documents guide how changes should be implemented.

debugging_playbook.md  
Structured workflow for diagnosing and fixing bugs.

task_template.md  
Standard workflow for implementing features and tasks.

change_planning.md  
Rules for planning multi-file edits and maintaining consistency.

---

# Repository Understanding

repo_map.md

Guides the agent in exploring the repository before implementing changes.

Prevents duplicate logic and incorrect module edits.

---

# Architecture and Design

architecture.md

Defines system design principles including:

- separation of concerns
- dependency direction
- module structure
- error handling strategy

---

# Environment Assumptions

environment.md

Defines runtime expectations such as:

- supported languages
- package managers
- build/test behavior
- deterministic execution

---

# Code Quality

code_style.md

Defines coding conventions and formatting expectations.

Ensures consistent style across:

- Python
- JavaScript
- PHP

---

# Pull Request Standards

pr_rules.md

Defines how changes should be packaged for review, including:

- commit message format
- PR description expectations
- testing requirements

---

# Complexity Control

anti_overengineering.md

Prevents unnecessary abstractions and framework-heavy designs.

Encourages simple and maintainable solutions.

---

# Agent Expectations

Agents must:

1. understand the task
2. explore relevant repository code
3. design minimal changes
4. implement safely
5. verify with tests
6. produce clear pull requests