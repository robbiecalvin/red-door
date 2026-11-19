import { createTlsMail } from "./fixtures/tlsMail";
import { WebSocket } from "ws";
import { createAuthService } from "../backend/src/services/authService";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { BADEHAUS_FLYER_CODE, LAUNCH_END_MS, launchGrant } from "../shared/plus";

jest.setTimeout(30000);
const WEBHOOK_SECRET = "smoke-only-not-a-real-secret";
const price = { id: "price_smoke", active: true, currency: "cad", unit_amount: 799, recurring: { interval: "month", interval_count: 1 }, livemode: true };
const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
let providerState: any = { id: "sub_smoke", object: "subscription", customer: "cus_smoke", metadata: {}, status: "active", latest_invoice: { paid: true, status: "paid" }, current_period_end: periodEnd, items: { data: [{ price }] } };
let resetToken = "";
const MD_SECRET="smoke-only-shared-md-secret-at-least-32-characters";
let checkoutParams=new URLSearchParams(),setupCustomer="cus_renewal",setupUserId="",scheduleCreates=0,scheduleState:any={id:"sched_launch",status:"not_started",metadata:{}},setupCheckout:any=null;
let mail: Awaited<ReturnType<typeof createTlsMail>>;
async function customWebhook(type:string,object:unknown,id:string){const raw=JSON.stringify({id,type,data:{object}}),timestamp=Math.floor(Date.now()/1000),mac=crypto.createHmac("sha256",WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest("hex");return fetch(base+"/billing/webhook",{method:"POST",headers:{"content-type":"application/json","stripe-signature":`t=${timestamp},v1=${mac}`},body:raw});}
let upstreamRequests=0;
let providerPosts = 0, backend: ChildProcess, stub: http.Server, base: string, root: string;
async function freePort() { const server = net.createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening"); const port = (server.address() as net.AddressInfo).port; await new Promise<void>(r => server.close(() => r())); return port; }
async function request(route: string, data?: unknown, token?: string, method?: string, expected = 200): Promise<any> {
  const result = await fetch(base + route, { method: method ?? (data === undefined ? "GET" : "POST"), headers: { ...(token ? { "x-session-token": token } : {}), ...(data === undefined ? {} : { "content-type": "application/json" }) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const value = await result.json(); expect({ route, status: result.status, error: result.ok ? undefined : value.message }).toEqual({ route, status: expected, error: result.ok ? undefined : value.message }); return value;
}
async function account(name: string, consent = false, promoCode?: string) {
  const email = name === "admin" ? "smoke-admin@example.com" : `${name}@example.com`;
  if (name !== "admin") {
    const before=mail.messages.length;
    await request("/auth/register", { email, password: "Smoke-test123!", phoneE164: "", age:25, analyticsConsent: consent, promoCode });
    await request("/auth/login", {email,password:"Smoke-test123!"},undefined,undefined,403);
    const message=await mail.next(before),code=/verification code is (\d{6})/.exec(message)?.[1];
    expect(code).toMatch(/^\d{6}$/);
    await request("/auth/verify-email", {email,code});
  }
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
let backendCwd: string | undefined;
async function startBackend(){
  backend = spawn(process.execPath, ["--import", require.resolve("tsx"), "--import", path.resolve(__dirname, "fixtures/stripe-fetch.mjs"), path.resolve(__dirname, "../backend/src/server.ts")], {
    cwd: backendCwd ?? root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: new URL(base).port, JWT_SECRET: "smoke-only-test-key", DATABASE_URL: "", NEON_DATABASE_URL: "", REQUIRE_DATABASE: "false", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", NODE_EXTRA_CA_CERTS:mail.ca, SMTP_HOST: "127.0.0.1", SMTP_PORT:String(mail.port), SMTP_SECURE:"true", SMTP_USER:"fixture-user", SMTP_PASS:"fixture-pass", SMTP_FROM:"noreply@example.com", TWILIO_ACCOUNT_SID: "", GOOGLE_SHEETS_WEBHOOK_URL: "", ADMIN_EMAILS: "smoke-admin@example.com", ANALYTICS_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_smoke_not_real", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_PLUS_PRICE_ID: "price_smoke", PUBLIC_APP_URL: "https://example.com/",MD_SHARED_SECRET:MD_SECRET,MD_API_BASE_URL:`http://127.0.0.1:${(stub.address() as net.AddressInfo).port}`,MD_ALLOW_LOCAL_TESTS:"true", REDDOOR_TEST_STRIPE_ORIGIN: `http://127.0.0.1:${(stub.address() as net.AddressInfo).port}` }
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
}
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "reddoor-api-smoke-"));
  mail=await createTlsMail(root);
  const seed = createAuthService({ jwtSecret: "smoke-only-test-key", userStoreFilePath: path.join(root, "backend/.data/auth-users.json"), skipEmailVerification: true });
  seed.adminCreateUser("smoke-admin@example.com", "Smoke-test123!", null, "registered", "free", "admin");
  seed.adminCreateUser("reset-smoke@example.com", "Smoke-test123!", null, "registered", "free", "user");
  resetToken = seed.requestPasswordReset("reset-smoke@example.com")!.token;
  stub = http.createServer(async (req, res) => {
    upstreamRequests++;
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const raw=Buffer.concat(chunks).toString("utf8");const params=new URLSearchParams(raw);
    if(req.url==="/v1/customers"&&req.method==="POST")return res.end(JSON.stringify({id:setupCustomer}));
    if(req.url?.startsWith("/v1/customers/")&&req.method==="POST")return res.end(JSON.stringify({id:setupCustomer,invoice_settings:{default_payment_method:"pm_saved"}}));
    if(req.url?.startsWith("/v1/setup_intents/"))return res.end(JSON.stringify({id:"seti_launch",status:"succeeded",customer:setupCustomer,payment_method:"pm_saved",metadata:{userId:setupUserId}}));
    if(req.url==="/v1/subscription_schedules"&&req.method==="POST"){scheduleCreates++;scheduleState={...scheduleState,status:"not_started",metadata:{userId:setupUserId},start_date:Number(params.get("start_date"))};return res.end(JSON.stringify(scheduleState));}
    if(req.url==="/v1/subscription_schedules/sched_launch/cancel"){scheduleState.status="canceled";return res.end(JSON.stringify(scheduleState));}
    if(req.url?.startsWith("/v1/subscription_schedules/"))return res.end(JSON.stringify(scheduleState));

    res.setHeader("content-type", "application/json");
    if (req.method === "POST") providerPosts++;
    if (req.url?.startsWith("/v1/prices/")) return res.end(JSON.stringify(price));
    if (req.url?.startsWith("/v1/subscriptions/")) return res.end(JSON.stringify(providerState));
    if (req.url === "/v1/checkout/sessions") {checkoutParams=params;if(params.get("mode")==="setup"){setupUserId=params.get("metadata[userId]")!;setupCheckout={id:"cs_setup_launch",mode:"setup",status:"complete",customer:params.get("customer"),setup_intent:"seti_launch",metadata:{userId:setupUserId,flow:"launch-renewal"}};return res.end(JSON.stringify({id:setupCheckout.id,url:"https://checkout.stripe.com/setup-fixture"}));}return res.end(JSON.stringify({ id: "cs_smoke", url: "https://checkout.stripe.com/smoke" }));}
    if (req.url?.startsWith("/v1/checkout/sessions/")) return res.end(JSON.stringify(req.url.includes("cs_setup_launch")?setupCheckout:{ id: "cs_smoke", status: "open", url: "https://checkout.stripe.com/smoke" }));
    if (req.url === "/v1/billing_portal/sessions") return res.end(JSON.stringify({ url: "https://billing.stripe.com/smoke" }));
    res.statusCode = 404; res.end("{}");
  });
  stub.listen(0, "127.0.0.1"); await once(stub, "listening");
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  await startBackend();
  admin = await account("admin"); alice = await account("alice", true); bob = await account("bob", true);
});
afterAll(async () => {
  if (backend && backend.exitCode === null) { backend.kill("SIGTERM"); await once(backend, "exit"); }
  if (stub?.listening) await new Promise<void>(resolve => stub.close(() => resolve()));
  if(mail)await mail.close();
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
  it("Given a Badehaus flyer registration When completed Then grants the fixed promotion without contacting Checkout", async () => {
    const count = providerPosts;
    if (Date.now() >= LAUNCH_END_MS) {
      await request("/auth/register", { email: "launch@example.com", password: "Smoke-test123!", promoCode: BADEHAUS_FLYER_CODE }, undefined, undefined, 400);
      return;
    }
    const user = await account("launch", true, BADEHAUS_FLYER_CODE);
    const plus = await request("/plus", undefined, user.token);
    expect(plus.active).toBe(Date.now() < LAUNCH_END_MS); expect(plus.expiresAtMs).toBe(LAUNCH_END_MS); expect(providerPosts).toBe(count);
    expect(plus.redeemedPromoCodes).toContain(BADEHAUS_FLYER_CODE);
    await request("/plus/redeem", { code: BADEHAUS_FLYER_CODE }, user.token, undefined, 409);
    await request("/plus/redeem", { code: "INVALID" }, user.token, undefined, 400);
    await request("/plus/redeem", { code: "PRIORITYX90" }, user.token, undefined, 400);
    expect(launchGrant(BADEHAUS_FLYER_CODE, LAUNCH_END_MS - 1)).toBe(LAUNCH_END_MS);
    expect(() => launchGrant(BADEHAUS_FLYER_CODE, LAUNCH_END_MS)).toThrow(/expired/);
    expect(providerPosts).toBe(count);
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
  it("Given configured mail delivery When known or unknown accounts request recovery Then returns the same safe response", async () => {
    const known = await request("/auth/password-reset/request", { email: "alice@example.com" });
    const unknown = await request("/auth/password-reset/request", { email: "unknown@example.com" });
    expect(known).toEqual(unknown);
    await mail.next(mail.messages.length-1);
    await request("/auth/password-reset/confirm", { token: "invalid", password: "New-Smoke123!" }, undefined, undefined, 400);
  });
  it("Given a private photo object key When requested through the chat-media signer Then rejects it", async () => {
    await request(`/chat/media/url?objectKey=${encodeURIComponent(`private-profiles/${alice.id}/photo.png`)}`, undefined, alice.token, undefined, 400);
  });
  it("Given community preferences When public discovery is requested Then exposes interests and expiring intent but no private settings",async()=>{
    await request("/members/me",undefined,undefined,undefined,401);
    const guest=await request("/auth/guest",{});await request("/auth/verify-age",{sessionToken:guest.session.sessionToken,ageYears:25});
    await request("/members/me",undefined,guest.session.sessionToken,undefined,403);
    const member=await request("/members/me",{intent:"chatting",intentHours:1,interests:["Coffee","Hiking"],prompts:[{prompt:"Ask me about…",answer:"My favorite trail"}]},alice.token,"PUT");
    expect(member.preferences.intentExpiresAtMs).toBeGreaterThan(Date.now());
    const profile=await request(`/profile/public/${alice.id}`);expect(profile.profile.member.interests).toEqual(["Coffee","Hiking"]);expect(profile.profile.member.intent).toBe("chatting");expect(profile.profile.member.hideLocation).toBeUndefined();
    await request("/members/me", { rightNow: true }, guest.session.sessionToken, "PUT", 403);
    const availability = await request("/members/me", { rightNow: true }, alice.token, "PUT");
    const expiry = availability.preferences.rightNowExpiresAtMs;
    expect(expiry).toBeGreaterThan(Date.now());
    expect((await request(`/profile/public/${alice.id}`)).profile.member.rightNowExpiresAtMs).toBe(expiry);
    await request("/members/me", { rightNow: false }, alice.token, "PUT");
    expect((await request(`/profile/public/${alice.id}`)).profile.member).not.toHaveProperty("rightNowExpiresAtMs");
    const start = Date.now() + 3600000;
    const schedule = await request("/members/me", { rightNowStartsAtMs: start }, alice.token, "PUT");
    expect(schedule.preferences.rightNowStartsAtMs).toBe(start);
    expect((await request("/members/me", undefined, alice.token)).preferences.rightNowStartsAtMs).toBe(start);
    const beforeStart = (await request(`/profile/public/${alice.id}`)).profile.member;
    expect(beforeStart).not.toHaveProperty("rightNowExpiresAtMs");
    expect(beforeStart).not.toHaveProperty("rightNowStartsAtMs");
    await request("/members/me", { rightNow: false }, alice.token, "PUT");
    const observer=new WebSocket(base.replace("http:","ws:"));await once(observer,"open");const hello=once(observer,"message");observer.send(JSON.stringify({type:"auth",payload:{sessionToken:alice.token}}));await hello;
    const removed=once(observer,"message");
    await request("/members/me",{hideProfile:true},bob.token,"PUT");
    const removal=JSON.parse(String((await removed)[0]));observer.terminate();expect(removal).toEqual({type:"presence_removed",payload:{key:`user:${bob.id}`,hideProfile:true}});

    await request("/members/me",{hideProfile:false},bob.token,"PUT");
    await request("/members/me",{discovery:{intent:"",interest:"Coffee",verifiedOnly:false}},bob.token,"PUT",402);
  });
  it("Given a free member hiding location When presence is updated Then hides coordinates from HTTP and realtime discovery",async()=>{
    await request("/members/me",{hideLocation:true},alice.token,"PUT");
    await request("/presence",{lat:49.28,lng:-123.12},alice.token);
    const list=await request("/presence/active",undefined,bob.token);expect(list.presence.some((p:any)=>p.key===`user:${alice.id}`)).toBe(false);
    await request("/members/me",{hideLocation:false},alice.token,"PUT");
    expect((await request("/presence/active",undefined,bob.token)).presence.some((p:any)=>p.key===`user:${alice.id}`)).toBe(true);
  });
  it("Given Plus off-grid browsing When listing profiles Then hides the profile but preserves existing connections",async()=>{
    const member=await account("offgrid",false,"THEREDDOORLAUNCH");
    await request("/profile/me",{displayName:"Offgrid",age:26,bio:"Hello"},member.token,"PUT");
    await request("/members/me",{incognito:true,discovery:{intent:"chatting",interest:"Coffee",verifiedOnly:false}},member.token,"PUT");
    expect((await request("/profile/public")).profiles.some((p:any)=>p.userId===member.id)).toBe(false);
    await request(`/profile/public/${member.id}`,undefined,undefined,undefined,404);
    await request("/chat/send",{chatKind:"cruise",toKey:`user:${alice.id}`,text:"Hello from an existing connection"},member.token);
    expect((await request(`/profile/public/${member.id}`,undefined,alice.token)).profile.userId).toBe(member.id);
    await request("/members/me",{incognito:false},member.token,"PUT");
    expect((await request("/profile/public")).profiles.some((p:any)=>p.userId===member.id)).toBe(true);
  });
  it("Given photo review When proof is submitted Then keeps it private and binds admin approval to the current main photo",async()=>{
    async function upload(kind:string){const bytes=Buffer.from("test image bytes");const init=await request("/profile/media/initiate",{kind,mimeType:"image/png",sizeBytes:bytes.length},alice.token);expect((await fetch(init.uploadUrl,{method:"PUT",headers:{"content-type":"image/png"},body:bytes})).status).toBe(200);await request("/profile/media/complete",{mediaId:init.mediaId},alice.token);return init;}
    const main=await upload("photo_main");const challenge=await request("/members/verification/challenge",{},alice.token);expect(challenge.verification.challenge).toMatch(/^[A-F0-9]{6}$/);
    const proof=await upload("photo_verification");await request("/members/verification/submit",{mediaId:proof.mediaId},alice.token);
    await request(`/media/public/${proof.mediaId}/url`,undefined,undefined,undefined,400);
    expect((await fetch(base+`/storage/local/download/${encodeURIComponent(proof.objectKey)}`)).status).toBe(403);
    await request("/admin/photo-verifications",undefined,bob.token,undefined,403);
    expect((await fetch(base+`/admin/photo-verifications/${alice.id}/photo`,{headers:{"x-session-token":bob.token}})).status).toBe(403);
    const pending=await request("/admin/photo-verifications",undefined,admin.token);expect(pending.requests.some((r:any)=>r.userId===alice.id)).toBe(true);
    expect((await fetch(base+`/admin/photo-verifications/${alice.id}/photo`,{headers:{"x-session-token":admin.token}})).status).toBe(200);
    await request(`/admin/photo-verifications/${alice.id}/review`,{approve:true},admin.token);
    expect((await request(`/profile/public/${alice.id}`)).profile.member.photoVerified).toBe(true);
    expect((await fetch(base+`/admin/photo-verifications/${alice.id}/photo`,{headers:{"x-session-token":admin.token}})).status).toBe(404);
    await upload("photo_main");expect((await request(`/profile/public/${alice.id}`)).profile.member.photoVerified).toBe(false);
  });
  it("Given local plans When members RSVP or cancel Then protects attendees and enforces ownership and blocks",async()=>{
    const plan=await request("/community/plans",{title:"Coffee and conversation",description:"A relaxed public meetup",city:"Vancouver",venue:"Public café",category:"Coffee",startsAtMs:Date.now()+3600000,endsAtMs:Date.now()+7200000},alice.token);
    await request(`/community/plans/${plan.id}/rsvp`,{join:true},bob.token);await request(`/community/plans/${plan.id}/rsvp`,{join:true},bob.token);
    const list=await request("/community/plans?city=Vancouver&category=Coffee",undefined,bob.token);const row=list.plans.find((p:any)=>p.id===plan.id);expect(row.attendeeCount).toBe(2);expect(row.joined).toBe(true);expect(row.attendees).toBeUndefined();
    await request(`/community/plans/${plan.id}`,undefined,bob.token,"DELETE",403);
    await request("/block",{targetKey:`user:${alice.id}`},bob.token);expect((await request("/community/plans",undefined,bob.token)).plans.some((p:any)=>p.id===plan.id)).toBe(false);await request(`/community/plans/${plan.id}/rsvp`,{join:true},bob.token,undefined,404);await request("/unblock",{targetKey:`user:${alice.id}`},bob.token);
    await request(`/community/plans/${plan.id}/rsvp`,{join:false},bob.token);await request(`/community/plans/${plan.id}`,undefined,alice.token,"DELETE");expect((await request("/community/plans",undefined,bob.token)).plans.some((p:any)=>p.id===plan.id)).toBe(false);
  });
  it("Given push and safety endpoints When called Then validates subscription destinations and restricts moderator access",async()=>{
    await request("/notifications/push",{endpoint:"https://127.0.0.1/private",keys:{}},alice.token,undefined,400);
    expect((await request("/notifications/push",undefined,alice.token)).publicKey).toBeTruthy();
    await request("/admin/safety-reports",undefined,bob.token,undefined,403);
    await request("/report/user",{targetKey:`user:${alice.id}`,reason:"Community plan safety test"},bob.token);
    expect((await request("/admin/safety-reports",undefined,admin.token)).reports.some((r:any)=>r.reason==="Community plan safety test")).toBe(true);
  });

  it("Given a guest When appearing in presence, messages, or attachment paths Then never publishes the login credential",async()=>{
    const created=await request("/auth/guest",{}),token=created.session.sessionToken,publicKey=created.session.publicKey;
    expect(publicKey).toMatch(/^session:[a-f0-9]{64}$/);expect(publicKey).not.toContain(token);
    expect((await request("/auth/verify-age",{sessionToken:token,ageYears:25})).session.publicKey).toBe(publicKey);
    const presence=await request("/presence",{lat:49.28,lng:-123.12},token);expect(presence.presence.key).toBe(publicKey);expect(JSON.stringify(presence)).not.toContain(token);
    await request("/session",undefined,publicKey.slice(8),undefined,401);
    const sent=await request("/chat/send",{chatKind:"cruise",toKey:`user:${bob.id}`,text:"Guest hello"},token);expect(sent.message.fromKey).toBe(publicKey);expect(JSON.stringify(sent)).not.toContain(token);
    await request("/chat/send",{chatKind:"cruise",toKey:publicKey,text:"Reply to Anon"},bob.token);expect((await request(`/chat/messages?chatKind=cruise&otherKey=user:${bob.id}`,undefined,token)).messages).toHaveLength(2);
    const upload=await request("/chat/media/initiate",{mimeType:"image/png",sizeBytes:1},token);expect(upload.objectKey).not.toContain(token);
    await request("/block",{targetKey:`user:${bob.id}`},token);await request("/chat/send",{chatKind:"cruise",toKey:publicKey,text:"Blocked reply"},bob.token,undefined,403);
  });

  it("Given gift codes When redeemed during or after registration Then records one use per account without provider tutorials",async()=>{
    const gifted=await account("gifted-existing");await request("/plus/redeem",{code:"REDDOORUNLOCKED"},gifted.token);let state=await request("/plus",undefined,gifted.token);expect(state.active).toBe(true);expect(state.expiresAtMs).toBe(LAUNCH_END_MS);expect(state.providerTutorialPending).toBe(false);await request("/plus/redeem",{code:"REDDOORUNLOCKED"},gifted.token,undefined,409);
    await request("/plus/redeem",{code:"REDDOORLAUNCH"},gifted.token);state=await request("/plus",undefined,gifted.token);expect(state.providerTutorialPending).toBe(false);await request("/plus/tutorial/dismiss",{},gifted.token,undefined,410);expect((await request("/plus",undefined,gifted.token)).providerTutorialPending).toBe(false);
    const registered=await account("gifted-at-registration",false,"REDDOORLAUNCH");expect((await request("/plus",undefined,registered.token)).providerTutorialPending).toBe(false);
  });
  it("Given launch access When saving billing Then requires consent and schedules January 1 without extending complimentary access or reenrolling after cancellation",async()=>{
    const member=await account("renewal-enrollment",false,"REDDOORUNLOCKED");await request("/billing/enroll",{acceptRenewal:false},member.token,undefined,400);
    const checkout=await request("/billing/enroll",{acceptRenewal:true},member.token);expect(checkout.url).toContain("setup-fixture");expect(checkoutParams.get("mode")).toBe("setup");expect(checkoutParams.get("line_items[0][price]")).toBeNull();expect(checkoutParams.get("custom_text[submit][message]")).toContain("CAD $7.99 monthly starting January 1, 2027");
    expect((await request("/plus",undefined,member.token)).hasPaymentMethod).toBe(false);
    const paid=await customWebhook("checkout.session.completed",setupCheckout,"evt_setup_launch");expect(paid.status).toBe(200);const enabled=await request("/plus",undefined,member.token);expect(enabled.hasPaymentMethod).toBe(true);expect(enabled.autoRenew).toBe(true);expect(enabled.expiresAtMs).toBe(LAUNCH_END_MS);expect(enabled.nextBillingAtMs).toBe(LAUNCH_END_MS);expect(scheduleState.start_date*1000).toBe(LAUNCH_END_MS);expect(scheduleCreates).toBe(1);
    expect((await customWebhook("checkout.session.completed",setupCheckout,"evt_setup_replay")).status).toBe(200);expect(scheduleCreates).toBe(1);
    await request("/billing/enrollment/cancel",{},member.token);expect((await request("/plus",undefined,member.token)).autoRenew).toBe(false);expect((await customWebhook("checkout.session.completed",setupCheckout,"evt_setup_replay_after_cancel")).status).toBe(200);expect(scheduleCreates).toBe(1);expect((await request("/plus",undefined,member.token)).autoRenew).toBe(false);
  });
  it("Given registration or guest entry When age is missing, invalid or under eighteen Then enforces the server boundary",async()=>{
    for(const age of [undefined,null,"18",17,18.5,121]){
      const result=await request("/auth/register",{email:"age-check@example.com",password:"Smoke-test123!",age},undefined,undefined,400);
      expect(result.code).toBe("AGE_GATE_REQUIRED");
    }
    const guest=await request("/auth/guest",{});
    await request("/chat/send",{chatKind:"cruise",toKey:`user:${alice.id}`,text:"Missing age declaration"},guest.session.sessionToken,undefined,403);
    for(const ageYears of [undefined,null,"18",17,18.5,121])await request("/auth/verify-age",{sessionToken:guest.session.sessionToken,ageYears},undefined,undefined,ageYears===17?403:400);
    expect((await request("/auth/verify-age",{sessionToken:guest.session.sessionToken,ageYears:18})).session.ageVerified).toBe(true);
  });

  it("Given the standalone release When any MD boundary is requested Then denies all methods without upstream calls or data mutation",async()=>{
    const before=upstreamRequests;
    const file=path.join(backendCwd ?? root,"backend/.data/community.json");
    const snapshot=fs.existsSync(file)?fs.readFileSync(file,"utf8"):null;
    for(const route of ["/api/md/account","/api/integrations/md/link","/md/account","/md/account/key","/md/discover","/md/handoff","/md/chat/redeem","/md/messages","/md/inbox","/integrations/md/link","/integrations/md/live","/integrations/md/messages","/integrations/md/chat/revoke"]){
      for(const method of ["GET","POST","DELETE"]){const result=await request(route,method==="GET"?undefined:{},alice.token,method,404);expect(result.code).toBe("FEATURE_DISABLED");}
    }
    expect(upstreamRequests).toBe(before);
    expect(fs.existsSync(file)?fs.readFileSync(file,"utf8"):null).toBe(snapshot);
  });

  it("Given launch diagnostics When accessed by admins Then reports actual configuration and never treats connection checks as launch approval",async()=>{
    await request("/admin/launch/health",undefined,undefined,undefined,401);
    await request("/admin/launch/health",undefined,bob.token,undefined,403);
    const health=await request("/admin/launch/health",undefined,admin.token);
    expect(health.checks.stripe.status).toBe("passed");expect(health.checks.smtp.status).toBe("passed");expect(health.checks.md).toBeUndefined();expect(health.checks.storage.status).toBe("needs_configuration");expect(health.automatedChecksPassed).toBe(false);expect(health.launchApproved).toBe(false);
    expect(JSON.stringify(health)).not.toContain(WEBHOOK_SECRET);expect(JSON.stringify(health)).not.toContain(MD_SECRET);
    const cli=await new Promise<{code:number|null;output:string}>(resolve=>{const child=spawn(process.execPath,[path.resolve(__dirname,"../scripts/check-launch.mjs"),"--api-url",base,"--site-url",base,"--allow-local"],{env:{...process.env,REDDOOR_ADMIN_SESSION_TOKEN:admin.token}});let output="";child.stdout.on("data",chunk=>{output+=chunk;});child.on("exit",code=>resolve({code,output}));});
    const cliReport=JSON.parse(cli.output);expect(cliReport.checks.apiHealth.status).toBe("passed");expect(cliReport.checks.smtp.status).toBe("passed");expect(cli.code).toBe(1);expect(cli.output).not.toContain(admin.token);

  });
  it("Given persisted accounts and private state When the backend restarts and an offline backup is restored Then preserves entitlements, messages, safety, media and favorites",async()=>{
    const member=await account("restore-member",false,"REDDOORLAUNCH"),peer=await account("restore-peer");
    await request("/profile/me",{displayName:"Restore Member",age:29,bio:"Restore drill"},member.token,"PUT");
    await request("/members/me",{hideProfile:true,interests:["Coffee"]},member.token,"PUT");
    await request("/favorites/toggle",{targetUserId:peer.id},member.token);
    const sent=await request("/chat/send",{chatKind:"cruise",toKey:`user:${peer.id}`,text:"Persistent private conversation"},member.token);
    const plan=await request("/community/plans",{title:"Restore drill meetup",description:"A public coffee meetup",city:"Vancouver",venue:"Public café",category:"Coffee",startsAtMs:Date.now()+3600000,endsAtMs:Date.now()+7200000},member.token);await request(`/community/plans/${plan.id}/rsvp`,{join:true},peer.token);

    await request("/report/user",{targetKey:`user:${peer.id}`,reason:"Restore drill safety report"},member.token);
    await request("/block",{targetKey:`user:${peer.id}`},member.token);
    const bytes=Buffer.from("restore drill media"),upload=await request("/profile/media/initiate",{kind:"photo_main",mimeType:"image/png",sizeBytes:bytes.length},member.token);
    expect((await fetch(upload.uploadUrl,{method:"PUT",headers:{"content-type":"image/png"},body:bytes})).status).toBe(200);await request("/profile/media/complete",{mediaId:upload.mediaId},member.token);
    async function assertRestored(){
      // Local-file mode persists accounts but intentionally requires a new login after restart.
      await request("/session",undefined,member.token,undefined,401);
      for(const identity of [member,peer,admin]){const email=identity===member?"restore-member@example.com":identity===peer?"restore-peer@example.com":"smoke-admin@example.com";const login=await request("/auth/login",{email,password:"Smoke-test123!"});identity.token=login.session.sessionToken;expect(login.session.ageVerified).toBe(true);}
      expect((await request("/session",undefined,member.token)).session.userId).toBe(member.id);
      const plus=await request("/plus",undefined,member.token);expect(plus.active).toBe(true);expect(plus.redeemedPromoCodes).toContain("REDDOORLAUNCH");expect(plus.providerTutorialPending).toBe(false);
      expect((await request("/profile/me",undefined,member.token)).profile.displayName).toBe("Restore Member");
      expect((await request("/members/me",undefined,member.token)).preferences.hideProfile).toBe(true);
      expect((await request("/favorites",undefined,member.token)).favorites).toContain(peer.id);
      const plans=await request("/community/plans?city=Vancouver",undefined,member.token);expect(plans.plans.find((p:any)=>p.id===plan.id).attendeeCount).toBe(2);
      const renewal=await request("/auth/login",{email:"renewal-enrollment@example.com",password:"Smoke-test123!"}),billing=await request("/plus",undefined,renewal.session.sessionToken);expect(billing.hasPaymentMethod).toBe(true);expect(billing.autoRenew).toBe(false);
      expect((await customWebhook("checkout.session.completed",setupCheckout,"evt_restore_setup_replay")).status).toBe(200);expect((await request("/plus",undefined,renewal.session.sessionToken)).autoRenew).toBe(false);expect(scheduleCreates).toBe(1);

      expect((await request("/admin/safety-reports",undefined,admin.token)).reports.some((r:any)=>r.reason==="Restore drill safety report")).toBe(true);
      await request("/chat/send",{chatKind:"cruise",toKey:`user:${member.id}`,text:"Blocked after restore"},peer.token,undefined,403);
      const media=await request(`/media/public/${upload.mediaId}/url`);expect(Buffer.from(await (await fetch(media.downloadUrl)).arrayBuffer())).toEqual(bytes);
    }
    backend.kill("SIGTERM");await once(backend,"exit");await startBackend();await assertRestored();
    await request("/unblock",{targetKey:`user:${peer.id}`},member.token);expect((await request(`/chat/messages?chatKind=cruise&otherKey=user:${peer.id}`,undefined,member.token)).messages.some((m:any)=>m.messageId===sent.message.messageId)).toBe(true);await request("/block",{targetKey:`user:${peer.id}`},member.token);
    backend.kill("SIGTERM");await once(backend,"exit");
    const backup=path.join(root,"offline-backup"),restored=path.join(root,"restore-drill"),script=path.resolve(__dirname,"../scripts/backup.mjs");
    function run(args:string[]){const result=spawnSync(process.execPath,[script,...args],{cwd:root,env:{...process.env,DATABASE_URL:"",NEON_DATABASE_URL:""},encoding:"utf8"});expect({status:result.status,error:result.stderr}).toEqual({status:0,error:""});}
    run(["create","--source",path.join(root,"backend/.data"),"--backup",backup,"--offline"]);run(["verify","--backup",backup]);run(["restore-local","--backup",backup,"--target",path.join(restored,"backend/.data")]);
    backendCwd=restored;await startBackend();await assertRestored();
  });

  it("keeps private group locations and membership behind host approval", async () => {
    const host = await account("group-host");
    const member = await account("group-member");
    const invitee = await account("group-invitee");
    const address = "Fixture private address";
    const start = Date.now() + 1800000;
    const end = start + 1800000;
    const week = 7 * 86400000;
    const created = await request("/public-postings", {
      type: "event", title: "Private group fixture", body: "Summary", groupDetails: "Group details", groupFormat: "open-house",
      lat: 49.123456, lng: -123.123456, guestLimit: 1, eventStartAtMs: end, locationInstructions: address,
      groupSchedule: [{ startsAtMs: start, endsAtMs: end }, { startsAtMs: start + week, endsAtMs: end + week }]
    }, host.token);
    const postingId = created.posting.postingId;
    const discussion = `/public-postings/event/${postingId}/discussion`;
    expect(created.posting).toMatchObject({ groupStartsAtMs: start, groupFormat: "open-house" });
    const lookup = async (token?: string) => (await request("/public-postings?type=event", undefined, token))
      .postings.find((posting: { postingId: string }) => posting.postingId === postingId);
    const expectPrivate = (posting: unknown) => {
      expect(posting).not.toHaveProperty("locationInstructions");
      expect(posting).not.toHaveProperty("lat");
      expect(posting).not.toHaveProperty("lng");
    };

    expectPrivate(await lookup());
    expectPrivate(await lookup(member.token));
    expectPrivate((await request("/admin/public-postings", undefined, admin.token)).postings
      .find((posting: { postingId: string }) => posting.postingId === postingId));
    await request("/public-postings/event/request-join", { postingId }, member.token, undefined, 400);
    await request("/chat/send", { chatKind: "cruise", toKey: `user:${host.id}`, text: "Hello, host" }, member.token);
    const pending = await request("/public-postings/event/request-join", { postingId }, member.token);
    expectPrivate(pending.posting);
    await request(discussion, undefined, member.token, undefined, 404);
    await request(discussion, { text: "Pending member" }, member.token, undefined, 404);
    await request(discussion, { text: "Host welcome" }, host.token, undefined, 201);
    expect((await lookup(invitee.token)).joinRequestUserIds).toEqual([]);
    await request("/public-postings/event/respond-request", { postingId, targetUserId: member.id, accept: true }, invitee.token, undefined, 400);
    await request("/public-postings/event/respond-request", { postingId, targetUserId: member.id, accept: true }, host.token);
    expect(await lookup(member.token)).toMatchObject({ locationInstructions: address, lat: 49.123456, lng: -123.123456 });
    const nextDate = (await request("/public-postings?type=event", undefined, member.token)).postings
      .find((posting: { groupSeriesId?: string; groupOccurrence?: number }) => posting.groupSeriesId === postingId && posting.groupOccurrence === 2);
    expect(nextDate).toMatchObject({ groupStartsAtMs: start + week, attendeeCount: 0 });
    expectPrivate(nextDate);
    await request(`/public-postings/event/${nextDate.postingId}/discussion`, undefined, member.token, undefined, 404);
    expect((await request(discussion, undefined, member.token)).messages.map((message: {text: string}) => message.text)).toEqual(["Host welcome"]);
    const groupReply = await request(discussion, { text: "Group-only reply" }, member.token, undefined, 201);
    const reportRoute = `${discussion}/${groupReply.message.messageId}/report`;
    await request(reportRoute, { reason: "Fixture concern" }, invitee.token, undefined, 404);
    await request(reportRoute, { reason: "Fixture concern" }, member.token, undefined, 404);
    const report = await request(reportRoute, { reason: "Fixture concern" }, host.token, undefined, 201);
    await request("/admin/safety-reports", undefined, member.token, undefined, 403);
    expect((await request("/admin/safety-reports", undefined, admin.token)).reports).toEqual(expect.arrayContaining([
      expect.objectContaining({ reportId: report.reportId, reason: "Fixture concern", target: expect.objectContaining({
        kind: "group-message", postingId, text: "Group-only reply", targetKey: `user:${member.id}`
      }) })
    ]));
    expect((await request(discussion, undefined, host.token)).messages).toHaveLength(2);
    const direct = await request(`/chat/messages?chatKind=cruise&otherKey=user:${host.id}`, undefined, member.token);
    expect(direct.messages.map((message: {text: string}) => message.text)).toEqual(["Hello, host"]);
    await request("/public-postings/event/invite", { postingId, targetUserId: invitee.id, expiresAtMs: Date.now() - 1 }, host.token, undefined, 400);
    const expiresAtMs = Date.now() + 60000;
    const issued = await request("/public-postings/event/invite", { postingId, targetUserId: invitee.id, expiresAtMs }, host.token);
    expect(issued.invite.expiresAtMs).toBe(expiresAtMs);
    const invitations = await request("/public-postings/event/invites", undefined, invitee.token);
    expectPrivate(invitations.postings[0]);
    expect(invitations.postings[0].acceptedUserIds).toEqual([]);
    expect(invitations.postings[0].inviteExpiresAtByUserId).toEqual({ [invitee.id]: expiresAtMs });
    await request("/chat/send", { chatKind: "cruise", toKey: `user:${host.id}`, text: "Hello from the waitlist" }, invitee.token);
    const waiting = await request("/public-postings/event/respond", { postingId, accept: true }, invitee.token);
    expectPrivate(waiting.posting);
    expect(waiting.posting).toMatchObject({ attendeeCount: 1, guestLimit: 1, joinRequestUserIds: [invitee.id] });
    await request("/public-postings/event/respond-request", { postingId, targetUserId: invitee.id, accept: true }, host.token, undefined, 400);
    expect((await lookup(host.token)).joinRequestUserIds).toContain(invitee.id);

    const removal = `/public-postings/event/${postingId}/attendees/${member.id}`;
    await request(removal, undefined, invitee.token, "DELETE", 404);
    await request(removal, undefined, host.token, "DELETE");
    const departed = await lookup(member.token);
    expectPrivate(departed);
    await request(discussion, undefined, member.token, undefined, 404);
    expect(departed.attendeeCount).toBe(0);
    expectPrivate((await request("/public-postings/event/respond", { postingId, accept: true }, invitee.token)).posting);
    await request("/public-postings/event/respond-request", { postingId, targetUserId: invitee.id, accept: true }, host.token);
    expect(await lookup(invitee.token)).toMatchObject({ attendeeCount: 1, joinRequestUserIds: [], locationInstructions: address });

    const queued = await request("/public-postings/event/request-join", { postingId }, member.token);
    expectPrivate(queued.posting);
    expect(queued.posting.joinRequestUserIds).toEqual([member.id]);
    const withdrawn = await request("/public-postings/event/respond", { postingId, accept: false }, member.token);
    expect(withdrawn.posting.joinRequestUserIds).toEqual([]);
    await request("/block", { targetKey: `user:${invitee.id}` }, host.token);
    expect(await lookup(invitee.token)).toBeUndefined();
    await request(discussion, undefined, invitee.token, undefined, 404);
    const cancel = `/public-postings/event/${nextDate.postingId}`;
    await request(cancel, undefined, member.token, "DELETE", 404);
    await request(cancel, undefined, host.token, "DELETE");
    const remaining = (await request("/public-postings?type=event", undefined, host.token)).postings;
    expect(remaining).toEqual(expect.arrayContaining([expect.objectContaining({ postingId })]));
    expect(remaining).not.toEqual(expect.arrayContaining([expect.objectContaining({ postingId: nextDate.postingId })]));
    await request(`${cancel}/discussion`, undefined, host.token, undefined, 404);
  });

  it("enforces Plus on posting creation without restricting free members from reading", async () => {
    const free = await account("posting-free");
    const draft = { type: "ad", title: "Posting smoke fixture", body: "Details", availability: "hosting" };
    await request("/public-postings", draft, free.token, undefined, 402);
    if (Date.now() >= LAUNCH_END_MS) return;
    const publisher = await account("posting-plus", false, BADEHAUS_FLYER_CODE);
    const published = await request("/public-postings", draft, publisher.token);
    expect(published.posting).toMatchObject({ authorUserId: publisher.id, availability: "hosting" });
    const feed = await request("/public-postings?type=ad", undefined, free.token);
    expect(feed.postings).toEqual(expect.arrayContaining([expect.objectContaining({
      postingId: published.posting.postingId, title: draft.title, availability: "hosting"
    })]));
  });

});
