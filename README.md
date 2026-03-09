# Red Door (Web + Optional Backend)

Last updated: 2026-03-09

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

## Latest shipped product updates (through 2026-03-09)

The following frontend/backend behavior changes are now implemented and live in `main`:

- Mobile bottom bar redesigned to focused overlays:
  - Inbox overlay with tabs for Chat Grid, Threads, Pinned, Cruising Spots, Groups
  - Public Ads board as a dedicated right-side bottom bar action
- Top bar redesigned with:
  - RED DOOR logo on left
  - Profile preview action in center
  - Filter and account-function overlays from top
- Travel mode improvements:
  - Travel picker instruction moved to in-map overlay (no extra black space)
  - Map click now asks for confirmation before temporary relocation
- Group creation flow improvements:
  - Date, Start Time, End Time inputs now labeled
  - Start/End rendered side-by-side and validated (`end > start`, future end)
- Chat/inbox behavior upgrades:
  - Location message preview now reads `Location Sent`
  - Group-chat invite flow supports accept/decline end-to-end notifications
  - Invite recipient message text uses `You’ve received a Chat Invite`
  - Group thread title state now reflects `+1` context
  - Unread badges now decrement correctly when messages are read
  - Bottom inbox badge no longer resets on tab/screen changes
  - Chat-grid unread/online visual signals refined
- Data persistence behavior:
  - Cruising spots persist across sessions
  - Groups expire at configured end time
  - Ads persist and roll over with 12-hour retention behavior
- Moderation/safety visibility updates:
  - Blocked users are removed from map/chat grid visibility
  - Banned users are filtered from public profile and active presence endpoints
- Profile/settings cleanup:
  - Duplicate Discreet/Travel messaging removed
  - Internal media ID labels removed from user-facing settings UI
- Red-theme migration and mobile polish:
  - Blue accents replaced with red variants
  - Overflow/horizontal scroll issues reduced across overlay layouts
  - Icon-only controls integrated from new asset set
- Auth flow update:
  - Registered users auto-verify age after registration/login path where age is known
  - Separate age-gate card is now guest/anonymous-only
- Error handling update:
  - Error banners are now scoped to the active section/tab and no longer leak into unrelated screens (including Discover map)

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

The following were run successfully on 2026-03-09:

```bash
npm test
npm run typecheck
npm run build
```

### Test results snapshot

- Test suites: 16 passed / 16 total
- Tests: 207 passed / 207 total
- Coverage summary:
  - Statements: 94.33%
  - Branches: 85.57%
  - Functions: 96.55%
  - Lines: 98.57%
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

## Recent update log (latest 30 commits)

Based on `git log -n 30 --oneline`:

- `b291817` auth: auto-verify age after register and guest-only age gate
- `24cc1fa` travel: confirm relocation after map selection
- `e667cb0` chat: keep inbox badge driven by app-level unread sync
- `0021fcd` ui: scope errors to active section and suppress discover carryover
- `5a646e0` map: overlay travel picker hint to remove bottom spacer
- `d483314` ui: add group start/end inputs and tighten ban/block visibility
- `0c40cce` chat: fix invite flow, location preview, and unread decrement
- `d670cca` updates
- `1506615` ui: center chat action sheet and tighten top icon controls
- `ef41fbf` chat ui: fix action sheet clipping and camera/mic integrations
- `548f0a3` ui/chat: unread-highlight grid, 12h ad retention, nav layout polish
- `4a1d5bd` chat/groups: anon labels, unread decrement, persistent spots and expiring groups
- `d41e9ac` ui: remove mobile overflow and retheme remaining blue accents
- `d216a7c` ui: move session errors into active tab overlays
- `41f2e65` frontend: darken bars and make mobile discover map full-height
- `e32d418` frontend: increase nav and overlay icon sizes
- `21d5467` frontend: enlarge ui icons and remove visible icon button chrome
- `aec2dd0` frontend: move ui icons into src assets for CI-safe imports
- `2225f14` frontend: replace nav controls with icon-only asset buttons
- `ffa97df` frontend: redesign topbar and add expanded top-down filters
- `d02d4ec` frontend: retheme overlays red and remove mobile horizontal overflow
- `77c6b43` frontend: add mobile ads board overlay and third nav button
- `e1b3c4f` frontend: add two-button mobile nav with tabbed inbox overlay
- `d5dae03` fix: show authenticated action errors and tighten posting validation
- `3aa7529` test: stabilize auth coverage threshold in CI
- `bc22ada` fix: restore posting and spot creation flows
- `3b3fc06` chore: push all pending updates
- `36db5fc` ci: harden scripts and align workflow gates
- `f9754ad` Add AI governance, architecture docs, and codex workflow files
- `7592d90` fix promoted profiles create/sync behavior

## Deployment and release workflow

### GitHub Actions workflows

- `CI` (`.github/workflows/ci.yml`)
  - Runs on push + pull request
  - Executes: `npm ci`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, `npm audit --omit=dev --audit-level=high`
- `Quality Gates` (`.github/workflows/quality-gates.yml`)
  - Runs on pull requests to `main` and manual trigger
  - Executes: typecheck, coverage tests, build, high-level audit
- `Deploy GitHub Pages` (`.github/workflows/pages.yml`)
  - Runs on push to `main` and manual trigger
  - Builds site from source (`npm run build`)
  - Publishes `dist/` via official Pages actions (`configure-pages`, `upload-pages-artifact`, `deploy-pages`)

### Local deployment commands

- Production build:
  - `npm run build`
- Build + sync static pages artifacts:
  - `npm run build:pages`
- Preview production build locally:
  - `npm run preview`

### Deployment notes

- Pages deploy now uses workflow artifacts from source build (not committed static dist snapshots).
- If Pages deploy fails:
  - Verify CI/build passed on the same commit
  - Confirm `dist/` generation succeeds locally with `npm run build`
  - Re-run `Deploy GitHub Pages` via workflow dispatch

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
