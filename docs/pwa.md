# Install Red Door from the website

Red Door is now prepared as a Progressive Web App (PWA). It uses the same website
and hosted backend, with a home-screen icon and standalone window where supported.
No Apple or Google developer enrollment, APK download, or native wrapper is required
for this distribution path. Native store packaging remains a separate project.

## Installation

Use a normal browser session over HTTPS, not a private/incognito window. Open the
Red Door website, then select **Install Red Door** on the entrance screen or in
settings/the account menu. Installed standalone windows hide this control.

- **iPhone/iPad:** open the site in Safari, tap Share, select **Add to Home Screen**,
  enable **Open as Web App** if offered, and tap Add. Open the resulting Home Screen icon.
- **Android:** open in Chrome and use **Install app** when offered, or the browser's
  **Install app / Add to Home Screen** menu option. The install prompt is initiated
  only by your action; dismissing it leaves the site usable.
- **Desktop:** use the browser's install icon/menu where available. Unsupported
  browsers can continue using the website.

The manifest uses relative identity, scope and start URL so `/red-door/` on GitHub
Pages and `/` on a future approved custom domain both work without hard-coded paths.
Changing origins creates a different installation/storage identity; it does not
silently migrate an existing installation. Hosted HTTPS is required. Localhost is
only a development exception.

## Connection and updates

People, sign-in, messages, photos, maps and billing need a connection. An already
open app displays an offline notice. Launching offline after a successful online
installation shows a public reconnect page, not private cached conversations.
Nothing is queued or sent by the service worker; reconnect and review the result
before retrying a change. This does not add offline messaging or background sync.

New service workers wait rather than immediately replacing the active version.
When an update is ready, finish your message and select **Reload app**. The tab
accepting the update reloads; other open tabs receive an update notice instead of
being forcibly reloaded. One previous public build remains cached for older lazy
chunks. Reload all old tabs after finishing drafts. Very old tabs spanning several
deployments may need a refresh; there is no indefinite retention of old code.

If the update cannot activate within ten seconds, the control becomes usable again
with an explanatory message. Reopening a visible app checks for updates. The worker
script is registered with updateViaCache=none to check the deployed script directly.

## Privacy boundaries and notifications

The build generates an exact list of public assets: hashed JavaScript/CSS/fonts/art,
app icons, manifest and the public offline page/script. Only those files are put
into a scope-specific cache. Index/navigation responses are never saved; API calls,
profiles, messages, uploads/downloads, media and map tiles are not added. Requests
with query strings, authorization/session headers, non-GET methods or other origins
bypass caching. Older public caches can only satisfy known cached static assets;
there is no arbitrary runtime write-through cache.

This is a boundary on **PWA Cache Storage**, not a claim that the existing app never
uses browser storage for preferences, sessions, or its explicit localhost demo mode.
Uninstalling an icon need not clear browser website data. The service worker does
not change account retention, logout semantics or backend privacy controls.

The existing push worker is preserved in the same registration/scope, with generic
notification text and an app icon. Click targets are constrained to this app's
same-origin scope without query tokens. Installation does not request notification
permission or subscribe anyone. Enable notifications explicitly in settings.
iPhone/iPad Web Push requires supported iOS/iPadOS (16.4+) and a Home Screen web app;
OS delivery rules and backend push configuration still apply. Physical-device push
delivery was not verified in this task. PWA installation does not grant native
background execution privileges or establish payment/host/legal eligibility.

## Build and verification

```
npm ci
npm run typecheck
npm run test:coverage
npm run build
npm run test:pwa
npm run preview -- --port 5176
npm run test:production
npm audit --omit=dev --audit-level=high
```

`npm run build` calls scripts/build-pwa.mjs after Vite, fingerprints the worker and
emitted public assets, and writes the precache list into dist/sw.js. A failed static
precache install leaves an existing worker in place rather than activating a partial
build. The app never caches production data to make an offline check pass.

The preview command now uses Vite's programmatic preview with configFile=false,
matching the custom build launcher; it avoids the repository's older malformed
alternate Vite config. Development mode does not automatically register a worker,
so ordinary dev edits are not served from a stale production cache. Explicit push
registration still uses the same scope if testing that feature locally.

`test:pwa` starts its own loopback static server under `/red-door/`, uses a temporary
non-incognito Chromium profile and controlled fixture data, and cleans them up.
It checks Chromium's actual installability errors, manifest/icon dimensions, initial
registration, prompt dismissal, private cache isolation, offline launch/reconnect,
update waiting/form preservation/activation, installed UI and simulated iPhone
instructions. It never contacts the production API. Set CHROMIUM_PATH when Chromium
is elsewhere. CI and Quality Gates run this after the production build with the
runner's system Chrome/Chromium.

## Verification scope

Cloud Chromium checks passed with a production build and the GitHub Pages subpath.
The existing 326 tests, type checking, build, production-only backend check and
production dependency audit are also part of release validation. The actual iOS
Home Screen flow, Android OS install dialog, standalone keyboard/safe areas,
background/resume and installed push delivery still need controlled physical-phone
rehearsal. A simulated iPhone user agent is not Safari or an actual iPhone result.

On phones: install from a normal session, open the icon, check name/icon/standalone
window, sign in using a controlled account, deny/allow location, upload a controlled
photo, exchange ordinary test messages, check keyboard/map, background/resume,
launch offline, reconnect, apply an update after finishing a draft, and test optional
notifications. Never message real members as part of a rehearsal.
