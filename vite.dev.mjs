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

async function main() {
  const backendOrigin = readBackendOrigin();
  const frontendPort = readFrontendPort();
  const server = await createServer({
    configFile: false,
    clearScreen: false,
    logLevel: "info",
    define: {
      __DUALMODE_DEFAULT_CENTER_LAT__: JSON.stringify(process.env.DUALMODE_DEFAULT_CENTER_LAT ?? "0"),
      __DUALMODE_DEFAULT_CENTER_LNG__: JSON.stringify(process.env.DUALMODE_DEFAULT_CENTER_LNG ?? "0"),
      __DUALMODE_API_BASE_PATH__: JSON.stringify(process.env.DUALMODE_API_BASE_PATH ?? "/api"),
      __DUALMODE_WS_URL__: JSON.stringify(process.env.DUALMODE_WS_URL ?? ""),
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
      // HMR + file watching can hang in some environments; keep dev usable without it.
      hmr: false,
      watch: {
        ignored: ["**/*"],
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
}

main().catch((err) => {
  // Keep failures explicit and deterministic in dev scripts.
  console.error(err);
  process.exitCode = 1;
});
