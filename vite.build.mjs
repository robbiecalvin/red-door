import react from "@vitejs/plugin-react";
import { build } from "vite";

async function main() {
  const apiBasePath = process.env.DUALMODE_API_BASE_PATH ?? "https://red-door-api.onrender.com";
  const wsUrl = process.env.DUALMODE_WS_URL ?? "wss://red-door-api.onrender.com/ws";
  await build({
    configFile: false,
    clearScreen: false,
    logLevel: "info",
    root: "frontend",
    define: {
      __DUALMODE_DEFAULT_CENTER_LAT__: JSON.stringify(process.env.DUALMODE_DEFAULT_CENTER_LAT ?? "0"),
      __DUALMODE_DEFAULT_CENTER_LNG__: JSON.stringify(process.env.DUALMODE_DEFAULT_CENTER_LNG ?? "0"),
      __DUALMODE_API_BASE_PATH__: JSON.stringify(apiBasePath),
      __DUALMODE_WS_URL__: JSON.stringify(wsUrl),
    },
    plugins: [react()],
    base: "./",
    optimizeDeps: {
      // Keep build behavior consistent with dev. (Vite 5.x does not support optimizeDeps.disabled.)
      noDiscovery: true,
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "maplibre-gl"],
    },
    build: {
      outDir: "../dist",
      emptyOutDir: true,
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
