const fs = require("node:fs");
const path = require("node:path");
const { obfuscate } = require("javascript-obfuscator");

const root = process.cwd();
const distAssetsDir = path.join(root, "dist", "assets");
const mapPath = path.join(root, "docs", "obfuscation_reference.md");

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(dir, name));
}

function obfuscateFile(filePath) {
  const input = fs.readFileSync(filePath, "utf8");
  const result = obfuscate(input, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.3,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.1,
    stringArray: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.7,
    renameGlobals: false,
    sourceMap: false
  });
  fs.writeFileSync(filePath, result.getObfuscatedCode(), "utf8");
}

function main() {
  const jsFiles = listJsFiles(distAssetsDir);
  if (jsFiles.length === 0) {
    console.log("No dist JS files found; run `npm run build` first.");
    process.exit(1);
  }

  const rows = [];
  for (const filePath of jsFiles) {
    const rel = path.relative(root, filePath);
    const before = fs.statSync(filePath).size;
    obfuscateFile(filePath);
    const after = fs.statSync(filePath).size;
    rows.push({ rel, before, after });
  }

  const doc = [
    "# Obfuscation Reference",
    "",
    "This document tracks the build obfuscation pipeline.",
    "",
    "## Rules",
    "- Source files under `frontend/src` and `backend/src` remain readable and editable.",
    "- Obfuscation is applied only to compiled output in `dist/assets/*.js`.",
    "- To regenerate obfuscated output: `npm run build:obfuscated`.",
    "",
    "## Last Obfuscation Targets",
    ...rows.map((r) => `- \`${r.rel}\`: ${r.before} bytes -> ${r.after} bytes`),
    "",
    "## Edit Workflow",
    "1. Make code changes in source files.",
    "2. Run `npm run build` (or `npm run build:obfuscated`).",
    "3. For production artifact protection, run `npm run build:obfuscated`.",
    "4. Never hand-edit files in `dist/`; they are generated.",
    ""
  ].join("\n");
  fs.writeFileSync(mapPath, doc, "utf8");
  console.log(`Obfuscated ${rows.length} file(s). Wrote ${path.relative(root, mapPath)}.`);
}

main();
