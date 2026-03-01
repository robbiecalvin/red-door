import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const rootAssetsDir = path.join(rootDir, "assets");
const distAssetsDir = path.join(distDir, "assets");
const frontendAssetsDir = path.join(rootDir, "frontend", "src", "assets");

const pages = [
  "index.html",
  "discover.html",
  "threads.html",
  "public.html",
  "profile.html",
  "settings.html",
  "submissions.html",
  "promoted.html"
];

function ensureExists(target, label) {
  if (!fs.existsSync(target)) {
    throw new Error(`${label} not found: ${target}`);
  }
}

function removeIfExists(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function copyFileIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return false;
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function firstMatchAsset(prefix, suffix) {
  const entries = fs.readdirSync(rootAssetsDir).filter((name) => name.startsWith(prefix) && name.endsWith(suffix));
  return entries.length > 0 ? entries[0] : null;
}

function writeLegacyAliases() {
  const entryJs = firstMatchAsset("index-", ".js");
  const entryCss = firstMatchAsset("index-", ".css");
  const maplibreJs = firstMatchAsset("maplibre-gl-", ".js");

  if (entryJs) {
    copyFileIfExists(path.join(rootAssetsDir, entryJs), path.join(rootAssetsDir, "index-BQvD5UPx.js"));
  }

  if (entryCss) {
    copyFileIfExists(path.join(rootAssetsDir, entryCss), path.join(rootAssetsDir, "index-D_xfmmRC.css"));
  }

  if (maplibreJs) {
    copyFileIfExists(path.join(rootAssetsDir, maplibreJs), path.join(rootAssetsDir, "maplibre-gl-BqoVe-IS.js"));
  }

  copyFileIfExists(
    path.join(frontendAssetsDir, "appbackground.png"),
    path.join(rootAssetsDir, "appbackground-B-yIXT_R.png")
  );
}

function readDistHtml() {
  const distIndexPath = path.join(distDir, "index.html");
  ensureExists(distIndexPath, "Dist entry html");
  return fs.readFileSync(distIndexPath, "utf8");
}

function main() {
  ensureExists(distDir, "Dist directory");
  ensureExists(distAssetsDir, "Dist assets directory");

  const html = readDistHtml();

  removeIfExists(rootAssetsDir);
  fs.cpSync(distAssetsDir, rootAssetsDir, { recursive: true });
  writeLegacyAliases();

  for (const page of pages) {
    fs.writeFileSync(path.join(rootDir, page), html, "utf8");
  }

  console.log(`Synced ${pages.length} html files and assets/ from dist/ with legacy compatibility aliases.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
