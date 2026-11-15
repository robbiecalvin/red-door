import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("Offline backup integrity and safe restoration", () => {
  let root: string, source: string, backup: string;
  const script = path.resolve(__dirname, "../scripts/backup.mjs");
  function run(args: string[]) { return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "", NEON_DATABASE_URL: "" } }); }
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "reddoor-backup-test-")); source = path.join(root, "data"); backup = path.join(root, "backup"); fs.mkdirSync(source); fs.writeFileSync(path.join(source, "auth-users.json"), '{"fixture":"private account data"}'); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it("Given account data When backed up and restored Then verifies integrity and preserves content with private permissions", () => {
    expect(run(["create", "--source", source, "--backup", backup, "--offline"]).status).toBe(0);
    expect(run(["verify", "--backup", backup]).status).toBe(0);
    const target = path.join(root, "restored");
    expect(run(["restore-local", "--backup", backup, "--target", target]).status).toBe(0);
    expect(fs.readFileSync(path.join(target, "auth-users.json"), "utf8")).toBe(fs.readFileSync(path.join(source, "auth-users.json"), "utf8"));
    expect(fs.statSync(path.join(backup, "manifest.json")).mode & 0o077).toBe(0);
    expect(fs.statSync(path.join(target, "auth-users.json")).mode & 0o077).toBe(0);
    expect(run(["restore-local", "--backup", backup, "--target", target]).status).toBe(1);
  });
  it("Given a modified or incomplete snapshot When verification is attempted Then refuses to restore it", () => {
    run(["create", "--source", source, "--backup", backup, "--offline"]);
    fs.writeFileSync(path.join(backup, "local-data/auth-users.json"), "corrupted");
    expect(run(["verify", "--backup", backup]).status).toBe(1);
    const target = path.join(root, "restored");
    expect(run(["restore-local", "--backup", backup, "--target", target]).status).toBe(1);
    expect(fs.existsSync(target)).toBe(false);
  });
  it("Given an online snapshot or symbolic link When backup is attempted Then fails instead of claiming a consistent private snapshot", () => {
    expect(run(["create", "--source", source, "--backup", backup]).status).toBe(1);
    fs.symlinkSync(path.join(source, "auth-users.json"), path.join(source, "link"));
    expect(run(["create", "--source", source, "--backup", backup, "--offline"]).status).toBe(1);
  });
});
