import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";

jest.setTimeout(30000);
describe("Verification and password recovery over authenticated TLS SMTP", () => {
  let root: string, smtp: tls.Server, backend: ChildProcess, base: string, adminToken: string;
  const messages: string[] = [], password = "Email-fixture123!", sockets = new Set<tls.TLSSocket>();
  async function post(route: string, body: unknown) {
    const response = await fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  }
  async function nextMail(after: number) {
    for (let n = 0; n < 100 && messages.length <= after; n++) await new Promise(r => setTimeout(r, 50));
    expect(messages.length).toBeGreaterThan(after);
    return messages[after].replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, value) => String.fromCharCode(parseInt(value, 16)));
  }
  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "reddoor-mail-test-"));
    const key = path.join(root, "key.pem"), cert = path.join(root, "cert.pem");
    const certificate = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
    expect(certificate.status).toBe(0);
    const ca = path.join(root, "ca.pem");
    fs.writeFileSync(ca, (process.env.NODE_EXTRA_CA_CERTS ? fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS, "utf8") : "") + "\n" + fs.readFileSync(cert, "utf8"));
    smtp = tls.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, socket => {
      sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
      socket.write("220 localhost test SMTP\r\n");
      let buffer = "", data = false, body = "", authenticated = false;
      socket.on("data", chunk => {
        buffer += chunk.toString();
        for (let at; (at = buffer.indexOf("\r\n")) >= 0;) {
          const line = buffer.slice(0, at); buffer = buffer.slice(at + 2);
          if (data) { if (line === ".") { messages.push(body); body = ""; data = false; socket.write("250 queued\r\n"); } else body += line + "\r\n"; continue; }
          if (/^EHLO /i.test(line)) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
          else if (/^AUTH PLAIN /i.test(line)) { authenticated = Buffer.from(line.slice(11), "base64").toString() === "\0fixture-user\0fixture-pass"; socket.write(authenticated ? "235 authenticated\r\n" : "535 denied\r\n"); }
          else if (/^(MAIL FROM|RCPT TO):/i.test(line)) socket.write(authenticated ? "250 accepted\r\n" : "530 authenticate\r\n");
          else if (line === "DATA" && authenticated) { data = true; socket.write("354 send mail\r\n"); }
          else if (line === "QUIT") socket.end("221 bye\r\n");
          else socket.write("250 ok\r\n");
        }
      });
    });
    smtp.listen(0, "127.0.0.1"); await once(smtp, "listening");
    const reserve = net.createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening"); const port = (reserve.address() as net.AddressInfo).port; await new Promise<void>(r => reserve.close(() => r()));
    base = `http://127.0.0.1:${port}`;
    backend = spawn(process.execPath, ["--import", require.resolve("tsx"), path.resolve(__dirname, "../backend/src/server.ts")], { cwd: root, stdio: "ignore", env: { ...process.env, NODE_EXTRA_CA_CERTS: ca, PORT: String(port), JWT_SECRET: "mail-test-only-secret", DATABASE_URL: "", NEON_DATABASE_URL: "", REQUIRE_DATABASE: "false", S3_BUCKET: "", SMTP_HOST: "127.0.0.1", SMTP_PORT: String((smtp.address() as net.AddressInfo).port), SMTP_SECURE: "true", SMTP_USER: "fixture-user", SMTP_PASS: "fixture-pass", SMTP_FROM: "Red Door <noreply@example.com>", ADMIN_EMAILS: "mail-admin@example.com", PUBLIC_APP_URL: "https://example.com/", STRIPE_SECRET_KEY: "", MD_SHARED_SECRET: "" } });
    let ready = false;
    for (let n = 0; n < 100; n++) { try { ready = (await fetch(base + "/health")).ok; } catch {} if (ready) break; await new Promise(r => setTimeout(r, 100)); }
    expect(ready).toBe(true);
  });
  afterAll(async () => {
    if (backend && backend.exitCode === null) { backend.kill("SIGTERM"); await once(backend, "exit"); }
    for (const socket of sockets) socket.destroy();
    if (smtp?.listening) await new Promise<void>(r => smtp.close(() => r()));
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });
  it("Given a new administrator When verifying ownership Then sends a real TLS email and rejects an incorrect code", async () => {
    const before = messages.length;
    expect((await post("/auth/register", { email: "mail-admin@example.com", password, phoneE164: "" })).status).toBe(200);
    const mail = await nextMail(before), code = /verification code is (\d{6})/.exec(mail)?.[1];
    expect(code).toMatch(/^\d{6}$/);
    expect((await post("/auth/verify-email", { email: "mail-admin@example.com", code: code === "000000" ? "111111" : "000000" })).status).toBe(400);
    const verified = await post("/auth/verify-email", { email: "mail-admin@example.com", code });
    expect(verified.status).toBe(200); expect(verified.body.session.role).toBe("admin"); adminToken=verified.body.session.sessionToken;
    const health = await fetch(base + "/admin/launch/health", { headers: { "x-session-token": verified.body.session.sessionToken } });
    const report = await health.json() as any; expect(report.checks.smtp.status).toBe("passed");
    expect(JSON.stringify(report)).not.toContain("fixture-pass");
  });
  it("Given a recovery request When the emailed link is used Then resets once, revokes sessions and does not reveal the token in HTTP", async () => {
    const email = "mail-member@example.com"; await post("/auth/register", { email, password, phoneE164: "" });
    const old = await post("/auth/login", { email, password }), before = messages.length;
    const requested = await post("/auth/password-reset/request", { email }); expect(requested.status).toBe(200);
    const unknown = await post("/auth/password-reset/request", { email: "unknown@example.com" }); expect(unknown).toEqual(requested);
    const mail = await nextMail(before), token = /#reset=([a-f0-9]{64})/.exec(mail)?.[1];
    expect(token).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(requested.body)).not.toContain(token);
    const nextPassword = "Email-newpassword456!";
    expect((await post("/auth/password-reset/confirm", { token, password: nextPassword })).status).toBe(200);
    expect((await post("/auth/password-reset/confirm", { token, password: nextPassword })).status).toBe(400);
    expect((await fetch(base + "/session", { headers: { "x-session-token": old.body.session.sessionToken } })).status).toBe(401);
    const rejected=await post("/auth/login", { email, password }); expect(rejected.status).toBe(400); expect(rejected.body.message).toBe("Invalid credentials.");
    expect((await post("/auth/login", { email, password: nextPassword })).status).toBe(200);
  });
  it("Given an unavailable SMTP provider When an admin checks readiness Then reports failure without leaking credentials",async()=>{
    for(const socket of sockets)socket.destroy();
    await new Promise<void>(resolve=>smtp.close(()=>resolve()));
    const response=await fetch(base+"/admin/launch/health",{headers:{"x-session-token":adminToken}}),report=await response.json() as any;
    expect(response.status).toBe(200);expect(report.checks.smtp.status).toBe("failed");expect(report.automatedChecksPassed).toBe(false);expect(JSON.stringify(report)).not.toContain("fixture-pass");
  });

});
