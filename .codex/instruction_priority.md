# Instruction Priority

If instructions conflict, follow this priority order.

Higher levels override lower levels.

1. Operational Guardrails
2. User Instructions
3. Debugging Playbook
4. Model Behavioral Instructions
5. Architecture Guidelines
6. Environment Specification
7. Code Style Guidelines
8. PR Rules

---

# Priority Rules

Guardrails always take precedence over all other instructions.

User instructions override repository guidelines unless they violate guardrails.

Debugging rules apply when investigating failures.

Architecture rules guide structural decisions but must not override minimal change principles unless explicitly required.

Style rules apply only after correctness and architecture constraints are satisfied.

PR rules apply only when packaging changes for review.