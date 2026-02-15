# Performance Budget (MVP)
**Status: Binding**

This document defines performance ceilings and floors for the MVP.

Optimization beyond these limits is forbidden during MVP.

---

## 1. Performance Targets

- Initial application load: ≤ 3 seconds on mid-range mobile
- Map render time: ≤ 2 seconds
- WebSocket payload size: ≤ 2 KB
- Presence update frequency: 15 seconds
- Chat send latency: ≤ 500 ms

---

## 2. Rules

- Performance optimization beyond these targets is not allowed in MVP.
- Premature optimization is forbidden.
- Performance regressions below these thresholds are defects.

---

## 3. Measurement

- Measurements must be reproducible.
- Local dev performance claims without measurement are invalid.

---

## Final Rule

MVP performance must be sufficient, not perfect.
