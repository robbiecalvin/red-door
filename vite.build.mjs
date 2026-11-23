import { writeAdultCatalogPages } from "./scripts/build-adult-catalog.mjs";
import { writeClassifiedPages } from "./scripts/build-classifieds.mjs";
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
  // City names and regions are based on https://en.wikipedia.org/wiki/List_of_cities_in_Canada.
  const cities = JSON.parse(fs.readFileSync("shared/classifiedCities.json", "utf8"));
  fs.cpSync("editorial/home-art", "dist/home", { recursive: true });
  const escapeHtml = value => value.replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
  const cityLinks = featured => cities.filter(city => city.id !== "vancouver" && Boolean(city.featured) === featured).map(({ id, name, region }) => {
    const art = fs.existsSync(`dist/home/${id}.webp`) ? ` style="--city-art: url('./home/${id}.webp')"` : "";
    const label = featured ? escapeHtml(name) : `${escapeHtml(name)} <small>${escapeHtml(region)}</small>`;
    return `<li data-city="${escapeHtml(`${id} ${name} ${region}`)}"><a href="./classifieds/${id}/"${art}>${label}</a></li>`;
  }).join("\n");
  const publicHome = fs.readFileSync("editorial/public-home.html", "utf8")
    .replace("<!-- CITY_LINKS -->", () => cityLinks(true))
    .replace("<!-- MORE_CITY_LINKS -->", () => cityLinks(false));
  const homeTitle = "Badehaus X | Gay Cruising, Vancouver & Culture";
  const homeDescription = "Explore gay cruising, Vancouver nightlife, and Canadian city classifieds. Read The Backroom or open the Badehaus X gay cruising app for adults.";
  fs.writeFileSync("dist/index.html", home
    .replace("<title>Badehaus X</title>", `<title>${homeTitle}</title>`)
    .replace('name="description" content="Explore nearby. Start a conversation. Connect your way with Badehaus X."', `name="description" content="${homeDescription}"`)
    .replace('property="og:title" content="Badehaus X"', `property="og:title" content="${homeTitle}"`)
    .replace('name="twitter:title" content="Badehaus X"', `name="twitter:title" content="${homeTitle}"`)
    .replaceAll('content="Explore nearby. Start a conversation. Connect your way."', `content="${homeDescription}"`)
    .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, entry) => `<script type="module">
      const appHash = () => Boolean(location.hash && !["#sign-in", "#classifieds"].includes(location.hash));
      const query = new URLSearchParams(location.search);
      const openApp = appHash() || query.has("st") || query.has("app") ||
        matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
      if (openApp) {
        document.getElementById("public-home").remove();
      } else {
        const search = document.getElementById("city-search");
        const cities = Array.from(document.querySelectorAll("[data-city]"));
        const status = document.getElementById("city-search-status");
        const more = document.getElementById("more-cities");
        let wasSearching = false;
        let moreWasOpen = false;
        const normalize = (value) => value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[’']/g, "");
        const filterCities = () => {
          const query = normalize(search.value.trim());
          for (const city of cities) city.hidden = !normalize(city.dataset.city).includes(query);
          status.hidden = cities.some(city => !city.hidden);
          if (query) {
            if (!wasSearching) moreWasOpen = more.open;
            more.hidden = !cities.some(city => !city.hidden && more.contains(city));
            more.open = !more.hidden;
          } else {
            more.hidden = false;
            if (wasSearching) more.open = moreWasOpen;
          }
          wasSearching = Boolean(query);
        };
        search.hidden = false;
        search.addEventListener("input", filterCities);
        filterCities();
        window.addEventListener("hashchange", () => {
          if (appHash()) location.reload();
        });
      }
      import(${JSON.stringify(entry)});
    </script>`)
    .replace(/<link rel="modulepreload"[^>]+>/g, "")
    .replace('<div id="root"></div>', () => publicHome));
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
    "gay-porn",
    "vancouver",
    "thebackroom/first-gay-bathhouse-visit",
    "thebackroom/meet-gay-men-vancouver",
  ];
  for (const slug of publicPages) {
    fs.mkdirSync(`dist/${slug}`, { recursive: true });
    fs.writeFileSync(`dist/${slug}/index.html`,
      fs.readFileSync(`editorial/${slug}.html`, "utf8").replaceAll("https://badehausx.com/", normalizedUrl));
  }
  const catalogPaths = writeAdultCatalogPages(process.env.ADULT_CATALOG_DIR, normalizedUrl, escapeHtml, apiBasePath);
  const classifiedsPaths = writeClassifiedPages(cities, normalizedUrl, escapeHtml);
  writeBackroomArticles(backroomArticles, normalizedUrl, [...classifiedsPaths, ...catalogPaths]);
  writePwaBuild();
  if(!publicBase.hostname.endsWith("github.io"))fs.writeFileSync("dist/CNAME",publicBase.hostname+"\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
