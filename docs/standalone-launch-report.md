# Standalone launch execution report

Date: November 16, 2026 (America/Vancouver).
Repository: robbiecalvin/red-door. Branch: `work`.
Baseline commit: `033ddb710301310d1e03959676aa0ed5f6f994eb`.
Tests below ran against the modified local source based on that commit; baseline CI
is not evidence for this patch. Implementation commit: `85597e1315a65045eff0250e107dbc93403bc9dc`. Validation ran against the identical implementation immediately before that local commit. This subsequent report update records its SHA and changes no application code.
Environment: Codex Cloud Linux, Node 24.22.1, npm 11.9.0, Chromium via Playwright;
isolated JSON storage, real TLS SMTP fixture, local Stripe HTTP fixture and the
PGlite PostgreSQL engine. No production data, credentials, charges or deployment.

PASS means only the explicitly tested scope passed. BLOCKED means a prerequisite
or access is missing. NOT RUN means no such rehearsal was performed. No legal,
age-assurance, payment-provider or app-store approval is claimed.

## Changes and affected files

- `backend/src/server.ts`: no bridge import/registration; consistent disabled MD
  boundaries, including API aliases; legacy listings and provider tutorials unavailable;
  no MD realtime events; standalone diagnostic requirements; actual email ownership,
  optional phone, production mail availability errors, adult registration validation,
  auth request limits, generic mail logging and a staging Stripe test-key guard.
- `backend/src/services/authService.ts`: email-only verification mode, persisted
  send/guess windows, cooldown, successful ownership provenance and stricter age
  values. Existing verified records are preserved without inventing provenance.
- `backend/src/repositories/postgresCore.ts` and `postgresAuthStateRepository.ts`:
  additive verification_security migration/roundtrip; PostgreSQL TLS validates certificates.
- App/Router, PlusShowcase/BillingSettings/MemberPanels/AdminLaunchChecks, `shared/plus.ts`
  and main.tsx: remove MD UI/benefits/tutorials/deep-link access and improve email/age
  wording. Old integration modules and data remain preserved and unregistered.
- `MapView.tsx`, mapConfig/mapRecovery/map.css, CruiseMap and Vite launchers: real dark
  vector style, validated public configuration, bundled worker, bounded recovery,
  mounted canvas, People fallback and lifecycle cleanup. No CSS inversion of the map.
- `frontend/src/app/location.ts` and Router: GPS denial never publishes the default
  camera as presence; synthetic self-marker removed.
- `frontend/src/app/request.ts` and api.ts: 20-second response/body deadline, safe
  recoverable errors, no automatic mutation retries.
- Tests/fixtures: actual TLS mail verification/recovery, disabled-route network/data
  isolation, age boundaries, persisted verification security (files and PostgreSQL),
  map retry bounds, timeout behaviour, database TLS and promotion time boundary.
- `scripts/check-*-browser.*`: reproducible loopback browser checks;
  `test-production-install.cjs` also checks safe unavailable recovery without SMTP.
- package.json/lockfile: pinned development-only PGlite and playwright-core for
  PostgreSQL and browser verification. No new runtime/billing/native dependency.
- `.env.example`, README, launch-readiness.md and companion documents describe the
  new defaults, historical evidence, provider/device gates and staged operations.
- `deploy/render.staging.yaml`: undeployed single-instance staging template with
  independent credentials, disk and auto-deploy disabled. Importing can incur costs.

## Completion matrix

