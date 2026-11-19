# Launch readiness: current URLs

> Historical rehearsal notes follow. For the current standalone scope and evidence, use [standalone-launch-report.md](standalone-launch-report.md). MD is disabled; prior MD checks are not standalone acceptance requirements.

Updated November 15, 2026 (America/Vancouver). Domains are not required for these checks. This records evidence, not an estimated completion percentage.

## Current Phase 5 rehearsal

Use the production site at `https://badehausx.com/` for read-only deployment checks and controlled signup, and a separate Stripe test-mode deployment for money flows. Hosted signup and inbox delivery were confirmed by the owner. Livestreaming is listed as **Coming soon** during this release.

| Gate | Pass evidence |
| --- | --- |
| Release | GitHub Pages `/build-sha.txt` and Render's Live deploy show the intended commit. The administrator launch panel loads with the expected backend configuration. |
| Billing | Standard, Founder, flyer renewal, and Priority referral test prices map to the intended offers. Confirm the charge or setup, signed webhook, membership, cancellation, and renewal failure. Confirm a paid referral produces one commission and a refund updates the same ledger entry. |
| Devices | With two controlled registered accounts across iPhone Safari and Android Chrome, verify signup, map and Right Now, messaging, private-album approval and revocation, block/report, install, and update. Record model, OS, build SHA, result, and the failing step. |
| Privacy and moderation | Verify that an ordinary account cannot open admin controls and that a moderator can read a submitted report and act on the reported account. Identify the support inbox and person responsible for reviewing and escalating reports. |
| Policies and rollback | Record approval of the Terms and Privacy Policy and their final versioned URLs. Confirm who owns deploying and rolling back, retain the last known good frontend/backend commits, and verify recoverable backups. |

Launch approval follows the above gates. Newsletter sends, live broadcasts, and payouts require their own rollout decisions.

## Completed in the isolated rehearsal

| Area | Evidence | Limit |
| --- | --- | --- |
| Production installation | Clean `npm ci --omit=dev` followed by backend startup under `NODE_ENV=production` serves health/config | Isolated local storage; no hosted credentials |
| Core app | 309 tests across 31 suites, TypeScript and production build pass | Does not establish hosted deployment health |
| Billing | Canonical Stripe API fixtures cover checkout, paid/unpaid invoices, renewal failure, cancellation, fixed promo expiry, setup consent, January schedules and replay protection | No actual Stripe Checkout session or payment was made |
| Email | Actual authenticated TLS SMTP fixture receives administrator verification and password-reset emails; tests reject wrong codes, reset replay, old passwords, revoked sessions and an unavailable mail server | No delivery through the production mail provider or external inbox |
| Persistence | Real backend stopped/restarted, private offline backup made, restored into a new directory, and the backend started against the restored copy | Local JSON/object path tested; hosted PostgreSQL/S3 not connected |
| Restored data | Profiles, Plus, promo ledgers/tutorial, MD keys/nonces, billing cancellation/replay protection, interests/privacy, favorites, private messages, media, reports, blocks, plans and RSVPs | Local mode requires a new login after a restart; PostgreSQL also persists sessions |
| Privacy | Hiding a free profile immediately broadcasts its removal to other map clients; backend discovery continues enforcing hiding | Hosted multi-client rehearsal remains |
| Browser | Chromium at 320, 390, 768 and 1440 pixels, guest Anon flow, settings, filters, map, messaging retries, short viewport composer, MD code/return/chat fixture | Emulated viewports, not physical iOS/Android phones; map tile network is restricted |
| Security | Updated MapLibre, Nodemailer, ws, Vite/React plugin and compatible transitive dependencies; production dependency audit has zero findings | Remaining low-severity development-tool advisories are documented below |

The production installation rehearsal exposed runtime packages being declared as development-only. The backend runner, JWT and WebSocket libraries now install with production dependencies; `npm run test:production` checks this in CI.

The restart drill exposed favorites being held only in memory. Favorites now use the community repository (PostgreSQL or private local JSON), and successful toggle responses await their persistence. Auth-file writes now replace atomically with owner-only permissions. Shutdown also waits for pending guest/safety/favorite/community writes. The map initialization now rejects an async load belonging to an already-cleaned-up effect, preventing duplicate canvases after remounts.

## Hosted checks currently blocked

