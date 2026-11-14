import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hasPlus, launchGrant, LAUNCH_CODE, LAUNCH_END_MS, limits } from "../shared/plus";
import { createAuthService } from "../backend/src/services/authService";
import { assertPlusPrice, signAlbumAccess, validAlbumAccess, verifyStripeEvent } from "../backend/src/services/subscriptionService";

// Acceptance: Plus never extends Cruise retention or safety rules; grants are account-bound,
// end at the published cutoff, and cannot be asserted by a checkout redirect or browser state.
describe("Plus access and launch redemption", () => {
  it("Given a launch code When redeemed before the Pacific cutoff Then grants only through the fixed end", () => {
    expect(launchGrant(" thereddoorlaunch ", LAUNCH_END_MS - 1)).toBe(LAUNCH_END_MS);
    expect(() => launchGrant(LAUNCH_CODE, LAUNCH_END_MS)).toThrow("expired");
    expect(() => launchGrant("OTHER", LAUNCH_END_MS - 1)).toThrow("Invalid");
    expect(() => launchGrant(123)).toThrow("Invalid");
    expect(launchGrant(undefined)).toBeUndefined();
    expect(launchGrant("")).toBeUndefined();
    expect(launchGrant(null)).toBeUndefined();
  });
  it("Given expired access or a guest When checked Then denies Plus even if the tier says premium", () => {
    expect(hasPlus({ userType: "registered", tier: "premium", plusExpiresAtMs: LAUNCH_END_MS }, LAUNCH_END_MS - 1)).toBe(true);
    expect(hasPlus({ userType: "registered", tier: "premium", plusExpiresAtMs: LAUNCH_END_MS }, LAUNCH_END_MS)).toBe(false);
    expect(hasPlus({ userType: "guest", tier: "premium" })).toBe(false);
    expect(limits({ userType: "registered", tier: "free" }).favorites).toBe(20);
    expect(limits({ userType: "registered", tier: "premium" }).privateAlbum).toBe(20);
  });
  it("Given a registration promo When the user signs in and time advances Then existing sessions downgrade and persisted grants survive restart", () => {
    let now = LAUNCH_END_MS - 86400000;
    const store = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rd-plus-")), "users.json");
    const svc = createAuthService({ jwtSecret: "test", nowMs: () => now, userStoreFilePath: store, skipEmailVerification: true });
    expect(svc.register("promo@example.com", "testing123", "", LAUNCH_CODE).ok).toBe(true);
    const login = svc.login("promo@example.com", "testing123"); if (!login.ok) throw new Error(login.error.message);
    expect(login.value.session.tier).toBe("premium");
    expect(login.value.session.plusExpiresAtMs).toBe(LAUNCH_END_MS);
    const userId = login.value.user.id;
    expect(svc.getUser("missing")).toBeUndefined();
    expect(svc.updatePlus("missing", { tier: "free" }).ok).toBe(false);
    expect(svc.updatePlus(userId, { plusData: { savedSearches: [{ name: "Nearby", filters: { online: true } }] } }).ok).toBe(true);
    const restored = createAuthService({ jwtSecret: "test", nowMs: () => now, userStoreFilePath: store, skipEmailVerification: true });
    expect(restored.getUser(userId)?.plusData?.savedSearches?.[0].name).toBe("Nearby");
    expect(restored.getUser(userId)?.plusExpiresAtMs).toBe(LAUNCH_END_MS);
    now = LAUNCH_END_MS;
    const refreshed = svc.getSession(login.value.session.sessionToken); if (!refreshed.ok) throw new Error(refreshed.error.message);
    expect(refreshed.value.tier).toBe("free");
    expect(svc.register("late@example.com", "testing123", "", LAUNCH_CODE).ok).toBe(false);
    expect(svc.getUser(userId)?.tier).toBe("premium"); // Expiry derives access; historical grant is retained.
    fs.rmSync(path.dirname(store), { recursive: true });
  });
  it("Given invalid or reused promo registration When rejected Then no account is created or existing expiry extended", () => {
    const store = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rd-plus-")), "users.json");
    const svc = createAuthService({ jwtSecret: "test", nowMs: () => LAUNCH_END_MS - 1000, userStoreFilePath: store, skipEmailVerification: true });
    expect(svc.register("bad@example.com", "testing123", "", "WRONG").ok).toBe(false);
    expect(svc.listUsers()).toHaveLength(0);
    expect(svc.register("ok@example.com", "testing123", "", LAUNCH_CODE).ok).toBe(true);
    expect(svc.register("ok@example.com", "testing123", "", LAUNCH_CODE).ok).toBe(false);
    expect(svc.listUsers()).toHaveLength(1);
    fs.rmSync(path.dirname(store), { recursive: true });
  });
  it("Given an admin account operation When inputs are invalid Then rejects and creates no unintended account", () => {
    const store = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rd-plus-")), "users.json");
    const svc = createAuthService({ jwtSecret: "test", userStoreFilePath: store, skipEmailVerification: true });
    expect(svc.adminCreateUser("bad", "pass123", null, "registered", "free", "user").ok).toBe(false);
    expect(svc.adminCreateUser("a@b.com", "pass123", "bad", "registered", "free", "user").ok).toBe(false);
    expect(svc.adminCreateUser("a@b.com", "x", null, "registered", "free", "user").ok).toBe(false);
    expect(svc.adminCreateUser("a@b.com", "pass123", null, "guest", "free", "user").ok).toBe(false);
    expect(svc.adminCreateUser("a@b.com", "pass123", null, "registered", "premium", "admin").ok).toBe(true);
    expect(svc.adminCreateUser("a@b.com", "pass123", null, "registered", "free", "user").ok).toBe(false);
    const login = svc.login("a@b.com", "pass123"); if (!login.ok) throw new Error(login.error.message);
    expect(svc.getSession(login.value.session.sessionToken).ok).toBe(true);
    expect(svc.snapshotState().users).toHaveLength(1);
    fs.rmSync(path.dirname(store), { recursive: true });
  });
});