| Brief section / work item | Status | Evidence and limits |
| --- | --- | --- |
| P0 MD inventory/isolation | PASS locally | Navigation, panels, settings, tutorials/promotions, Plus stories, direct routes, callbacks, realtime, diagnostics and launch CLI inventoried. Bridge not registered/imported. All known HTTP boundaries deny before integration code; no upstream requests or integration-data change in regression test, even with old MD variables present. |
| Standalone ordinary functionality | PASS locally | Registration/verification, guest restrictions, ordinary messaging, settings, admin restrictions, safety, Plus and restore suites pass with MD unavailable. No live MD feature was connected or exercised. |
| P0 production email requirements/safe recovery | PASS locally | Required SMTP/public-URL fields documented; no-SMTP production-install check returns safe 503. Actual application mails reach a local authenticated TLS SMTP fixture. |
| Hosted verification/recovery delivery | BLOCKED | No SMTP/hosting credentials, controlled external inbox or secure bindings; external delivery and correct deployed HTTPS links not verified. SMTP acceptance alone is not delivery proof. |
| Reset expiry/reuse/password/session revocation | PASS locally | passwordRecovery, emailDelivery and apiSmoke test invalid/expired/replaced/reused links, changed password, HTTP revocation and websocket/JWT rejection. Known/unknown reset responses match. |
| P0 ordinary email ownership | PASS locally | Server no longer enables skipEmailVerification. New accounts cannot log in before code proof; email is destination even when phone supplied. Codes/attempts persist in JSON/PostgreSQL; expiry, replay, guessing limits/cooldown and admin restrictions tested. |
| Legacy ownership status | PASS for compatible preservation; rollout NOT RUN | Unknown historical provenance is preserved. New ownership evidence recorded; private cohort-count SQL and voluntary re-verification design documented. Legacy re-verification endpoint/rollout is planned, not implemented. |
| Age technical gates | PASS locally | Server registration and age endpoint reject missing, string, fractional, over-range and under-18 values. Browser rejects underage guest and accepts adult declaration. Restored registered sessions without a declaration now see the gate. |
| Stronger age assurance/legal decision | BLOCKED | Numeric declaration is not independent age/identity verification. Required assurance and privacy design need owner/legal/host/provider decisions. |
| P1 standalone Plus lifecycle | PASS in local fixture | CAD 7.99 monthly price checks, signed webhooks, account association, entitlement persistence, unpaid/abandoned checkout, duplicate events, renewal/expiry/cancel, explicit enrollment consent, scheduled cancellation and replay after restore are covered. Checkout return alone grants no access. Vancouver expiry retained; current timezone regression test passes. |
| Hosted Stripe sandbox/test clocks/provider eligibility | BLOCKED | No staging Stripe/provider credentials or access. No live payment, hosted test-clock result or business eligibility determination. Test-mode staging guard and operator runbook supplied. |
| P1 storage inventory/single writer | PASS source audit | Database/local/object table in hosting-growth-plan.md. Public boards/spots still require local storage; no multi-instance safety claim. |
| Controlled persistence/restart/isolated restore | PASS locally | Isolated restart and offline backup/restore preserve accounts, Plus/promo/cancellation state, profiles/privacy, favorites, private chats, media bytes/references, reports, blocks, plans/RSVPs. Local mode requires re-login. PostgreSQL verification migration runs twice and restores lockouts/evidence. |
| Hosted disk, database/S3 restoration, retention/encryption | BLOCKED | No provider access or configured external storage. Flag is not mount proof. Remote objects, secrets, database backup/restore and actual access/retention controls need operator rehearsal. Proposed policy is explicitly not an implemented backup service. |
| P1 core safety/user flows | PASS locally within tested paths | Cross-account messaging, read state, retention, block/contact rejection, hidden-profile discovery, reporting/moderator access, private media authorization/revocation, reset revocation and local recovery covered by existing integration suite. |
| Hosted multi-account flows/reconnect/delivery | BLOCKED | No controlled hosted accounts/provider bindings and API egress blocked. Local fixtures do not prove deployed behaviour. |
| P1 startup/failure UX | PASS locally | 20-second API/body timeout, no implicit mutation retries; map watchdog/backoff/People fallback. Browser local guest-entry timing 170 ms in one run, not host startup. Existing client message IDs protect message retries. |
| Hosted latency/root cause/CORS/API/WSS | BLOCKED | Both existing site/API requests hit enforced egress CONNECT 403. No Render logs/plan; no cause assigned to handoff timeout. Origins documented but deployed values not inspected. |
| P1 physical iOS/Android rehearsal | NOT RUN | No physical devices. Chromium viewport tests are not iOS Safari/Android device evidence. Operator scenarios in mobile-release-plan.md. |
| P1 dark map/source configuration | PASS implementation; external rendering BLOCKED | OpenFreeMap dark vector style selected from official repo docs; public HTTPS override, no key/payment. Bundled worker fixes reproduced startup failure. Actual hosted roads/labels/tiles cannot be verified through this network. |
| Map recovery/lifecycle | PASS for exercised Chromium cases | Real MapLibre renderer with controlled background style: 520 ms initial render; single canvas, StrictMode, rotation, rapid unmount/remount, offline/online, failed style/bounded retries, manual recovery, context loss/restoration, no uncaught page errors. See map-provider-and-recovery.md. |
| Map remaining failures/phones | NOT RUN/BLOCKED | Glyph/sprite/vector-tile errors individually, actual provider visual contrast/attribution across zooms, phone WebGL/background/resume and real slow-provider first render remain. No external-provider guarantee. |
| Location denial/default view | PASS locally | Actual browser denial produced zero presence POSTs. Default camera labelled and does not fabricate/publish a location. Travel remains an explicit choice. |
| P2 current URLs | BLOCKED | Read-only attempts to both known URLs were denied by this environment's egress proxy; no host failure inference. |
| P2 origin/domain preparation | PASS locally; owned-domain cutover BLOCKED | Existing public/API/WSS build/runtime variables retained and staging instructions supplied. No domain purchase, ownership/DNS/HTTPS assumption or public change. |
| P2 checks/documentation | PASS locally | Commands below; new report/hosting/mobile/email/map docs; historical launch doc marked as historical. |
| Phase 2 Stage A | PASS planning/template; hosted execution BLOCKED | Inventory, storage audit, single-writer staging config, monitoring/budget worksheet, current-price/access limitations, retention proposal and owner steps supplied. No provider account plan, live quote or eligibility verified. |
| Phase 2 Stage B | PASS audit/plan; implementation and two-instance/load tests NOT RUN | Snapshot overwrites/deletes, process-local maps/fanout/rate limits/jobs and attached-disk constraints documented. Must be redesigned and verified before scaling; no speculative architecture rewrite enabled. |
| Phase 2 migration | PASS runbook; cutover NOT RUN | Measured-need gate, controlled staging, backup/write freeze, checksums, configuration, monitoring and write-reconciliation rollback documented. No production migration. |
| Phase 3 eligibility | BLOCKED at checkpoint | Current cruise/anonymous/adult UGC product has material store-policy risks. Current policy pages blocked; owner review/substantive product decision needed before packaging. No wrapper approval claim. |
| Phase 3 native implementation/build/signing/submission | NOT RUN/BLOCKED | App ID, eligibility, current platform requirements, compatible macOS/Xcode, phones, developer accounts, signing and native billing missing. Registry confirms Capacitor CLI 8.6.2 requires Node >=22. Conditional implementation and submission runbook delivered. No projects generated under a guessed identifier. |

