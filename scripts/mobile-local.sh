#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <android|ios> [extra cap run args...]" >&2
  exit 1
fi

PLATFORM="$1"
shift || true

case "$PLATFORM" in
  android|ios)
    ;;
  *)
    echo "Unsupported platform: $PLATFORM (expected android or ios)" >&2
    exit 1
    ;;
esac

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PORT="${PORT:-3000}"
JWT_SECRET="${JWT_SECRET:-dev-local-secret}"

if [ "$PLATFORM" = "android" ]; then
  BACKEND_HOST="10.0.2.2"
else
  BACKEND_HOST="127.0.0.1"
fi

API_BASE="http://${BACKEND_HOST}:${PORT}"
WS_URL="ws://${BACKEND_HOST}:${PORT}/ws"

cleanup() {
  if [ -n "${BACK_PID:-}" ] && kill -0 "$BACK_PID" 2>/dev/null; then
    kill "$BACK_PID" 2>/dev/null || true
    wait "$BACK_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

JWT_SECRET="$JWT_SECRET" PORT="$PORT" npm run backend >/tmp/reddoor-backend-mobile.log 2>&1 &
BACK_PID=$!

attempt=0
until curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 120 ]; then
    echo "Backend failed to become healthy on http://127.0.0.1:${PORT}." >&2
    tail -n 120 /tmp/reddoor-backend-mobile.log >&2 || true
    exit 1
  fi
  if ! kill -0 "$BACK_PID" 2>/dev/null; then
    echo "Backend exited before becoming healthy." >&2
    tail -n 120 /tmp/reddoor-backend-mobile.log >&2 || true
    exit 1
  fi
  sleep 0.25
done

echo "Running local ${PLATFORM} app with API=${API_BASE} WS=${WS_URL}" >&2

DUALMODE_API_BASE_PATH="$API_BASE" DUALMODE_WS_URL="$WS_URL" npm run build
DUALMODE_API_BASE_PATH="$API_BASE" DUALMODE_WS_URL="$WS_URL" npx cap sync "$PLATFORM"
npx cap run "$PLATFORM" --no-sync "$@"
