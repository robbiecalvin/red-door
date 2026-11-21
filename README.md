# Badehaus X

Badehaus X is an 18+ cruise-first social web app for gay men. Explore nearby profiles through a map or People grid, start a conversation, and find local plans and cruising spots. The app runs in the browser and can be installed as a progressive web app (PWA).

[Visit Badehaus X](https://badehausx.com/) · [Validation and launch plan](next_steps.md) · [Product rules](docs/product.md)

Updated November 21, 2026 against source revision `00b78c2`. Hosted availability and launch approval are tracked in the validation plan.

## Product overview

| Area | What the repository implements |
| --- | --- |
| Entrance and accounts | Login-first entrance with public Explore, guest access where permitted, password registration with email ownership verification, optional Google sign-in and registration, and password recovery. Guests appear as **Anon** with distinct underlying accounts. The 18+ gate uses self-declared age. |
| Explore and profiles | Map and People views, shared discovery filters, approximate distance bands, favorites, temporary Right Now statuses, media and privacy settings. Denied GPS does not publish the default map center as user presence. The map offers bounded recovery and a People fallback. |
| Inbox and safety | Private threads, read state, quoted replies, media, group invites, realtime WebSocket updates with polling recovery, and opt-in push. Mobile Inbox avatars open the shared member profile. Cruise chat retention is 72 hours. Blocking, reporting, private album approval/revocation, and admin moderation are available through the backend. |
| Community | Public postings, local plans and groups with scheduling and RSVP/invitation controls, cruising spots and check-ins, and moderated submissions. The standalone interface is Cruise-first. Date and Hybrid rules remain implemented in backend services. |
| Plus and Priority | The standard app Plus plan is CAD $7.99/month and includes Travel, advanced filters, saved searches, expanded limits, and private album features. Founder, launch promo and Priority referral terms have separate eligibility and billing paths. See [Plus setup](docs/plus-subscriptions.md) and [Priority readiness](docs/priority-invitation-readiness.md). |
| Public editorial and store | The Backroom is a public editorial section with a versioned build-time release schedule and an admin/member review workflow. The static `/store/` has a catalog and local shopping bag. Its page marks online ordering as coming soon. |
| Release scope | MD linking and legacy promoted-profile endpoints are disabled in standalone. The public Live tab says **Coming soon**. LiveKit rehearsal is a separate beta. |

Recent source changes include simpler mobile Explore and Groups toolbars, map markers that open on a completed tap, Google buttons aligned with Login and Register, recovery from stalled app updates, and administrative CSV import/update with scheduled discovery and facilitated chat replies. The latter two need explicit trust and hosted validation before promoting real-time activity claims. [Validation plan](next_steps.md)

### Install on a phone

On iPhone or iPad, use Safari’s **Share → Add to Home Screen**. On Android, use Chrome’s **Install app** option when offered. The app also exposes installation guidance in supported contexts. Messaging, people, photos and payments require a connection. The offline screen helps users reconnect. Private conversations and photos are excluded from the PWA cache. Updates normally wait for the user to choose **Reload**. [PWA behavior and checks](docs/pwa.md)

## Run locally

Use **Node.js 24**, matching the CI workflows, and the bundled npm. Install locked dependencies with `npm ci`.

### Browser-local demo

```bash
npm ci
npm run dev
```

Open `http://localhost:5173` by default. This mode is useful for inspecting the interface with browser-local state. Use the connected stack for sessions, shared data, cross-account permissions, and message delivery.

### Connected frontend and backend

Run these commands from the repository root in separate terminals.

```bash
PORT=3012 JWT_SECRET=local-development-only npm run backend:watch
```

```bash
DUALMODE_BACKEND_PORT=3012 DUALMODE_API_BASE_PATH=/api DUALMODE_WS_URL=/ws npm run dev
```

Check `http://localhost:3012/health` and then open the Vite URL. Use disposable accounts and local data for rehearsal. The bundled `dev:stack` helper stops existing matching backend processes and clears its selected port. The two-terminal workflow leaves unrelated local sessions alone.

### Build and preview

```bash
DUALMODE_API_BASE_PATH=__local__ DUALMODE_WS_URL=__disabled__ npm run build
npm run preview
```

The build writes `dist/`. The build script defaults to the hosted API and WebSocket URLs when variables are unset, while dev defaults to browser-local mode. Set both endpoints explicitly for a staging or isolated preview. The Pages workflow builds from source and uploads `dist/`. `npm run build:pages` additionally syncs the legacy root static artifacts.

## Configuration

Use [.env.example](.env.example) as a variable reference. Export values for the command or configure them in the host environment. Frontend build variables ship to the browser. Keep credentials and session tokens in backend or operator-controlled configuration.

| Purpose | Variables and setup |
| --- | --- |
| Backend and origins | `PORT`, `JWT_SECRET`, `CORS_ALLOWED_ORIGINS`, `PUBLIC_APP_URL`, `ADMIN_EMAILS`. Use a stable high-entropy production signing secret and exact intended browser origins. |
| Frontend endpoints | `DUALMODE_API_BASE_PATH`, `DUALMODE_WS_URL`, `DUALMODE_PUBLIC_APP_URL`, `DUALMODE_MAP_STYLE_URL`, `DUALMODE_DEFAULT_CENTER_LAT` and `DUALMODE_DEFAULT_CENTER_LNG`. Relative `/api` and `/ws` are proxied by the dev launcher. |
| Persistence and media | `DATABASE_URL` or `NEON_DATABASE_URL`, `DATABASE_SSL`, `REQUIRE_DATABASE`, and optional `S3_*` object-storage settings. The backend supports local JSON and object storage fallbacks. Some boards still use `backend/.data` with PostgreSQL configured. Mount it persistently and retain one backend writer. |
| Verification and recovery | Configure `SMTP_*` or `RESEND_API_KEY` and `RESEND_FROM` for transactional mail. Use the intended HTTPS `PUBLIC_APP_URL` for member-facing links. |
| Google sign-in | Create a Google Web application client, add exact JavaScript origins for production, staging and local as applicable, and set `GOOGLE_OAUTH_CLIENT_ID` on the backend. No redirect URI is needed for this popup. Google registration still requires age declaration and applicable policy acceptance. Administrators use password sign-in. |
| Membership and billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PLUS_PRICE_ID` and optional Founder/Priority price IDs. Keep staging on test keys and independently verify signed webhook delivery. [Billing setup](docs/plus-subscriptions.md) |
| Growth and policies | `MARKETING_SEND_ENABLED`, `MARKETING_FROM`, `MARKETING_CONTACT_ADDRESS`, `MARKETING_PUBLIC_API_URL`, `REFERRAL_EMAIL_ENABLED`, `PRIORITY_EMAIL_FROM`, and `REGISTRATION_POLICY_*`. Early-access lead forwarding uses `GOOGLE_SHEETS_WEBHOOK_URL`; the private Priority payout workflow is separate. |
| Optional services | Provision Web Push, analytics or LiveKit only for the intended environment. See the [PWA](docs/pwa.md), [analytics](docs/baseline-analytics.md) and [Live beta](docs/live-beta.md) guides. |

## Test and release

| Command | What it checks |
| --- | --- |
| `npm run typecheck` | TypeScript across the project |
| `npm run test:coverage` | Jest service, gateway and integration tests with configured coverage thresholds |
| `npm run test:smoke` | Isolated API and billing lifecycle with fixtures |
| `npm run build` | Production frontend, PWA assets and Backroom output |
| `npm run test:pwa` | Chromium checks for offline privacy and update behavior. Set `CHROMIUM_PATH` to the installed browser and build first. |
| `npm run test:production` | Production-only dependency install and isolated backend startup |
| `npm audit --omit=dev --audit-level=high` | Runtime dependency advisories |
| `npm run launch:check` | Read-only deployment diagnostics. Use `PUBLIC_APP_URL` and `REDDOOR_API_URL` to select staging. |

[CI](.github/workflows/ci.yml) and [Quality Gates](.github/workflows/quality-gates.yml) run on Node 24. The [Pages workflow](.github/workflows/pages.yml) publishes the build on `main`, manual dispatch and the configured Backroom release schedule. Compare the Pages `/build-sha.txt` with the intended frontend revision and the backend host’s deployed revision before accepting hosted evidence. Administrators can run launch diagnostics from **Settings → Account → Launch readiness**. [Domain and hosting setup](docs/badehaus-x-domain.md) · [Release evidence and rollback](docs/standalone-launch-report.md)

For backup, use the offline workflow in the launch guide and rehearse restoring to isolated storage. The application snapshot can include local files and a PostgreSQL dump. Back up remote objects and deployment secrets separately. [Backup and restore procedure](docs/launch-readiness.md#backups-and-restore-drills)

The November 21 local baseline passed 375 tests across 40 suites, typecheck, production build, Chromium PWA checks and a production-only startup check. The production dependency audit reported zero vulnerabilities. [Remaining release checks](next_steps.md)

## Repository map

| Path | Purpose |
| --- | --- |
| [frontend/src](frontend/src) and [frontend/public](frontend/public) | React app and static assets, including the storefront |
| [backend/src/server.ts](backend/src/server.ts), [routes](backend/src/routes) and [services](backend/src/services) | Express API, authorization and product rules |
| [backend/src/repositories](backend/src/repositories) and [realtime](backend/src/realtime) | Persistence and WebSocket gateway |
| [shared](shared) | Shared contracts and policy helpers |
| [editorial/backroom](editorial/backroom) | Editorial source, covers and release schedule |
| [scripts](scripts) and [deploy](deploy) | Build, browser checks, backup and staging/provider examples |
| [tests](tests) and [docs](docs) | Test suites, specifications and operating guides |

[Architecture](docs/architecture.md) · [Frontend authority](docs/frontend_authority.md) · [API reference](docs/api.md) · [Acceptance criteria](docs/acceptance_criteria.md) · [Testing policy](tests/README.md) · [Threat model](docs/threat_model.md)