## Exact validation and observed results

Run from `/workspace/red-door`:

| Command | Outcome |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test:coverage` | PASS: 36 suites, 326 tests; no skipped tests or snapshots |
| Coverage thresholds | PASS: statements 94.42%, branches 87.05%, functions 96.70%, lines 98.84%; mode/presence/matching 100% each |
| `npm run build` | PASS; separate hashed MapLibre worker asset included; known >500 kB bundle warning remains |
| `npm run test:production` | PASS: clean omit-dev install, no Vite, production backend health/config and safe missing-SMTP recovery |
| `npm audit --omit=dev --audit-level=high --cache /tmp/reddoor-npm-cache` | PASS: zero production vulnerabilities |
| `npm audit --audit-level=high --cache /tmp/reddoor-npm-cache` | PASS high threshold; seven LOW findings through existing Jest/deepmerge tooling; not zero total findings |
| `git diff --check` | PASS |
| `node scripts/check-map-browser.cjs` | PASS controlled renderer/recovery cases; fixture initial render 520 ms |
| `node scripts/check-entry-browser.cjs` | PASS mobile viewport, age, denied GPS/no fabricated presence, no MD navigation/deep-link request, zero uncaught errors; guest entry 170 ms |
| `node --import tsx scripts/check-registration-browser.ts` | PASS: mobile registration, wrong-code error, local TLS email code, correct verification and authenticated UI; external inbox NOT TESTED |

The map/entry scripts require the isolated local dev stack already running. The
registration script creates its own loopback backend/Vite and TLS SMTP fixture,
then cleans them up. Browser checks use Chromium/software WebGL, not phones.
No lint script exists; typecheck is not described as a formatter/linter.

Current primary sources: OpenFreeMap/openfreemap-styles official GitHub READMEs and
the npm registry for Capacitor. Render, Apple, Google and Capacitor websites were
blocked. Current pricing, developer fees and provider/store acceptance are not verified.
The handoff's CI run 43742609236 is a baseline historical reference only; no new
remote CI was triggered or claimed for this patch.

## Test-to-acceptance mapping

- Standalone disabled boundaries/no traffic/no mutation: apiSmoke standalone test;
  browser entry/deep-link check; MD variable presence does not activate registration.
- Email ownership/admin safety/code expiry/attempt persistence: standaloneAuth,
  authService, postgresVerification + actual PostgreSQL fixture, emailDelivery,
  browser registration. Invalid code, replay, lockout, resend cooldown and expired
  codes are rejected; phone is not email evidence.
- Recovery/password/session revocation: passwordRecovery, emailDelivery and
  apiSmoke HTTP/websocket/JWT checks; production-install covers no SMTP.
- Age/mode/privacy: apiSmoke invalid/missing age; standaloneAuth; location;
  modeService/presenceService/matchingService tests; browser denial produces no write.
- Chat, block/report/private media and persistence: apiSmoke cross-account safety,
  backup/restart/restore drill; chatService/blockService/reportService/mediaService.
- Plus signed lifecycle/consent/idempotency/promo expiry: apiSmoke billing tests,
  subscriptionService, renewal parameters tests and standaloneAuth Vancouver boundary.
- Failure UX: request tests stall both headers and body without replaying POST;
  mapRecovery finite timers/offline/fatal/disposal; browser actual worker/render lifecycle.

## Operator actions and why they remain

1. Allow the required external hosts in the cloud network settings before rerunning
   read-only hosted/provider checks: `red-door-api.onrender.com`,
   `robbiecalvin.github.io`, `tiles.openfreemap.org`, `openfreemap.org`, `render.com`,
   `capacitorjs.com`, `developer.apple.com`, `support.google.com`. Preserve other rules.
   CONNECT 403 here is a platform restriction, not a provider diagnosis.
2. Review the staging template/costs/terms, provision isolated resources only when
   authorized, and enter required database/mail/Stripe values in secure host settings.
   No secret values belong in chat. Set test-mode Stripe keys/price/webhook and an
   HTTPS frontend PUBLIC_APP_URL, CORS and matching API/WSS origins.
3. Deliver verification/recovery email to a controlled external inbox; follow links
   and demonstrate password change plus HTTP/realtime revocation. Then perform hosted
   Stripe checkout/webhook/test clocks/portal/cancel/replay cases.
4. Verify actual disk mounts, PostgreSQL/S3 backups and private off-host retention;
   restore into empty staging and measure RPO/RTO. Keep one backend writer.
5. Perform hosted two-account privacy/safety/media/reconnect scenarios and physical
   iOS Safari/Android Chrome rehearsal; measure real first-render/API timings.
6. Resolve age assurance, host/payment/store eligibility, current quotes and domains.
   Mobile packaging waits for eligibility, an approved app identifier and supported
   macOS/Android tooling; stronger assurance is not supplied by numeric age input.

## Rollback without deleting user data

Keep a verified private backup before any later staging/production change. This task
made no production changes. Locally, revert the launch commit on a new review branch;
do not reset other work, remove backend/.data or restore over a nonempty database.
The verification_security column is additive and can remain during rollback; do not
drop it or clear ownership evidence. Preserve current auth/Plus/media/safety records.

Reverting all code would restore the old auto-verification and MD registration,
which are unsuitable standalone defaults. If rolling back a UI/map change, retain
MD isolation and email gates, or keep the release offline until reviewed. For a
host cutover, follow the hosting plan's write-freeze and write-reconciliation steps;
DNS rollback does not reconcile database writes. No production rollback was run.

## Technical release recommendation

Controlled beta: suitable for an isolated local/staging rehearsal with controlled
adults after staging provider permissions/configuration are supplied, with one writer,
verified backup, working hosted mail and explicit knowledge of untested map/device
behaviour. This is not approval to expose it publicly or take payments.

Public paid launch: HOLD. Hosted email/recovery and billing lifecycle, mounted storage
and backup recovery, actual provider map rendering, hosted safety/reconnect flows,
physical phones, age-assurance requirements and business/provider eligibility remain
unverified. Pricing, production account settings and current store rules were not
assessed successfully. Native store delivery is a separate blocked decision.