describe("Billing and private media trust boundaries", () => {
  it("Given a webhook When its body or timestamp is tampered with Then rejects the signature", () => {
    const now = Date.now(), timestamp = Math.floor(now / 1000), body = Buffer.from('{"type":"invoice.paid"}');
    const mac = crypto.createHmac("sha256", "secret").update(`${timestamp}.`).update(body).digest("hex");
    expect(verifyStripeEvent(body, `t=${timestamp},v1=${mac}`, "secret", now).type).toBe("invoice.paid");
    expect(() => verifyStripeEvent(Buffer.from("{}"), `t=${timestamp},v1=${mac}`, "secret", now)).toThrow("signature");
    expect(() => verifyStripeEvent(body, `t=${timestamp},v1=${mac}`, "secret", now + 301000)).toThrow("timestamp");
    expect(() => verifyStripeEvent(body, `t=${timestamp},v1=abc`, "secret", now)).toThrow("signature");
  });
  it("Given a Stripe price When currency, amount or renewal period differs Then rejects checkout", () => {
    const price = { active: true, unit_amount: 799, currency: "cad", recurring: { interval: "month", interval_count: 1 } };
    expect(() => assertPlusPrice(price)).not.toThrow();
    for (const changed of [{...price, currency:"usd"}, {...price, unit_amount:999}, {...price, active:false}, {...price, recurring:{interval:"year", interval_count:1}}]) expect(() => assertPlusPrice(changed)).toThrow("CAD");
  });
  it("Given a private photo link When the viewer, media, expiry or signature changes Then access fails", () => {
    const now = Date.now(), end = now + 60000, signature = signAlbumAccess("test", "owner", "viewer", "photo", end);
    expect(validAlbumAccess("test", "owner", "viewer", "photo", end, signature, now)).toBe(true);
    expect(validAlbumAccess("test", "owner", "attacker", "photo", end, signature, now)).toBe(false);
    expect(validAlbumAccess("test", "owner", "viewer", "other", end, signature, now)).toBe(false);
    expect(validAlbumAccess("test", "owner", "viewer", "photo", end, signature, end)).toBe(false);
    expect(validAlbumAccess("test", "owner", "viewer", "photo", end, "bad", now)).toBe(false);
  });
});

describe("Stripe requests", () => {
  it("Given missing credentials or a provider failure When calling Stripe Then fails without granting access", async () => {
    const { stripeRequest } = await import("../backend/src/services/subscriptionService");
    const previous = process.env.STRIPE_SECRET_KEY, oldFetch = global.fetch;
    try {
      delete process.env.STRIPE_SECRET_KEY;
      await expect(stripeRequest("prices/test")).rejects.toThrow("not configured");
      process.env.STRIPE_SECRET_KEY = "test-only-not-a-real-key";
      const mock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/test" }) });
      global.fetch = mock;
      const body = new URLSearchParams({ mode: "subscription" });
      await expect(stripeRequest("checkout/sessions", body)).resolves.toEqual({ url: "https://checkout.stripe.com/test" });
      expect(mock).toHaveBeenCalledWith("https://api.stripe.com/v1/checkout/sessions", expect.objectContaining({ method: "POST", body, headers: expect.objectContaining({ "Stripe-Version": "2024-06-20" }) }));
      mock.mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Provider detail" } }) });
      await expect(stripeRequest("prices/test")).rejects.toThrow("billing provider");
    } finally { global.fetch = oldFetch; if (previous === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previous; }
  });
});
