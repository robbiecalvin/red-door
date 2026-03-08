# Red Door (Web + Optional Backend)

Last updated: 2026-03-08

## What this project is

Red Door is a cruise-first social platform with:
- A static web frontend (GitHub Pages-compatible)
- An optional Express + WebSocket backend for multi-user/networked behavior
- Optional PostgreSQL persistence and optional S3-compatible object storage

The active frontend product emphasis is Cruise mode. Date and Hybrid logic exists server-side and in services/tests, with frontend behavior still cruise-first.

## Tech stack

- Frontend: React 18, TypeScript, Vite 5, MapLibre GL
- Backend: Node.js, Express, WebSocket (`ws`), TypeScript (`tsx` runtime)
- Data: In-memory + JSON persistence fallback, optional PostgreSQL (`pg`)
- Media: Local object storage fallback, PostgreSQL object storage, or S3-compatible object storage
- Tests: Jest + ts-jest

## Core features implemented

### Authentication, sessions, and identity

- Guest session creation (`/auth/guest`)
- Registered account flow (`/auth/register`, `/auth/login`)
- Email verification and resend flow (`/auth/verify-email`, `/auth/resend-verification`)
- 18+ age-gate verification (`/auth/verify-age`)
- Session resolution endpoint (`/session`)
- Role support with admin auto-promotion via configured admin emails
- Ban/unban enforcement (admin)

### Modes and access rules

- Supported modes: `cruise`, `date`, `hybrid`
- Authoritative mode endpoints:
  - `GET /mode`
  - `POST /mode`
  - `POST /mode/hybrid-opt-in`
- Service-level enforcement for invalid transitions, anonymous restrictions, and age gate restrictions

### Profiles and media

- Self profile read/write (`GET/PUT /profile/me`)
- Public profile listing + single profile read
- Profile media reference mutation (`PUT /profile/media/references`)
- Upload initiation + completion (`/profile/media/initiate`, `/profile/media/complete`)
- Public media URL retrieval (`/media/public/:mediaId/url`)
- Media ownership and metadata validation via service layer

### Discovery and social surfaces

- Public postings (ads/events): list/create + event invite/response/join-request flows
- Cruising spots: list/create/check-in/check-in listing/spot actions
- Favorites: list + toggle
- Submissions (stories): list/create/view/rate
- Promoted profiles: payment start/confirm/create/list

### Chat, messaging, and real-time

- Chat send/list/list threads/read receipts
- Chat media initiate + URL retrieval
- Mode-aware chat policy enforcement
- Cruise-mode expiry behavior in service tests
- WebSocket gateway with auth handshake, heartbeat, payload limits, and broadcast filtering
- Call signaling endpoint (`/call/signal`)

### Safety, moderation, and policy

- Global block/unblock/list blocked
- Report user/message endpoints
- Admin moderation endpoints for users, cruise spots, postings, and submissions
- Admin DB health diagnostics endpoint (`/admin/db/health`)
- Deterministic explicit error codes mapped to HTTP statuses
- Location privacy rules enforced in presence service tests (server-side randomization expectations)

### Frontend app capabilities

- Multi-tab app shell (`discover`, `threads`, `ads`, `groups`, `cruise`, `profile`, `settings`, `submissions`, `promoted`)
- Map + chat discovery views
- Travel/location preference and permission request plumbing
- API endpoint resolution via build-time constants and local/remote fallback logic
- WebSocket URL derivation logic for realtime support
- GitHub Pages static page sync support for route HTML files

## API and route coverage (high level)

The backend currently exposes health/config, auth, profiles/media, favorites, public postings/events, cruising spots, submissions, admin moderation/diagnostics, promoted profiles, mode/presence/matching/dating feed, chat, call signal, block list, and reporting endpoints.

Primary implementation: `backend/src/server.ts`

## Configuration and environment

### Required baseline

- Node.js 20+
- npm 10+
- `JWT_SECRET` for backend auth

### Common environment variables

- Backend/runtime:
  - `PORT`
  - `JWT_SECRET`
  - `CORS_ALLOWED_ORIGINS`
  - `ADMIN_EMAILS`
  - `REQUIRE_DATABASE`
  - `DATABASE_URL` / `NEON_DATABASE_URL`
  - `DATABASE_SSL`
- Frontend build/runtime defines:
  - `DUALMODE_API_BASE_PATH`
  - `DUALMODE_WS_URL`
  - `DUALMODE_DEFAULT_CENTER_LAT`
  - `DUALMODE_DEFAULT_CENTER_LNG`
- Dev orchestration:
  - `DUALMODE_BACKEND_ORIGIN`
  - `DUALMODE_BACKEND_PORT`
  - `DUALMODE_FRONTEND_PORT`
  - `DUALMODE_DEV_HMR`
  - `DUALMODE_DEV_WATCH`
  - `DUALMODE_DEV_WATCH_POLL`
  - `DUALMODE_DEV_WATCH_POLL_INTERVAL_MS`
