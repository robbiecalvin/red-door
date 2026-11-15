import { WebSocket } from "ws";
import { createAuthService } from "../backend/src/services/authService";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { LAUNCH_CODE, LAUNCH_END_MS } from "../shared/plus";

jest.setTimeout(30000);
const WEBHOOK_SECRET = "smoke-only-not-a-real-secret";
const price = { id: "price_smoke", active: true, currency: "cad", unit_amount: 799, recurring: { interval: "month", interval_count: 1 }, livemode: true };
const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
let providerState: any = { id: "sub_smoke", object: "subscription", customer: "cus_smoke", metadata: {}, status: "active", latest_invoice: { paid: true, status: "paid" }, current_period_end: periodEnd, items: { data: [{ price }] } };
let resetToken = "";
let providerPosts = 0, backend: ChildProcess, stub: http.Server, base: string, root: string;
async function freePort() { const server = net.createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening"); const port = (server.address() as net.AddressInfo).port; await new Promise<void>(r => server.close(() => r())); return port; }
async function request(route: string, data?: unknown, token?: string, method?: string, expected = 200): Promise<any> {
  const result = await fetch(base + route, { method: method ?? (data === undefined ? "GET" : "POST"), headers: { ...(token ? { "x-session-token": token } : {}), ...(data === undefined ? {} : { "content-type": "application/json" }) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const value = await result.json(); expect({ route, status: result.status, error: result.ok ? undefined : value.message }).toEqual({ route, status: expected, error: result.ok ? undefined : value.message }); return value;
}
async function account(name: string, consent = false, promoCode?: string) {
  const email = name === "admin" ? "smoke-admin@example.com" : `${name}@example.com`;
  if (name !== "admin") await request("/auth/register", { email, password: "Smoke-test123!", phoneE164: "", analyticsConsent: consent, promoCode });
  const login = await request("/auth/login", { email, password: "Smoke-test123!" });
  const token = login.session.sessionToken, id = login.session.userId;
  await request("/auth/verify-age", { sessionToken: token, ageYears: 25 });
  return { token, id };
}
async function webhook(type: string, id: string, valid = true) {
  const raw = JSON.stringify({ id, type, data: { object: { object: "subscription", id: "sub_smoke" } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const mac = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest("hex");
  return fetch(base + "/billing/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${valid ? mac : "0".repeat(64)}` }, body: raw });
}
let admin: { token: string; id: string }, alice: { token: string; id: string }, bob: { token: string; id: string };
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "reddoor-api-smoke-"));
  const seed = createAuthService({ jwtSecret: "smoke-only-test-key", userStoreFilePath: path.join(root, "backend/.data/auth-users.json"), skipEmailVerification: true });
  seed.adminCreateUser("smoke-admin@example.com", "Smoke-test123!", null, "registered", "free", "admin");
  seed.adminCreateUser("reset-smoke@example.com", "Smoke-test123!", null, "registered", "free", "user");
  resetToken = seed.requestPasswordReset("reset-smoke@example.com")!.token;
  stub = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST") providerPosts++;
    if (req.url?.startsWith("/v1/prices/")) return res.end(JSON.stringify(price));
    if (req.url?.startsWith("/v1/subscriptions/")) return res.end(JSON.stringify(providerState));
    if (req.url === "/v1/checkout/sessions") return res.end(JSON.stringify({ id: "cs_smoke", url: "https://checkout.stripe.com/smoke" }));
    if (req.url?.startsWith("/v1/checkout/sessions/")) return res.end(JSON.stringify({ id: "cs_smoke", status: "open", url: "https://checkout.stripe.com/smoke" }));
    if (req.url === "/v1/billing_portal/sessions") return res.end(JSON.stringify({ url: "https://billing.stripe.com/smoke" }));
    res.statusCode = 404; res.end("{}");
  });
  stub.listen(0, "127.0.0.1"); await once(stub, "listening");
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  backend = spawn(process.execPath, ["--import", require.resolve("tsx"), "--import", path.resolve(__dirname, "fixtures/stripe-fetch.mjs"), path.resolve(__dirname, "../backend/src/server.ts")], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(port), JWT_SECRET: "smoke-only-test-key", DATABASE_URL: "", NEON_DATABASE_URL: "", REQUIRE_DATABASE: "false", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", SMTP_HOST: "", TWILIO_ACCOUNT_SID: "", GOOGLE_SHEETS_WEBHOOK_URL: "", ADMIN_EMAILS: "smoke-admin@example.com", ANALYTICS_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_smoke_not_real", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_PLUS_PRICE_ID: "price_smoke", PUBLIC_APP_URL: "https://example.com/", REDDOOR_TEST_STRIPE_ORIGIN: `http://127.0.0.1:${(stub.address() as net.AddressInfo).port}` }
  });
  let startup = ""; backend.stderr?.on("data", chunk => { startup += chunk; });
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (backend.exitCode !== null) throw new Error(`Backend exited during smoke startup: ${startup}`);
    try { ready = (await fetch(base + "/health")).ok; } catch { /* Wait for actual readiness. */ }
    if (ready) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (!ready) throw new Error("Backend did not become ready in 10 seconds.");
  admin = await account("admin"); alice = await account("alice", true); bob = await account("bob", true);
});
afterAll(async () => {
  if (backend && backend.exitCode === null) { backend.kill("SIGTERM"); await once(backend, "exit"); }
  if (stub?.listening) await new Promise<void>(resolve => stub.close(() => resolve()));
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

// Real HTTP contracts against an isolated backend and a local Stripe fixture; never live charges.
describe("Core API and payment lifecycle smoke checks", () => {
  it("Given deployed routes When unauthenticated or a normal user requests admin data Then denies access", async () => {
    await request("/admin/analytics", undefined, undefined, undefined, 401);
    await request("/admin/analytics", undefined, alice.token, undefined, 403);
    const diagnostic = await request("/admin/billing/health", undefined, admin.token);
    expect(diagnostic.priceValid).toBe(true); expect(diagnostic.mode).toBe("live"); expect(providerPosts).toBe(0);
  });
  it("Given a guest or invalid profile When core actions are attempted Then enforces age and profile rules", async () => {
    const guest = await request("/auth/guest", {});
    await request("/chat/send", { chatKind: "cruise", toKey: `user:${alice.id}`, text: "blocked by age gate" }, guest.session.sessionToken, undefined, 403);
    await request("/auth/verify-age", { sessionToken: guest.session.sessionToken, ageYears: 28 });
    const guestProfile = await request("/profile/me", { displayName: "Custom guest nickname", age: 28, bio: "Hello", stats: {} }, guest.session.sessionToken, "PUT");
    expect(guestProfile.profile.displayName).toBe("Anon");
    const guestRead = await request("/profile/me", undefined, guest.session.sessionToken);
    expect(guestRead.profile.displayName).toBe("Anon");
    await request("/profile/me", { displayName: "", age: 17, bio: "" }, alice.token, "PUT", 400);
    const bypass = await request("/auth/verify-email", { email: "alice@example.com", code: "000000" }, undefined, undefined, 400);
    expect(bypass.code).toBe("INVALID_VERIFICATION_CODE");
    const profile = await request("/profile/me", { displayName: "Alice", age: 25, bio: "Hello" }, alice.token, "PUT");
    expect(profile.profile.displayName).toBe("Alice");
  });
  it("Given opted-in accounts When exchanging messages Then caps Cruise expiry at 72 hours and records one reply", async () => {
    const sent = await request("/chat/send", { chatKind: "cruise", toKey: `user:${bob.id}`, text: "Hello" }, alice.token);
    expect(sent.message.expiresAtMs - sent.message.createdAtMs).toBe(72 * 3600000);
    await request("/chat/send", { chatKind: "cruise", toKey: `user:${alice.id}`, text: "Hi back" }, bob.token);
    await request("/chat/read", { chatKind: "cruise", otherKey: `user:${alice.id}` }, bob.token);
    const listed = await request(`/chat/messages?chatKind=cruise&otherKey=user:${bob.id}`, undefined, alice.token);
    expect(listed.messages).toHaveLength(2); expect(listed.messages[0].readAtMs).toBeUndefined();
    const data = await request("/admin/analytics", undefined, admin.token);
    expect(data.totals.conversations_started).toBe(1); expect(data.totals.conversations_replied).toBe(1);
    expect(data.cohorts.find((c: any) => c.cohort === "free").firstReplies).toBe(1);
    expect(JSON.stringify(data)).not.toContain(alice.id); expect(JSON.stringify(data)).not.toContain("Hello");
  });
  it("Given a block When messaging is attempted Then rejects delivery", async () => {
    await request("/block", { targetKey: `user:${alice.id}` }, bob.token);
    await request("/chat/send", { chatKind: "cruise", toKey: `user:${bob.id}`, text: "Must not arrive" }, alice.token, undefined, 403);
    await request("/unblock", { targetKey: `user:${alice.id}` }, bob.token);
  });
  it("Given unrelated realtime clients When a private message is sent Then only the participants receive it", async () => {
    async function connect(token: string) {
      const ws = new WebSocket(base.replace("http:", "ws:")); await once(ws, "open");
      const reply = once(ws, "message"); ws.send(JSON.stringify({ type: "auth", payload: { sessionToken: token } }));
      expect(JSON.parse(String((await reply)[0])).type).toBe("auth_ok"); return ws;
    }
    const observer = await connect(admin.token), recipient = await connect(bob.token);
    const observed: any[] = []; observer.on("message", data => observed.push(JSON.parse(String(data))));
    try {
      const delivery = once(recipient, "message");
      await request("/chat/send", { chatKind: "cruise", toKey: `user:${bob.id}`, text: "Private realtime message" }, alice.token);
      expect(JSON.parse(String((await delivery)[0])).type).toBe("chat_message");
      const barrier = once(observer, "message"); observer.send(JSON.stringify({ type: "heartbeat" })); await barrier;
      expect(observed.some(item => item.type === "chat_message")).toBe(false);
    } finally { observer.terminate(); recipient.terminate(); }
  });
  it("Given chat media When uploaded and sent Then only participants can download and blocks revoke issued links", async () => {
    const bytes = Buffer.from("smoke image");
    const upload = await request("/chat/media/initiate", { mimeType: "image/png", sizeBytes: bytes.length }, alice.token);
    const uploaded = await fetch(upload.uploadUrl, { method: "PUT", body: bytes, headers: { "content-type": "image/png" } }); expect(uploaded.status).toBe(200);
    expect((await fetch(upload.uploadUrl, { method: "PUT", body: bytes, headers: { "content-type": "image/png" } })).status).toBe(403);
    await request("/chat/send", { chatKind: "cruise", toKey: `user:${alice.id}`, text: "", media: { kind: "image", objectKey: upload.objectKey, mimeType: "image/png" } }, bob.token, undefined, 400);
    await request("/chat/send", { chatKind: "cruise", toKey: `user:${bob.id}`, text: "", media: { kind: "image", objectKey: upload.objectKey, mimeType: "image/png" } }, alice.token);
    await request(`/chat/media/url?objectKey=${encodeURIComponent(upload.objectKey)}`, undefined, admin.token, undefined, 400);
    const link = await request(`/chat/media/url?objectKey=${encodeURIComponent(upload.objectKey)}`, undefined, bob.token);
    expect(Buffer.from(await (await fetch(link.downloadUrl)).arrayBuffer())).toEqual(bytes);
    expect((await fetch(base + `/storage/local/download/${encodeURIComponent(upload.objectKey)}`)).status).toBe(403);
    await request("/block", { targetKey: `user:${alice.id}` }, bob.token);
    expect((await fetch(link.downloadUrl)).status).toBe(403);
    await request("/unblock", { targetKey: `user:${alice.id}` }, bob.token);
  });
  it("Given a private album When shared then revoked Then rejects public and stale private links", async () => {
    const bytes = Buffer.from("private smoke image");
    const upload = await request("/profile/media/initiate", { kind: "photo_private", mimeType: "image/png", sizeBytes: bytes.length }, alice.token);
    expect((await fetch(upload.uploadUrl, { method: "PUT", body: bytes, headers: { "content-type": "image/png" } })).status).toBe(200);
    await request("/profile/media/complete", { mediaId: upload.mediaId }, alice.token);
    await request("/plus/preferences", { privateMediaIds: [upload.mediaId], albumSharedWith: [bob.id] }, alice.token, "PUT");
    await request(`/media/public/${upload.mediaId}/url`, undefined, undefined, undefined, 400);
    const album = await request(`/plus/albums/${alice.id}`, undefined, bob.token);
    expect(Buffer.from(await (await fetch(album.photos[0].downloadUrl)).arrayBuffer())).toEqual(bytes);
    await request("/plus/preferences", { albumSharedWith: [] }, alice.token, "PUT");
    expect((await fetch(album.photos[0].downloadUrl)).status).toBe(403);
  });
  it("Given Checkout starts When the browser returns without a verified webhook Then grants no Plus", async () => {
    const result = await request("/billing/checkout", {}, alice.token);
    expect(result.url).toBe("https://checkout.stripe.com/smoke");
    expect((await request("/plus", undefined, alice.token)).active).toBe(false);
    expect((await webhook("checkout.session.completed", "evt_invalid", false)).status).toBe(400);
    expect((await request("/plus", undefined, alice.token)).active).toBe(false);
  });
  it("Given a signed paid event When canonical Stripe state is active Then grants one paid period and ignores delivery replays", async () => {
    providerState = { ...providerState, metadata: { userId: alice.id }, latest_invoice: { paid: false, status: "open" } };
    expect((await webhook("customer.subscription.updated", "evt_open_invoice")).status).toBe(200);
    expect((await request("/plus", undefined, alice.token)).active).toBe(false);
    providerState.latest_invoice = { paid: true, status: "paid" };
    expect((await webhook("checkout.session.completed", "evt_paid")).status).toBe(200);
    expect((await webhook("checkout.session.completed", "evt_paid")).status).toBe(200);
    const plus = await request("/plus", undefined, alice.token);
    expect(plus.active).toBe(true); expect(plus.expiresAtMs).toBe(periodEnd * 1000);
    const data = await request("/admin/analytics", undefined, admin.token);
    expect(data.totals.checkout_started).toBe(1); expect(data.totals.subscription_activated).toBe(1);
    expect(data.cohorts.find((c: any) => c.cohort === "free").paidConversions).toBe(1);
    expect((await request("/billing/portal", {}, alice.token)).url).toBe("https://billing.stripe.com/smoke");
  });
  it("Given renewal fails or is canceled When Stripe reports a later period Then does not extend paid access", async () => {
    providerState = { ...providerState, status: "active", current_period_end: periodEnd + 30 * 86400 };
    expect((await webhook("invoice.payment_failed", "evt_failed_active")).status).toBe(200);
    expect((await request("/plus", undefined, alice.token)).expiresAtMs).toBe(periodEnd * 1000);
    providerState = { ...providerState, status: "past_due", current_period_end: periodEnd + 30 * 86400 };
    expect((await webhook("invoice.payment_failed", "evt_failed")).status).toBe(200);
    expect((await request("/plus", undefined, alice.token)).expiresAtMs).toBe(periodEnd * 1000);
    providerState = { ...providerState, status: "canceled" };
    expect((await webhook("customer.subscription.deleted", "evt_canceled")).status).toBe(200);
    expect((await request("/plus", undefined, alice.token)).expiresAtMs).toBe(periodEnd * 1000);
  });
  it("Given an expired paid period When its owner refreshes Then Plus remains unavailable", async () => {
    providerState = { ...providerState, id: "sub_expired", status: "active", metadata: { userId: bob.id }, current_period_end: Math.floor(Date.now()/1000) - 1 };
    expect((await webhook("customer.subscription.updated", "evt_expired")).status).toBe(200);
    expect((await request("/plus", undefined, bob.token)).active).toBe(false);
  });
  it("Given a launch-code registration When completed Then grants the fixed promotion without contacting Checkout", async () => {
    const count = providerPosts;
    if (Date.now() >= LAUNCH_END_MS) {
      await request("/auth/register", { email: "launch@example.com", password: "Smoke-test123!", promoCode: LAUNCH_CODE }, undefined, undefined, 400);
      return;
    }
    const user = await account("launch", true, LAUNCH_CODE);
    const plus = await request("/plus", undefined, user.token);
    expect(plus.active).toBe(Date.now() < LAUNCH_END_MS); expect(plus.expiresAtMs).toBe(LAUNCH_END_MS); expect(providerPosts).toBe(count);
    const data = await request("/admin/analytics", undefined, admin.token);
    expect(data.cohorts.find((c: any) => c.cohort === "launch").paidConversions).toBe(0);
  });
  it("Given privacy opt-out When applied Then removes participant metrics and retains anonymous totals", async () => {
    await request("/account/privacy", { analyticsConsent: false }, bob.token, "PUT");
    expect((await request("/account/privacy", undefined, bob.token)).analyticsConsent).toBe(false);
    const data = await request("/admin/analytics", undefined, admin.token);
    expect(data.cohorts.find((c: any) => c.cohort === "free").participants).toBe(1);
    expect(data.totals.registrations).toBe(Date.now() < LAUNCH_END_MS ? 3 : 2);
  });
  it("Given a Stripe sandbox payment When confirmed Then separates it from real paid conversion", async () => {
    const user = await account("sandbox", true);
    price.livemode = false;
    const previousLive = (await request("/admin/analytics", undefined, admin.token)).totals.subscription_activated;
    await request("/billing/checkout", {}, user.token);
    providerState = { ...providerState, id: "sub_sandbox", status: "active", current_period_end: periodEnd, metadata: { userId: user.id }, items: { data: [{ price }] } };
    expect((await webhook("invoice.paid", "evt_sandbox")).status).toBe(200);
    expect((await request("/plus", undefined, user.token)).active).toBe(true);
    const data = await request("/admin/analytics", undefined, admin.token);
    expect(data.totals.subscription_activated).toBe(previousLive);
    expect(data.totals.test_checkout_started).toBe(1);
    expect(data.totals.test_paid_period_confirmed).toBe(1);
  });
  it("Given live sessions and a bound JWT When a password is reset Then HTTP and realtime credentials are revoked", async () => {
    const login = await request("/auth/login", { email: "reset-smoke@example.com", password: "Smoke-test123!" });
    const ws = new WebSocket(base.replace("http:", "ws:")); await once(ws, "open");
    const auth = once(ws, "message"); ws.send(JSON.stringify({ type: "auth", payload: { jwt: login.jwt } })); expect(JSON.parse(String((await auth)[0])).type).toBe("auth_ok");
    try {
      await request("/auth/password-reset/confirm", { token: resetToken, password: "Changed-Smoke123!" });
      await request("/session", undefined, login.session.sessionToken, undefined, 401);
      const closed = once(ws, "close"); ws.send(JSON.stringify({ type: "heartbeat" })); expect((await closed)[0]).toBe(1008);
      const retry = new WebSocket(base.replace("http:", "ws:")); await once(retry, "open"); const denied = once(retry, "message"); retry.send(JSON.stringify({ type: "auth", payload: { jwt: login.jwt } })); expect(JSON.parse(String((await denied)[0])).type).toBe("error"); retry.terminate();
      expect((await request("/auth/login", { email: "reset-smoke@example.com", password: "Changed-Smoke123!" })).session.userId).toBeTruthy();
    } finally { ws.terminate(); }
  });
  it("Given missing mail delivery When any account requests recovery Then returns the same unavailable result", async () => {
    const known = await request("/auth/password-reset/request", { email: "alice@example.com" }, undefined, undefined, 503);
    const unknown = await request("/auth/password-reset/request", { email: "unknown@example.com" }, undefined, undefined, 503);
    expect(known).toEqual(unknown);
    await request("/auth/password-reset/confirm", { token: "invalid", password: "New-Smoke123!" }, undefined, undefined, 400);
  });
  it("Given a private photo object key When requested through the chat-media signer Then rejects it", async () => {
    await request(`/chat/media/url?objectKey=${encodeURIComponent(`private-profiles/${alice.id}/photo.png`)}`, undefined, alice.token, undefined, 400);
  });
});
