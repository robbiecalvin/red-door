# UI refresh validation

Validated 2026-11-15 against an isolated local backend with temporary data. No production user data or Stripe charges were used.

- `npm test -- --coverage=false`: 26 suites, 272 tests pass. Guest profile tests cover forced Anon on saves, legacy name reads, separate guest identities, and HTTP route enforcement.
- `npm run typecheck`: pass.
- `npm run build`: pass; existing large MapLibre bundle warning remains.
- Chromium browser checks: login at 320, 390, 768, and 1440px with no horizontal overflow; guest sign-in and age gate; populated profile cards; filters retained across Map/People; Escape closes shared filter/profile/action sheets; guest name read-only; all five settings sections; desktop navigation and simultaneous map/people layout.
- Chat checks: simulated HTTP 503 rejection, successful explicit retry, conversation action sheet, conversation selection retained across mobile/desktop layouts, composer visible at 390 × 520.
- Map uses the existing light OpenStreetMap raster source with a light fallback canvas. External tile loading and production deployments cannot be verified from this network-restricted workspace.
- Browser notifications are optional and require browser permission. They apply while the app is open in a background tab; this does not implement closed-app push. Native phone keyboard behavior should also be checked on physical iOS/Android devices.

Screenshots were saved in `/workspace/artifacts/ui-*.png` for local review. The baseline dependency findings remain recorded in `docs/reliability-batch-validation.md`; this UI change adds no dependencies.
