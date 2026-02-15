# Security Threat Model (Baseline)
**Status: Binding**

This document defines the minimum assumed threat environment.

If code assumes a cooperative client, it is incorrect.

---

## 1. Assumed Threats

Assume:

- Malicious clients
- Spoofed requests
- Replayed messages
- Tampered payloads
- Location manipulation attempts

---

## 2. Security Rules

Therefore:

- Client-provided mode MUST NOT be trusted
- Client-provided identity MUST NOT be trusted
- Client-provided coordinates MUST NOT be trusted
- All permissions MUST be validated server-side
- All actions MUST be bound to session identity

---

## 3. Forbidden Assumptions

- That clients behave correctly
- That UI prevents abuse
- That malformed requests are rare

---

## 4. Testing Requirement

Security assumptions MUST be enforced by tests.
Tests MUST FAIL if validation is removed.

---

## Final Rule

Trust nothing from the client.
Validate everything on the server.
