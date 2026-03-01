import { createServer } from "vite";

function readBackendOrigin() {
  const explicit = process.env.DUALMODE_BACKEND_ORIGIN;
  if (typeof explicit === "string" && explicit.trim() !== "") return explicit.trim();

  const rawPort = process.env.DUALMODE_BACKEND_PORT ?? "3000";
  const port = Number(rawPort);
  const effectivePort = Number.isFinite(port) && port > 0 ? port : 3000;
  return `http://127.0.0.1:${effectivePort}`;
}

function readFrontendPort() {
  const rawPort = process.env.DUALMODE_FRONTEND_PORT ?? "5173";
  const port = Number(rawPort);
  return Number.isFinite(port) && port > 0 ? port : 5173;
}

function readBooleanEnv(name, defaultValue) {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.trim() === "") return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return defaultValue;
}

function readPositiveIntEnv(name, defaultValue) {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.trunc(parsed);
}

async function main() {
  const backendOrigin = readBackendOrigin();
  const frontendPort = readFrontendPort();
  const hmrEnabled = readBooleanEnv("DUALMODE_DEV_HMR", true);
  const watchEnabled = readBooleanEnv("DUALMODE_DEV_WATCH", true);
  const watchUsePolling = readBooleanEnv("DUALMODE_DEV_WATCH_POLL", false);
  const watchPollIntervalMs = readPositiveIntEnv("DUALMODE_DEV_WATCH_POLL_INTERVAL_MS", 250);
  const server = await createServer({
    configFile: false,
    clearScreen: false,
    logLevel: "info",
    root: "frontend",
    define: {
      __DUALMODE_DEFAULT_CENTER_LAT__: JSON.stringify(process.env.DUALMODE_DEFAULT_CENTER_LAT ?? "0"),
      __DUALMODE_DEFAULT_CENTER_LNG__: JSON.stringify(process.env.DUALMODE_DEFAULT_CENTER_LNG ?? "0"),
      __DUALMODE_API_BASE_PATH__: JSON.stringify(process.env.DUALMODE_API_BASE_PATH ?? "__local__"),
      __DUALMODE_WS_URL__: JSON.stringify(process.env.DUALMODE_WS_URL ?? "__disabled__"),
    },
    esbuild: {
      jsx: "automatic",
    },
    optimizeDeps: {
      // Work around a deps discovery hang in this repo by prebundling only known core deps.
      noDiscovery: true,
      // Include React's JSX runtimes so dev transforms can import `jsxDEV` safely.
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "maplibre-gl"],
    },
    server: {
      host: "127.0.0.1",
      port: frontendPort,
      strictPort: true,
      // Fast feedback by default; can be disabled with DUALMODE_DEV_HMR/DUALMODE_DEV_WATCH.
      hmr: hmrEnabled,
      watch: watchEnabled
        ? watchUsePolling
          ? {
              usePolling: true,
              interval: watchPollIntervalMs
            }
          : {}
        : {
            ignored: ["**/*"]
          },
      proxy: {
        "/api": {
          target: backendOrigin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/ws": {
          target: backendOrigin,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  });

  await server.listen();
  server.printUrls();
  console.log(`Proxying /api -> ${backendOrigin}`);
  console.log(`Dev HMR: ${hmrEnabled ? "enabled" : "disabled"}`);
  console.log(`Dev file watch: ${watchEnabled ? (watchUsePolling ? `enabled (poll ${watchPollIntervalMs}ms)` : "enabled") : "disabled"}`);
}

main().catch((err) => {
  // Keep failures explicit and deterministic in dev scripts.
  console.error(err);
  process.exitCode = 1;
});