Read-only connection attempts to the current API, frontend, Stripe and the supplied MD website were rejected by this task's enforced network proxy (CONNECT 403). No production Stripe, SMTP, database, MD shared-secret or administrator-session bindings are available in this environment. This is **not** evidence that Render, Stripe or Netlify is misconfigured.

- Badehaus X frontend: `https://robbiecalvin.github.io/red-door/`
- Badehaus X API: `https://red-door-api.onrender.com`
- MD website supplied by the owner: `https://jade-chebakia-c21282.netlify.app/`
- MD deployed **API base URL and implementation status remain unverified**. Do not assume the website root is its API base.

To run the hosted checks in this environment, its network settings need to allow the frontend/API/MD hosts and the actual external services under test. Add credentials through secure environment/hosting settings, never in chat, committed files, frontend variables or CLI arguments. Alternatively run the checked-in launch script from an authorized machine with the same network access.

`npm run launch:check -- --md-site-url https://jade-chebakia-c21282.netlify.app/`

The command performs read-only checks. It inherits the proxy and CA settings through curl, prints only status information, and never sends a Stripe charge. Set `REDDOOR_ADMIN_SESSION_TOKEN` privately for authenticated backend diagnostics; `REDDOOR_API_URL` and `PUBLIC_APP_URL` can select a staging deployment. Optional `--output /private/launch-check.json` saves the sanitized report. Exit codes: 0 for automated checks passed, 1 for a failed/unreachable check, 2 for incomplete configuration. Automated checks never replace the manual launch gates.

## Administrator diagnostics

Administrators can open **Settings → Account → Launch readiness → Run launch checks** in the app; no terminal or copying a session token is needed.

`GET /admin/launch/health` requires an authenticated administrator session in `X-Session-Token`; unauthenticated/ordinary users are rejected. It checks:

- Actual PostgreSQL connectivity, when configured.
- SMTP connection/TLS/authentication with Nodemailer's `verify()`; this does not send an email or prove inbox delivery.
- Actual Stripe price retrieval, CAD 799/month validation, test/live mode and configuration presence.
- MD configuration validity only; it does not assert cross-platform connectivity.
- Persistent local-data declaration and tracked persistence errors.

Responses contain no passwords, account linking keys, database URLs, Stripe secrets, mail credentials or session tokens. They are not cached. `launchApproved` remains false because checkout/webhook delivery, real mail delivery, cross-site MD behavior and restore/device checks need separate evidence.

Some storage remains local **even when PostgreSQL is configured**: public postings and cruising spots use `backend/.data`. Mount that directory on a persistent disk before launch. `REDDOOR_LOCAL_DATA_PERSISTENT=true` records the operator's declaration after mounting/verifying it; setting the flag alone does not create a disk or prove durability. Keep one backend instance: the current aggregate auth/chat/favorites state is not safe for arbitrary multi-instance writers.

## Hosted billing and email rehearsal

Use a staging backend with Stripe test keys and an active CAD 7.99 monthly test price. Do not replace the production live keys just to run a test. Configure the signed webhook events in [billing deployment instructions](md-launch-deployment.md) against that backend. Verify:

1. A normal monthly Checkout with a Stripe test payment method grants Plus only after a verified paid invoice webhook.
2. A launch promo member explicitly accepts recurring billing, completes Setup Checkout with no charge today, and has a January 1 schedule with the correct payment method.
3. A Stripe Test Clock exercises the January boundary, monthly renewal, failed payment/authentication requirement and access expiry. Sandbox confirmation is not a live charge.
4. Canceling a future enrollment prevents its January charge; replayed Setup events do not reactivate it. Portal cancellation of a paid subscription preserves the paid period and prevents its next renewal.
5. Changing/removing a payment method updates status correctly. Verify actual webhook deliveries/retries in Stripe's dashboard.
6. Recovery email reaches a controlled external inbox, opens the configured HTTPS frontend, changes the password once, and revokes existing sessions. Verify administrator email ownership and wrong-code rejection too.

The current standalone backend requires email ownership verification for new registered accounts. Check account recovery and administrator access separately from a successful signup.

## MD rehearsal before the new domains

Give the MD environment the [integration contract](md-integration-contract.md). Obtain its deployed API base URL, confirm its canonical paid-code redemption endpoint is implemented, and configure the same high-entropy service secret privately in both backends. For the current site, configure `MD_SITE_URL=https://jade-chebakia-c21282.netlify.app` on Badehaus X and set `MD_API_BASE_URL` to the **confirmed backend API base**. Set approved photo hostnames explicitly. Keep `PUBLIC_APP_URL` on the current Badehaus X frontend URL.

