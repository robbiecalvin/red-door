import fs from "node:fs";
import { writePwaBuild } from "./scripts/build-pwa.mjs";
import react from "@vitejs/plugin-react";
import { build } from "vite";

async function main() {
  const apiBasePath = process.env.DUALMODE_API_BASE_PATH ?? "https://red-door-api.onrender.com";
  const wsUrl = process.env.DUALMODE_WS_URL ?? "wss://red-door-api.onrender.com/ws";
  const publicUrl = process.env.DUALMODE_PUBLIC_APP_URL?.trim() || "https://badehausx.com/";
  const publicBase = new URL(publicUrl);
  if(publicBase.protocol!=="https:"||publicBase.username||publicBase.password||publicBase.search||publicBase.hash)throw new Error("DUALMODE_PUBLIC_APP_URL must be HTTPS.");
  const normalizedUrl=publicUrl.replace(/\/$/,"")+"/";
  await build({
    configFile: false,
    clearScreen: false,
    logLevel: "info",
    root: "frontend",
    define: {
      __DUALMODE_PWA_ENABLED__: true,
      __DUALMODE_MAP_STYLE_URL__: JSON.stringify(process.env.DUALMODE_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/dark"),
      __DUALMODE_DEFAULT_CENTER_LAT__: JSON.stringify(process.env.DUALMODE_DEFAULT_CENTER_LAT ?? "0"),
      __DUALMODE_DEFAULT_CENTER_LNG__: JSON.stringify(process.env.DUALMODE_DEFAULT_CENTER_LNG ?? "0"),
      __DUALMODE_API_BASE_PATH__: JSON.stringify(apiBasePath),
      __DUALMODE_WS_URL__: JSON.stringify(wsUrl),
    },
    plugins: [react(),{name:"badehaus-x-public-url",transformIndexHtml(html){return html.replaceAll("https://badehausx.com/",normalizedUrl);}}],
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
  const backroom = fs.readFileSync("dist/index.html", "utf8")
    .replaceAll('"./', '"../')
    .replaceAll("<title>Badehaus X</title>", "<title>The Backroom · Badehaus X</title>")
    .replace('name="description" content="Explore nearby. Start a conversation. Connect your way with Badehaus X."',
      'name="description" content="Queer stories, culture, and community from The Backroom at Badehaus X."')
    .replace(`rel="canonical" href="${normalizedUrl}"`, `rel="canonical" href="${normalizedUrl}thebackroom/"`)
    .replace(`property="og:url" content="${normalizedUrl}"`, `property="og:url" content="${normalizedUrl}thebackroom/"`);
  fs.mkdirSync("dist/thebackroom", { recursive: true });
  fs.writeFileSync("dist/thebackroom/index.html", backroom);
  writePwaBuild();
  if(!publicBase.hostname.endsWith("github.io"))fs.writeFileSync("dist/CNAME",publicBase.hostname+"\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
