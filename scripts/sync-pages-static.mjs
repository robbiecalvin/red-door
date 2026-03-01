import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const rootAssetsDir = path.join(rootDir, "assets");
const distAssetsDir = path.join(distDir, "assets");

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

  for (const page of pages) {
    fs.writeFileSync(path.join(rootDir, page), html, "utf8");
  }

  console.log(`Synced ${pages.length} html files and assets/ from dist/.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
