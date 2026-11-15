import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

// Offline operations only. No restore command overwrites an existing directory.
const args = process.argv.slice(2), command = args[0];
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function files(root, prefix = "") {
  return fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symbolic links are not allowed in backups.");
    if (entry.isDirectory()) return files(root, relative);
    if (!entry.isFile()) throw new Error("Unsupported backup entry.");
    return [relative];
  }).sort();
}
function copy(source, target) {
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  for (const file of files(source)) {
    const destination = path.join(target, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.copyFileSync(path.join(source, file), destination, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(destination, 0o600);
  }
}
function verify(root) {
  if (fs.lstatSync(path.join(root, "manifest.json")).isSymbolicLink()) throw new Error("Invalid manifest.");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || !["local", "postgres-and-local"].includes(manifest.mode) || !Array.isArray(manifest.files)) throw new Error("Invalid backup manifest.");
  const actual = files(root).filter(f => f !== "manifest.json");
  const expected = manifest.files.map(f => f.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Backup files differ from the manifest.");
  for (const entry of manifest.files) {
    if (typeof entry.path !== "string" || path.isAbsolute(entry.path) || entry.path.split(/[\\/]/).includes("..")) throw new Error("Invalid manifest path.");
    const file = path.join(root, entry.path);
    if (fs.statSync(file).size !== entry.bytes || hash(file) !== entry.sha256) throw new Error("Backup integrity verification failed.");
  }
  return manifest;
}
try {
  const root = path.resolve(option("--backup") ?? "");
  if (!option("--backup")) throw new Error("Specify --backup /absolute/backup-directory.");
  if (command === "create") {
    if (!args.includes("--offline")) throw new Error("Stop the backend, then specify --offline to take a consistent file snapshot.");
    const source = path.resolve(option("--source") ?? "backend/.data");
    if (root === source || root.startsWith(source + path.sep)) throw new Error("The backup must be outside the source directory.");
    if (fs.existsSync(root)) throw new Error("Backup directory already exists; choose a new directory.");
    const database = process.env.DATABASE_URL?.trim() || process.env.NEON_DATABASE_URL?.trim();
    if (!fs.existsSync(source) && !database) throw new Error("No local data or database is configured.");
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    if (fs.existsSync(source)) copy(source, path.join(root, "local-data"));
    if (database) {
      const dump = path.join(root, "database.dump");
      // libpq accepts a connection URI in PGDATABASE; keep it out of argv/logs.
      const result = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", dump], { env: { ...process.env, PGDATABASE: database }, stdio: "ignore", timeout: 300000 });
      if (result.status !== 0) throw new Error("PostgreSQL backup failed. Check pg_dump installation, version, and database access. This directory is incomplete.");
      fs.chmodSync(dump, 0o600);
    }
    const manifest = { version: 1, createdAt: new Date().toISOString(), mode: database ? "postgres-and-local" : "local", files: files(root).map(file => ({ path: file, bytes: fs.statSync(path.join(root, file)).size, sha256: hash(path.join(root, file)) })) };
    fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
    verify(root);
    console.log("Backup created and integrity verified. Keep it in private off-host storage; it contains account data.");
  } else if (command === "verify") {
    const manifest = verify(root);
    console.log(`Backup integrity verified (${manifest.files.length} files). A restore drill is still required.`);
  } else if (command === "restore-local") {
    const manifest = verify(root), target = option("--target");
    if (manifest.mode !== "local") throw new Error("For PostgreSQL snapshots, use the documented isolated pg_restore drill and restore the local files separately.");
    if (!target || fs.existsSync(path.resolve(target))) throw new Error("Specify a new, nonexistent --target directory. Existing data is never overwritten.");
    copy(path.join(root, "local-data"), path.resolve(target));
    console.log("Local backup restored into the new target directory.");
  } else throw new Error("Use create, verify, or restore-local. See docs/launch-readiness.md.");
} catch (error) { console.error(error.message); process.exitCode = 1; }
