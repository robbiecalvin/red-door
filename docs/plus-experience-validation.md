# Plus experience refresh

Validated 2026-11-15 on an isolated local backend. This change presents the existing Plus entitlements; it adds no paid features or dependencies and keeps the price at CAD $7.99/month.

- Interactive, explicitly labeled previews for filters/saved searches, Travel mode, private albums, conversations, and profile media.
- Accurate Free/Plus comparison; visible price, renewal terms, and checkout action. Billing management and album controls remain available.
- Contextual entry points for filters, Travel mode, chat invitations/pin limits, and profile video. Guest registration can start from Plus; the screen explains that guest conversations do not transfer.
- Active members see benefits and shortcuts rather than another subscription prompt. Paid billing periods and complimentary expiration use distinct wording.

Verification:

- `npm test -- --coverage=false`: 26 suites / 272 tests pass, including existing billing lifecycle and entitlement checks.
- `npm run typecheck`: pass.
- `npm run build`: pass; existing MapLibre size warning remains.
- Chromium: 320, 390, 768, 1440px; five previews, comparison, contextual filter opening, guest registration, disabled unconfigured checkout, one checkout request with a simulated redirect, active-member presentation, and Escape dismissal. No browser exceptions.
- No real payments were made. Checkout availability and active-member presentation used browser fixtures for those specific states; existing API tests cover entitlement enforcement. Live deployment cannot be verified from this restricted network.

Screenshots: `/workspace/artifacts/plus-preview-*.png`, `plus-free-member.png`, and `plus-active-preview.png`.