- Optional integrations present in code/env:
  - SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  - Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
  - S3-compatible: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`

Use `.env.example` as baseline.

## Development and build workflow

Install:

```bash
npm install
```

Frontend dev (Vite custom launcher):

```bash
npm run dev
```

Legacy fallback dev mode (no HMR/watch):

```bash
npm run dev:legacy
```

Backend + frontend together:

```bash
DUALMODE_API_BASE_PATH=/api DUALMODE_WS_URL=/ws JWT_SECRET=dev npm run dev:stack
```

Build:

```bash
npm run build
```

Pages static sync flow:

```bash
npm run build:pages
```

## Testing and verification completed

The following were run successfully on 2026-03-08:

```bash
npm test
npm run typecheck
npm run build
```

### Test results snapshot

- Test suites: 16 passed / 16 total
- Tests: 204 passed / 204 total
- Coverage summary:
  - Statements: 94.35%
  - Branches: 85.54%
  - Functions: 96.57%
  - Lines: 98.48%
- Critical services with 100% branch coverage in latest run:
  - `matchingService.ts`
  - `modeService.ts`
  - `presenceService.ts`

### Security and vulnerability scan

Command run:

```bash
npm audit --audit-level=low
```

Current findings:
- `rollup` advisory (high) via Vite dependency chain
- `esbuild` advisory (moderate) via Vite dependency chain
- `fast-xml-parser` advisory (moderate) via AWS SDK XML builder chain
- Total reported: 5 vulnerabilities (2 low, 2 moderate, 1 high)

Notes:
- Auto-fix path indicates potential breaking upgrade (`vite@7.x`) if using `npm audit fix --force`.

## Debugging and edits completed (tracked history)

This section is based on the latest local git history (`git log -n 30 --oneline`) and reflects completed code/debug work in this repository.

### Recent debugging and behavior fixes

- `9e95ede` map: stopped remount loop causing strobe flicker
- `a59e4b3` prevented profile modal flicker from stale async updates
- `f1b9f4b` made web register/login errors visible and reduced auth friction
- `06b1038` synced media updates across views and guarded persistent API mode
- `f088389` fixed cruising spot visibility and synced pages build
- `5a5032c` refreshed and recovered stale public media URLs

### Recent UI/layout edits

- `f410346` expanded authenticated desktop views to full-width layout
- `210dce2` tuned desktop chat tile sizing and profile two-column layout
- `f88a4fc` made desktop top bar full-width with main content
- `79f3be1` implemented desktop split-grid layouts and context chat panels
- `e450cff` polished media/settings UI and added map-based travel picker

### Infrastructure, deployment, and repo maintenance edits

- `15531cb` synced root static files with latest desktop build
- `7dea972` changed CI to build Pages from source instead of committed static assets
- `4e5adf4` removed mobile workflows and stopped quality gates on main push
- `e973fc0` split mobile projects into separate repo and kept web-only scope
- `5a5b9d4` improved web dev refresh workflow and pages asset sync
- `b5f04f4` synced concurrent workspace changes

### Moderation/admin/security-oriented edits

- `4ae993a` added super-admin moderation and enforcement
- `916e9b7` added admin database health diagnostics endpoint
- `5c39ec3` added web admin controls panel for moderation
- `b928a4f` auto-promoted configured admin emails on load/login

## Project structure

- `frontend/`: React app source
- `backend/`: API server, services, repositories, realtime gateway
- `tests/`: Jest service and gateway tests
- `docs/`: product rules, acceptance criteria, threat/perf/style/test docs
- `scripts/`: build/deploy utility scripts (pages sync, obfuscation)
- `dist/`: build output
- `assets/` + root `*.html`: GitHub Pages static publish artifacts

## Key files for maintainers

- Product rules: `docs/product.md`
- Acceptance criteria: `docs/acceptance_criteria.md`
- Testing policy: `tests/README.md`
- API server entrypoint: `backend/src/server.ts`
- Frontend app shell: `frontend/src/app/App.tsx`
- Frontend router and screens: `frontend/src/app/Router.tsx`
- Dev server launcher: `vite.dev.mjs`
- Build script: `vite.build.mjs`
- Pages sync script: `scripts/sync-pages-static.mjs`

## Notes and known constraints

- Product docs mark Date/Hybrid frontend scope as reserved, while backend services/routes include mode/matching/date-feed logic. Keep product-vs-implementation alignment explicit during future changes.
- `npm run build` currently warns about large chunks (MapLibre bundle) but build succeeds.
- Security advisories are currently transitive dependency issues and may require dependency-major decisions to fully remediate.
