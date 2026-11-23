import fs from "node:fs";
import { availableBackroomArticles, writeBackroomArticles } from "./scripts/build-backroom.mjs";
import { writePwaBuild } from "./scripts/build-pwa.mjs";
import react from "@vitejs/plugin-react";
import { build } from "vite";

async function main() {
  const googlePlayEdition = process.env.DUALMODE_EDITION === "google-play";
  const apiBasePath = process.env.DUALMODE_API_BASE_PATH ?? "https://red-door-api.onrender.com";
  const wsUrl = process.env.DUALMODE_WS_URL ?? "wss://red-door-api.onrender.com/ws";
  if (googlePlayEdition) {
    const api = new URL(apiBasePath);
    const websocket = new URL(wsUrl);
    if (api.protocol !== "https:" || websocket.protocol !== "wss:" ||
      [api, websocket].some(url => url.hostname === "red-door-api.onrender.com" || url.hostname === "badehausx.com")) {
      throw new Error("The Google Play edition requires separate HTTPS API and WSS endpoints.");
    }
  }
  const publicUrl = process.env.DUALMODE_PUBLIC_APP_URL?.trim() || "https://badehausx.com/";
  const publicBase = new URL(publicUrl);
  if(publicBase.protocol!=="https:"||publicBase.username||publicBase.password||publicBase.search||publicBase.hash)throw new Error("DUALMODE_PUBLIC_APP_URL must be HTTPS.");
  const normalizedUrl=publicUrl.replace(/\/$/,"")+"/";
  const backroomArticles = availableBackroomArticles();
  await build({
    configFile: false,
    clearScreen: false,
    logLevel: "info",
    root: "frontend",
    define: {
      __BACKROOM_EDITORIAL__: JSON.stringify(backroomArticles.map(({ slug, title, synopsis, alt }) => ({ slug, title, synopsis, alt }))),
      __DUALMODE_PWA_ENABLED__: !googlePlayEdition,
      __DUALMODE_GOOGLE_PLAY__: googlePlayEdition,
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
      outDir: googlePlayEdition ? "../dist-google-play" : "../dist",
      emptyOutDir: true,
    },
  });
  if (googlePlayEdition) return;
  const home = fs.readFileSync("dist/index.html", "utf8");
  const homeTitle = "Badehaus X | Gay Cruising, Vancouver & Culture";
  const homeDescription = "Explore gay cruising, queer nightlife, and culture in Vancouver. Read The Backroom or open the Badehaus X gay cruising app for adults.";
  fs.writeFileSync("dist/index.html", home
    .replace("<title>Badehaus X</title>", `<title>${homeTitle}</title>`)
    .replace('name="description" content="Explore nearby. Start a conversation. Connect your way with Badehaus X."', `name="description" content="${homeDescription}"`)
    .replace('property="og:title" content="Badehaus X"', `property="og:title" content="${homeTitle}"`)
    .replace('name="twitter:title" content="Badehaus X"', `name="twitter:title" content="${homeTitle}"`)
    .replaceAll('content="Explore nearby. Start a conversation. Connect your way."', `content="${homeDescription}"`)
    .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, entry) => `<script type="module">
      const openApp = () => {
        if (location.hash || new URLSearchParams(location.search).has("st") || matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) {
          window.removeEventListener("hashchange", openApp);
          import(${JSON.stringify(entry)});
        }
      };
      window.addEventListener("hashchange", openApp);
      openApp();
    </script>`)
    .replace(/<link rel="modulepreload"[^>]+>/g, "")
    .replace('<div id="root"></div>', () => fs.readFileSync("editorial/public-home.html", "utf8")));
  const backroom = home
    .replaceAll('"./', '"../')
    .replaceAll("<title>Badehaus X</title>", "<title>The Backroom · Badehaus X</title>")
    .replace('name="description" content="Explore nearby. Start a conversation. Connect your way with Badehaus X."',
      'name="description" content="Queer stories, culture, and community from The Backroom at Badehaus X."')
    .replace(`rel="canonical" href="${normalizedUrl}"`, `rel="canonical" href="${normalizedUrl}thebackroom/"`)
    .replace('property="og:title" content="Badehaus X"', 'property="og:title" content="The Backroom · Badehaus X"')
    .replace('name="twitter:title" content="Badehaus X"', 'name="twitter:title" content="The Backroom · Badehaus X"')
    .replaceAll('content="Explore nearby. Start a conversation. Connect your way."', 'content="Articles on gay cruising, queer culture, and meeting people from The Backroom."')
    .replace(`property="og:url" content="${normalizedUrl}"`, `property="og:url" content="${normalizedUrl}thebackroom/"`);
  fs.mkdirSync("dist/thebackroom", { recursive: true });
  fs.writeFileSync("dist/thebackroom/index.html", backroom);
  const publicPages = [
    "gay-cruising",
    "vancouver",
    "thebackroom/first-gay-bathhouse-visit",
    "thebackroom/meet-gay-men-vancouver",
  ];
  for (const slug of publicPages) {
    fs.mkdirSync(`dist/${slug}`, { recursive: true });
    fs.writeFileSync(`dist/${slug}/index.html`,
      fs.readFileSync(`editorial/${slug}.html`, "utf8").replaceAll("https://badehausx.com/", normalizedUrl));
  }
  writeBackroomArticles(backroomArticles, normalizedUrl);
  writePwaBuild();
  if(!publicBase.hostname.endsWith("github.io"))fs.writeFileSync("dist/CNAME",publicBase.hostname+"\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
