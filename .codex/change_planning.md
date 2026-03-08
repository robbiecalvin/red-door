# Change Planning Protocol

Before making code modifications, the agent must construct a **change plan**.

The goal is to ensure multi-file edits remain consistent and safe.

---

# Required Pre-Edit Steps

Before modifying code, the agent must:

1. identify all files potentially affected by the change
2. determine how those files interact
3. identify interfaces or shared utilities involved
4. design the minimal set of modifications required

The agent must not begin editing until this plan is clear.

---

# Change Map

For multi-file changes, the agent should construct a change map.

Example:

auth_middleware.py  
- fix null session handling

session_store.py  
- adjust validation logic

auth_tests.py  
- add test covering missing session case

This ensures all related modules are updated consistently.

---

# Interface Safety

When a change affects:

- function signatures
- exported modules
- API contracts

the agent must update all dependent code paths.

Partial updates are not allowed.

---

# Minimal Surface Area

The change plan should aim to minimize:

- number of modified files
- amount of modified logic
- architectural impact

Large-scale rewrites should only occur when explicitly requested.

---

# Verification After Edits

After applying changes:

1. confirm all imports resolve correctly
2. confirm interfaces remain compatible
3. run tests to verify system integrity