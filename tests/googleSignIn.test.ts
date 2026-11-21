import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { createAuthService } from "../backend/src/services/authService";
import { createGoogleSignIn } from "../backend/src/services/googleSignIn";

const clientId = "test-client.apps.googleusercontent.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function credential(nonce: string, claims: Record<string, unknown> = {}) {
  return jwt.sign({
    nonce,
    aud: clientId,
    iss: "https://accounts.google.com",
    sub: "google-member",
    email: "member@gmail.com",
    email_verified: true,
    ...claims
  }, privateKey, { algorithm: "RS256", keyid: "test", expiresIn: "10m" });
}

describe("Google credential verification", () => {
  beforeEach(() => {
    type CertResponse = Awaited<ReturnType<OAuth2Client["getFederatedSignonCertsAsync"]>>;
    jest.spyOn(OAuth2Client.prototype, "getFederatedSignonCertsAsync").mockResolvedValue({
      certs: { test: publicKey.export({ type: "spki", format: "pem" }).toString() },
      format: "PEM" as CertResponse["format"]
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it("Given a signed Google credential When two requests use the same challenge Then only one can authenticate", async () => {
    const google = createGoogleSignIn(clientId);
    const { nonce } = google.challenge();
    const token = credential(nonce);
    const results = await Promise.all([google.verify(token, nonce), google.verify(token, nonce)]);
    expect(results).toEqual([{ email: "member@gmail.com", subject: "google-member" }, null]);
  });

  it("Given a Google credential for another client or issuer When verifying it Then Google authentication rejects it", async () => {
    const google = createGoogleSignIn(clientId);
    const { nonce } = google.challenge();
    await expect(google.verify(credential(nonce, { aud: "different-client" }), nonce)).rejects.toThrow(/audience/i);
    await expect(google.verify(credential(nonce, { iss: "https://example.com" }), nonce)).rejects.toThrow(/issuer/i);
  });

  it("Given a wrong challenge, an unverified email or a non-Google-managed address When verifying it Then no identity is returned", async () => {
    const google = createGoogleSignIn(clientId);
    const { nonce } = google.challenge();
    await expect(google.verify(credential("wrong"), nonce)).resolves.toBeNull();
    await expect(google.verify(credential(nonce, { email_verified: false }), nonce)).resolves.toBeNull();
    await expect(google.verify(credential(nonce, { email: "member@example.com" }), nonce)).resolves.toBeNull();
    await expect(google.verify(credential(nonce, { email: "member@example.com", hd: "example.com" }), nonce))
      .resolves.toEqual({ email: "member@example.com", subject: "google-member" });
  });

  it("Given an expired challenge When verifying a Google credential Then no identity is returned", async () => {
    const time = jest.spyOn(Date, "now").mockReturnValue(1000);
    const google = createGoogleSignIn(clientId);
    const { nonce } = google.challenge();
    time.mockReturnValue(1000 + 15 * 60 * 1000);
    await expect(google.verify(credential(nonce), nonce)).resolves.toBeNull();
  });
});

describe("Badehaus X accounts using Google", () => {
  const member = { email: "member@gmail.com", subject: "google-member" };
  const admin = { email: "admin@gmail.com", subject: "google-admin" };
  const password = "StrongPass1!";
  const deps = {
    jwtSecret: "fixture-secret",
    emailOnlyVerification: true,
    verificationCodeGenerator: () => "123456",
    adminEmails: [admin.email]
  };

  it("Given a new adult member When registering with Google Then creates a verified account that keeps its link after restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "red-door-google-"));
    try {
      const options = { ...deps, userStoreFilePath: join(dir, "users.json"), onVerificationCodeIssued: jest.fn() };
      const auth = createAuthService(options);
      const accepted = { accepted: true as const, termsVersion: "terms-v1", privacyVersion: "privacy-v1" };
      const result = auth.registerWithGoogle(member, 25, "", undefined, true, false, accepted);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.value.session).toMatchObject({ ageVerified: true, userType: "registered", role: "user" });
      expect(auth.resolveJWT(result.value.jwt)).toMatchObject({ ok: true, value: { userId: result.value.user.id } });
      expect(auth.getUser(result.value.user.id)).toMatchObject({
        emailVerified: true,
        emailOwnershipVerifiedAtMs: expect.any(Number),
        plusData: { analyticsConsent: true, registrationPolicy: accepted }
      });
      expect(options.onVerificationCodeIssued).not.toHaveBeenCalled();

      const restarted = createAuthService(options);
      expect(restarted.loginWithGoogle(member)).toMatchObject({ ok: true, value: { user: { id: result.value.user.id } } });
      expect(restarted.loginWithGoogle({ ...member, subject: "different-google-account" }))
        .toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_ACTION", message: "Use the Google account linked to your Badehaus X account." } });
      expect(restarted.registerWithGoogle({ ...member, email: "other@gmail.com" }, 25, ""))
        .toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_ACTION", message: "This Google account cannot be used to register. Try signing in." } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Given a minor or administrator When registering with Google Then refuses to create an account", () => {
    const auth = createAuthService({ ...deps, initialState: { users: [], sessions: [] } });
    expect(auth.registerWithGoogle(member, 17, "")).toMatchObject({
      ok: false, error: { code: "AGE_GATE_REQUIRED", message: "Declare an age between 18 and 120 to register." }
    });
    expect(auth.registerWithGoogle(admin, 25, "")).toMatchObject({
      ok: false, error: { code: "UNAUTHORIZED_ACTION", message: "This Google account cannot be used to register. Try signing in." }
    });
    expect(auth.listUsers()).toEqual([]);
  });

  it("Given an existing account When signing in with Google Then requires prior verification and honors bans", () => {
    const auth = createAuthService({
      ...deps,
      initialState: { users: [], sessions: [] },
      onVerificationCodeIssued: () => {}
    });
    expect(auth.register(member.email, password, "")).toMatchObject({ ok: true });
    expect(auth.loginWithGoogle(member)).toMatchObject({
      ok: false, error: { code: "UNAUTHORIZED_ACTION", message: "Use Google with a verified Badehaus X account, or sign in with your password." }
    });
    const verified = auth.verifyEmail(member.email, "123456");
    if (!verified.ok) throw new Error(verified.error.message);
    const id = verified.value.user.id;
    expect(auth.loginWithGoogle(member)).toMatchObject({ ok: true, value: { session: { userId: id, ageVerified: false } } });
    auth.banUser(id, "Policy violation");
    expect(auth.loginWithGoogle(member)).toMatchObject({ ok: false, error: { code: "USER_BANNED" } });
  });
});
