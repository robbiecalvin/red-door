# Red Door Mobile (Android + iOS)

This repo now includes Capacitor native projects for Android and iOS.

## What is included

- Web app wrapped with Capacitor (`android/`, `ios/`)
- Mobile build/sync scripts in `package.json`
- Frontend runtime endpoint config for API/WebSocket:
  - `DUALMODE_API_BASE_PATH`
  - `DUALMODE_WS_URL`
- Backend CORS allowlist support for native webview origins:
  - `CORS_ALLOWED_ORIGINS`

## Prerequisites

- Node.js 20+
- npm 10+
- Android Studio (for Android builds)
- Xcode 15+ (for iOS builds, macOS only)

## Install

```bash
npm install
```

## Configure environment

Copy and edit `.env.example`.

Important for real mobile builds:

- Set `DUALMODE_API_BASE_PATH` to your deployed backend origin (example: `https://api.example.com`)
- Set `DUALMODE_WS_URL` to your websocket endpoint (example: `wss://api.example.com/ws`) if needed
- Set backend `CORS_ALLOWED_ORIGINS` to include your app/web origins

## Local development

Run backend + frontend:

```bash
JWT_SECRET=dev npm run dev:stack
```

## Mobile build/sync

```bash
npm run mobile:sync
```

## Open native projects

Android:

```bash
npm run mobile:android
```

iOS:

```bash
npm run mobile:ios
```

## Run on device/emulator

Android:

```bash
npm run mobile:run:android
```

iOS:

```bash
npm run mobile:run:ios
```

## One-command local testing

These commands start the backend locally, inject platform-local API/WS URLs, sync assets, and run the app:

Android emulator:

```bash
npm run mobile:local:android
```

iOS simulator:

```bash
npm run mobile:local:ios
```

## Production launch checklist

- Configure production backend URL/env variables
- Verify auth, media upload, websocket chat, and location permissions on real devices
- Set Android signing config and create release AAB in Android Studio
- Set iOS signing/team and create release archive in Xcode
- Upload artifacts to Google Play Console / App Store Connect