With controlled staging accounts, verify key generation/linking, wrong key/rotation, provider live/offline timeout, 50-km discovery, Badehaus X return routing, MD signup/follow/provider subscription, account-bound paid-code redemption, replies from each app, blocks, expired memberships and refund revocation. Badehaus X already tests its side with a local signed MD fixture, but MD's production implementation has not been inspected or claimed complete.

When the domains are purchased, update the actual hosting/DNS/HTTPS configuration and those public site variables, then rerun. Do not point API calls at a static frontend unless its routing explicitly supports them.

## Backups and restore drills

Prefer provider-managed PostgreSQL backups/PITR and versioned object storage as well as application snapshots. Verify their actual retention and restore capabilities in the hosting dashboards; nothing in this task has enabled a hosted backup policy.

The checked-in tool requires Node and, for PostgreSQL, a compatible `pg_dump`. It includes both local files and PostgreSQL when a database URL is configured, because a database dump alone does not include local boards. It does not back up remote S3 objects or deployment secrets. Preserve those separately in managed backup/secret systems. Account key hashes also depend on the original JWT signing secret.

Stop the backend and allow shutdown to finish first; `--offline` declares that it is stopped. Use a new private directory outside the source tree:

```sh
npm run backup -- create --backup /private/backups/red-door-snapshot --offline
npm run backup -- verify --backup /private/backups/red-door-snapshot
```

`DATABASE_URL` or `NEON_DATABASE_URL`, when present privately in the process environment, enables a PostgreSQL custom-format dump. The connection URI is passed through libpq environment settings, never command-line arguments. A failed dump leaves an incomplete directory without a valid manifest; do not treat it as a backup. Snapshots include account/password hashes, Stripe references, private messages and media. Keep them in private encrypted off-host storage with access/retention controls.

For a local-only snapshot, restore into a **new, nonexistent** data directory, never over a running backend:

```sh
npm run backup -- restore-local --backup /private/backups/red-door-snapshot --target /private/restore-drill/backend/.data
```

The tool verifies the manifest, hashes and file list, rejects symlinks, and refuses to overwrite existing target directories. Run the backend from the restore-drill working directory using isolated test configuration; keep production mail, push, billing and MD integrations disconnected. Log in again and verify profiles, entitlement/privacy, media, messages, blocks, reports and plans. Destroy the private rehearsal copy when finished.

For PostgreSQL snapshots, use the provider's restore into a **separate empty test database**, or use `pg_restore` with an owner-only libpq service file pointing only at that test database. For example:

```sh
PGSERVICEFILE=/private/restore-services.conf pg_restore --dbname=service=reddoor_restore --no-owner --no-acl /private/backups/red-door-snapshot/database.dump
```

Restore the accompanying `local-data` tree to a new isolated data directory too, configure the test backend against the test database, and repeat the same checks. No production restore or external database restore was performed by this task.

## Physical-device release check

Use actual iOS Safari and Android Chrome, both normal and private sessions: signup/login/recovery, guest Anon, location grant/denial, main-photo upload, nearby grid/light map, message retries/replies, notification permission, blocking/reporting, Plus checkout/portal return and MD payment/code return. Check slow connections, switching apps, keyboard/composer visibility and narrow screens. Screenshots from Chromium viewports are useful but do not establish this physical-device gate.

## Test mapping and remaining advisories

- `tests/apiSmoke.test.ts`: core policy/authorization, payment failure/replay, MD entitlement boundaries, immediate profile removal, admin diagnostics, restart and restored privacy/safety/billing/media/favorites/plans state.
- `tests/emailDelivery.test.ts`: actual TLS SMTP delivery, email ownership code rejection, single-use reset, session revocation and SMTP connection failure without secret disclosure.
- `tests/backup.test.ts`: snapshot round trip, owner-only permissions, corruption rejection, symlink rejection, offline requirement and refusal to overwrite existing data.
- Existing service tests retain the Cruise/Date/Hybrid, adult access, location, blocking and critical-rule coverage gates.

Production dependency audit: zero advisories. The complete development dependency audit retains seven low-severity entries in the Jest/ts-jest/deepmerge chain. No high, critical or moderate findings remain. Do not force the audit's suggested Jest downgrade: it is a separate compatibility decision. Dev servers bind to loopback. These are audit findings, not a claim that every application security risk has been eliminated.
