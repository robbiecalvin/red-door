# Dark map, configuration and recovery evidence

Default public style: https://tiles.openfreemap.org/styles/dark . This is a real
vector dark basemap; photos/markers are not inverted with CSS. Only navigation
control icons use a contrast filter. Change DUALMODE_MAP_STYLE_URL at build/dev
startup to replace it. Validation requires an absolute HTTPS URL without embedded
credentials, fragments or query keys. No paid plan or browser key was introduced.

Sources checked through the official GitHub repositories on November 16, 2026:

- https://github.com/hyperknot/openfreemap (README: public instance is free, no API
  keys, registration, cookies or stated map-view/request limits).
- https://github.com/hyperknot/openfreemap-styles (README explicitly lists the dark
  endpoint, a Dark Matter fork, and notes its maintenance limitations).

The hosted style/tile/font resources could not be fetched here: the environment's
restricted egress proxy returns 403 CONNECT for tiles.openfreemap.org. No hosted
latency, uptime or provider SLA is claimed. Recheck public-service terms and operating
capacity before a paid public launch; self-hosting or a contracted provider remains
an option if availability needs justify it. Keep the OSM/OpenMapTiles/provider
attribution returned by the style visible. Provider requests expose the viewer's IP
and requested map extent; reflect that in privacy disclosures. Do not attach server
secrets to the style, source, glyph or sprite URL. For a future public browser key,
first define origin restrictions, quotas, cost limits and documented client exposure;
the current validator intentionally does not permit query keys.

MapLibre 6.18.0 uses a separate worker. It is now imported with Vite's `?worker&url`
so shared worker dependencies are bundled into a same-origin asset. Chromium
reproduced the old unresolved-worker failure before this change. CSP must permit
that worker, the configured style and all style-referenced sources/glyphs/sprites;
inspect actual resource origins instead of wildcarding all hosts. CORS, provider
responses and WebGL support are separate from API, presence or GPS availability.

The canvas stays mounted during recoverable errors. The controller starts in loading,
has a 12-second watchdog and at most three automatic style reloads at 1/3/8-second
backoff. Exhaustion leaves a usable degraded overlay with manual retry and People.
Individual errors do not destroy the renderer; an idle event after a resource error
cannot falsely mark a failed style ready. Fatal renderer/configuration errors use
People rather than repeated construction. Offline pauses retries, online permits a
new bounded attempt. A manual retry starts a new bounded sequence. Reloading style
does not reset camera or DOM markers; no custom source/layer is currently installed.
If adding custom layers later, reapply them on style.load.

ResizeObserver, visible-panel resize ticks, resize, orientation, visibility and
pageshow handlers remain. Context loss prevents default teardown; restoration lets
MapLibre restore and reloads the style. Unmount clears timers, event listeners,
observers, pending initialization, markers and the single map. StrictMode cannot
create a second map after an abandoned asynchronous import.

GPS denial leaves a labelled default view. The app no longer publishes that default
camera as user presence or fabricates a self marker. Travel is an explicit user
choice. Presence/API failures do not imply no nearby people or a broken basemap.

Reproduce browser checks with Chromium installed and `npm run dev` running:

```
node scripts/check-map-browser.cjs
```

Set CHROMIUM_PATH for another installed Chromium executable and
REDDOOR_BROWSER_ORIGIN for an isolated loopback Vite port. The script uses real
MapLibre/WebGL and an intercepted background-only dark style. It checks StrictMode,
a single canvas, offline/online, rotation, repeated navigation, blocked style with
bounded retries, manual retry, context loss/restoration and uncaught page errors.
It does NOT prove external roads/labels/tiles render. Measured fixture initial render
was 520 ms in one cloud Chromium run; this is not hosted or phone performance.

Outstanding: actual provider dark roads/labels/attribution at several zooms; glyph,
sprite and vector tile failures individually; device-specific WebGL failures;
background/resume on physical phones; real slow-network first render; public key
restrictions if a different provider is selected. External failures cannot be
eliminated by client retries. The server's API and websocket CORS/origins require
separate hosted verification.
