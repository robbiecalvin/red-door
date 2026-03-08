# Red Door (Web)

This repo includes:
- A fully web-based build that runs as a static site (GitHub Pages compatible)
- Optional backend services for networked/multi-user mode

Mobile native folders were split out of this repo into:
- `/Users/robertmitchell/Downloads/desktop/Projects/red-door-mobile`

## What is included

- Static web app mode with browser-local storage (no server required)
- GitHub Pages workflow (`.github/workflows/pages.yml`)
- Optional PostgreSQL persistence mode for auth/chat/profile/media data (`DATABASE_URL`)
- Frontend runtime endpoint config for API/WebSocket:
  - `DUALMODE_API_BASE_PATH`
  - `DUALMODE_WS_URL`
- Backend CORS allowlist support:
  - `CORS_ALLOWED_ORIGINS`

## Prerequisites

- Node.js 20+
- npm 10+

## Install

```bash
npm install
```

## Configure environment

Copy and edit `.env.example`.

Important for production web deploys:

- Set `DUALMODE_API_BASE_PATH` to your deployed backend origin (example: `https://api.example.com`)
- Set `DUALMODE_WS_URL` to your websocket endpoint (example: `wss://api.example.com/ws`) if needed
- Set backend `CORS_ALLOWED_ORIGINS` to include your app/web origins
- For scalable persistence, set `DATABASE_URL` (or `NEON_DATABASE_URL`) to your PostgreSQL instance. The backend auto-creates required tables on startup and persists auth sessions, chat history, profiles, and media metadata in Postgres.
- If your Postgres provider enforces TLS, set `DATABASE_SSL=true`.
- For production safety, set `REQUIRE_DATABASE=true` so the backend fails fast if no PostgreSQL URL is configured.

## Local development (web-only, no backend)

```bash
npm run dev
```

This runs the browser-local mode by default with file watching + HMR enabled for fast visual updates.

If you hit an environment-specific watcher issue, use:

```bash
npm run dev:legacy
```

Optional dev toggles:
- `DUALMODE_DEV_HMR=false` to disable HMR
- `DUALMODE_DEV_WATCH=false` to disable file watching
- `DUALMODE_DEV_WATCH_POLL=true` to force polling watcher mode
- `DUALMODE_DEV_WATCH_POLL_INTERVAL_MS=250` to tune polling interval

## Local development (backend + frontend)

Run backend + frontend:

```bash
DUALMODE_API_BASE_PATH=/api DUALMODE_WS_URL=/ws JWT_SECRET=dev npm run dev:stack
```

## GitHub Pages deployment

Push to `main` (or run the workflow manually) and enable GitHub Pages in repository settings:

- Source: GitHub Actions
- Workflow: `Deploy GitHub Pages`

When preparing updated static files locally, use:

```bash
npm run build:pages
```

This command rebuilds `dist/`, then replaces root `assets/` and route HTML files (`index.html`, `discover.html`, etc.) from the latest build so stale bundles do not accumulate in the repo.

If the deployed site appears stale after publish, do a hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`) once the GitHub Pages deploy completes.

## Repository hygiene

Keep source code and generated output separate:

- Keep tracked: `frontend/`, `backend/`, `tests/`, workflow files, and only the current GitHub Pages static files.
- Ignore/hide local-only files via `.gitignore`: `.env*` (except `.env.example`), logs, `node_modules/`, `dist/`, `coverage/`, editor/OS files.
- Treat compiled assets in `assets/` as generated in GitHub UI via `.gitattributes`.

## Production launch checklist

- Configure production backend URL/env variables
- Verify auth, media upload, websocket chat, and location permissions in desktop + mobile browsers
