import { spawnSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const api = (option("--api-url") || process.env.REDDOOR_API_URL || "https://red-door-api.onrender.com").replace(/\/$/, "");
const site = option("--site-url") || process.env.PUBLIC_APP_URL || "https://badehausx.com/";
const report = { checkedAt: new Date().toISOString(), checks: {}, manualVerificationRequired: true };
function allowedUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" || args.includes("--allow-local") && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error("Use HTTPS URLs without credentials, query strings or fragments. Local fixtures require --allow-local.");
  return value;
}
function get(url, token) {
  // curl inherits the environment's proxy and CA settings. Tokens go through stdin,
  // never command-line arguments, stdout, or the saved report.
  const config = `url = ${JSON.stringify(allowedUrl(url))}\n${token ? `header = ${JSON.stringify("X-Session-Token: " + token)}\n` : ""}`;
  const result = spawnSync("curl", ["--silent", "--show-error", "--max-time", "20", "--max-filesize", "2000000", "--write-out", "\n%{http_code}", "--config", "-"], { input: config, encoding: "utf8", maxBuffer: 2100000 });
  if (result.status !== 0) return { status: 0, text: "" };
  const at = result.stdout.lastIndexOf("\n");
  return { status: Number(result.stdout.slice(at + 1)), text: result.stdout.slice(0, at) };
}
function json(response) { try { return JSON.parse(response.text); } catch { return null; } }
function record(name, response, valid) {
  report.checks[name] = { status: response.status === 200 && valid ? "passed" : "failed", httpStatus: response.status, ...(response.status === 0 ? { detail: "Connection unavailable. Check network access and the host; this does not prove a deployment failure." } : {}) };
}
try {
  let response = get(api + "/health"); record("apiHealth", response, json(response)?.ok === true);
  response = get(api + "/config"); record("publicConfig", response, typeof json(response)?.emailDeliveryConfigured === "boolean");
  response = get(site); record("frontend", response, response.text.includes('property="og:image"') && response.text.includes("Badehaus X"));
  if (option("--md-site-url")) throw new Error("MD checks are disabled in the standalone release.");
  const token = process.env.REDDOOR_ADMIN_SESSION_TOKEN;
  if (token) {
    if (/[\r\n]/.test(token)) throw new Error("Invalid admin session token format.");
    response = get(api + "/admin/launch/health", token);
    const health = json(response);
    record("adminDiagnostics", response, health?.automatedChecksPassed === true);
    if (response.status === 200 && health?.checks) for (const [name, check] of Object.entries(health.checks)) report.checks[name] = { status: check.status === "passed" ? "passed" : check.status === "needs_configuration" ? "needs_configuration" : "failed" };
  } else report.checks.adminDiagnostics = { status: "needs_configuration", detail: "Set REDDOOR_ADMIN_SESSION_TOKEN privately to inspect backend configuration. Do not paste it into chat." };
  const statuses = Object.values(report.checks).map(check => check.status);
  report.automatedChecksPassed = statuses.every(status => status === "passed");
  const output = option("--output");
  if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = statuses.includes("failed") ? 1 : statuses.includes("needs_configuration") ? 2 : 0;
} catch { console.error("Launch check could not run. Check URL options, output path, and curl installation. No credentials are printed."); process.exitCode = 1; }
