import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { createAuthService } from "../backend/src/services/authService";

function tempStorePath(): string {
  return path.join(os.tmpdir(), `reddoor-auth-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

describe("authService", () => {
  it("Given an empty jwtSecret When creating the auth service Then it throws deterministically", () => {
    expect(() => createAuthService({ jwtSecret: "" })).toThrow("AuthService requires a non-empty jwtSecret.");
  });

  it("Given an invalid guest session lifetime When creating the auth service Then it throws deterministically", () => {
    expect(() => createAuthService({ jwtSecret: "test_secret", guestSessionLifetimeMinutes: 0 })).toThrow(
      "AuthService requires a positive guestSessionLifetimeMinutes."
    );
  });

  it("Given an invalid verification code ttl When creating the auth service Then it throws deterministically", () => {
    expect(() => createAuthService({ jwtSecret: "test_secret", verificationCodeTtlMinutes: 0 })).toThrow(
      "AuthService requires a positive verificationCodeTtlMinutes."
    );
  });

  it("Given an invalid persisted auth store format When creating the auth service Then it throws deterministically", () => {
    const store = tempStorePath();
    fs.mkdirSync(path.dirname(store), { recursive: true });
    fs.writeFileSync(store, JSON.stringify({ version: 2, users: [] }), "utf8");
    expect(() => createAuthService({ jwtSecret: "test_secret", userStoreFilePath: store })).toThrow("Invalid auth user store format.");
  });

  it("Given an invalid verification code generator When register is called Then it throws deterministically", () => {
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      verificationCodeGenerator: () => "abc"
    });
    expect(() => svc.register("user@example.com", "StrongPass1!", "+15555551234")).toThrow("Verification code generator must return a 6-digit code.");
  });

  it("Given no existing user When register is called Then it requires email verification and does not create a session yet", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });

    const result = svc.register("User@Example.com", "StrongPass1!", "+15555551234");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value).toEqual({ email: "user@example.com", verificationRequired: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.destination).toBe("+15555551234");
    expect(sent[0]?.code).toMatch(/^\d{6}$/);
  });

  it("Given an existing user When register is called with the same email Then it rejects deterministically with UNAUTHORIZED_ACTION", () => {
    const svc = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: tempStorePath() });

    const first = svc.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(first.ok).toBe(true);

    const second = svc.register("USER@example.com", "StrongPass1!", "+15555551234");
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");

    expect(second.error).toEqual({
      code: "UNAUTHORIZED_ACTION",
      message: "Email already registered."
    });
  });

  it("Given an invalid email When register is called Then it rejects deterministically with UNAUTHORIZED_ACTION", () => {
    const svc = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: tempStorePath() });

    const result = svc.register("not-an-email", "StrongPass1!", "+15555551234");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toEqual({
      code: "UNAUTHORIZED_ACTION",
      message: "Invalid email."
    });
  });

  it("Given a weak password When register is called Then it rejects deterministically with UNAUTHORIZED_ACTION", () => {
    const svc = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: tempStorePath() });

    const result = svc.register("user@example.com", "short", "+15555551234");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toEqual({
      code: "UNAUTHORIZED_ACTION",
      message: "Invalid password. Use at least 10 chars with uppercase, lowercase, number, and symbol."
    });
  });

  it("Given an unverified account When login is called Then it rejects with EMAIL_VERIFICATION_REQUIRED", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });

    const reg = svc.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);

    const login = svc.login("user@example.com", "StrongPass1!");

    expect(login.ok).toBe(false);
    if (login.ok) throw new Error("unreachable");
    expect(login.error).toEqual({
      code: "EMAIL_VERIFICATION_REQUIRED",
      message: "Phone verification required before login.",
      context: { email: "user@example.com", phoneE164: "+15555551234" }
    });
    expect(sent.length).toBeGreaterThanOrEqual(2);
  });

  it("Given an issued code When verifyEmail is called with a valid code Then it verifies and returns JWT + session", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });

    const reg = svc.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);

    const code = sent[sent.length - 1]?.code;
    expect(typeof code).toBe("string");

    const verified = svc.verifyEmail("user@example.com", code as string);
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error("unreachable");
    expect(verified.value.user.email).toBe("user@example.com");
    expect(typeof verified.value.jwt).toBe("string");
    expect(verified.value.session.userType).toBe("registered");
    expect(verified.value.session.mode).toBe("cruise");
  });

  it("Given an issued code When verifyEmail is called with an invalid code Then it rejects with INVALID_VERIFICATION_CODE", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });

    const reg = svc.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);

    const verified = svc.verifyEmail("user@example.com", "999999");
    expect(verified.ok).toBe(false);
    if (verified.ok) throw new Error("unreachable");
    expect(verified.error).toEqual({
      code: "INVALID_VERIFICATION_CODE",
      message: "Invalid or expired verification code."
    });
  });

  it("Given a non-string verification request When verifyEmail is called Then it rejects with UNAUTHORIZED_ACTION", () => {
    const svc = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: tempStorePath() });
    const res = svc.verifyEmail(123 as unknown as string, null as unknown as string);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid verification request." });
  });

  it("Given a verified user When verifyEmail is called again Then it returns a new session", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });
    const reg = svc.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);
    const first = svc.verifyEmail("user@example.com", sent[0]?.code ?? "");
    expect(first.ok).toBe(true);
    const second = svc.verifyEmail("user@example.com", "000000");
    expect(second.ok).toBe(true);
  });

  it("Given an unverified user with no code fields in store When verifyEmail is called Then it rejects with INVALID_VERIFICATION_CODE", () => {
    const store = tempStorePath();
    const svcA = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: store });
    const reg = svcA.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);
    const raw = JSON.parse(fs.readFileSync(store, "utf8")) as { version: number; users: Array<Record<string, unknown>> };
    raw.users[0].verificationCodeSaltB64 = null;
    raw.users[0].verificationCodeHashB64 = null;
    raw.users[0].verificationCodeExpiresAtMs = null;
    fs.writeFileSync(store, JSON.stringify(raw), "utf8");
    const svcB = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: store });
    const verify = svcB.verifyEmail("user@example.com", "123456");
    expect(verify.ok).toBe(false);
    if (verify.ok) throw new Error("unreachable");
    expect(verify.error).toEqual({ code: "INVALID_VERIFICATION_CODE", message: "Invalid or expired verification code." });
  });

  it("Given an issued code that has expired When verifyEmail is called Then it rejects with INVALID_VERIFICATION_CODE", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const start = 1_700_000_000_000;
    let now = start;
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      nowMs: () => now,
      verificationCodeTtlMinutes: 1,
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });

    const reg = svc.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);

    now = start + 61_000;
    const verified = svc.verifyEmail("user@example.com", sent[0]?.code ?? "");
    expect(verified.ok).toBe(false);
    if (verified.ok) throw new Error("unreachable");
    expect(verified.error).toEqual({
      code: "INVALID_VERIFICATION_CODE",
      message: "Invalid or expired verification code."
    });
  });

  it("Given a verified user When login is called with correct credentials Then it returns a JWT and a session", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });

    const reg = svc.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);

    const verified = svc.verifyEmail("user@example.com", sent[0]?.code ?? "");
    expect(verified.ok).toBe(true);

    const login = svc.login("user@example.com", "StrongPass1!");
    expect(login.ok).toBe(true);
    if (!login.ok) throw new Error("unreachable");
    expect(login.value.user.email).toBe("user@example.com");
    expect(typeof login.value.jwt).toBe("string");
    expect(login.value.session.userType).toBe("registered");
  });

  it("Given an existing user When login is called with a wrong password Then it rejects deterministically with UNAUTHORIZED_ACTION", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });
    const reg = svc.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);
    const verified = svc.verifyEmail("user@example.com", sent[0]?.code ?? "");
    expect(verified.ok).toBe(true);

    const login = svc.login("user@example.com", "wrongpassword");

    expect(login.ok).toBe(false);
    if (login.ok) throw new Error("unreachable");
    expect(login.error).toEqual({
      code: "UNAUTHORIZED_ACTION",
      message: "Invalid credentials."
    });
  });

  it("Given no existing user When login is called Then it rejects deterministically with UNAUTHORIZED_ACTION", () => {
    const svc = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: tempStorePath() });

    const login = svc.login("user@example.com", "StrongPass1!");

    expect(login.ok).toBe(false);
    if (login.ok) throw new Error("unreachable");
    expect(login.error).toEqual({
      code: "UNAUTHORIZED_ACTION",
      message: "Invalid credentials."
    });
  });

  it("Given non-string inputs When login is called Then it rejects deterministically with UNAUTHORIZED_ACTION", () => {
    const svc = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: tempStorePath() });

    const login = svc.login(123 as unknown as string, null as unknown as string);

    expect(login.ok).toBe(false);
    if (login.ok) throw new Error("unreachable");
    expect(login.error).toEqual({
      code: "UNAUTHORIZED_ACTION",
      message: "Invalid credentials."
    });
  });

  it("Given a persisted user store When a new service instance is created Then login works with previously registered credentials", () => {
    const store = tempStorePath();
    const sent: Array<{ destination: string; code: string }> = [];

    const svcA = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: store,
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });
    const reg = svcA.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);
    const verified = svcA.verifyEmail("user@example.com", sent[0]?.code ?? "");
    expect(verified.ok).toBe(true);

    const svcB = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: store,
      onVerificationCodeIssued: () => undefined
    });

    const login = svcB.login("user@example.com", "StrongPass1!");
    expect(login.ok).toBe(true);
  });

  it("Given a request for a guest session When createGuestSession is called Then it issues an expiring guest session in Cruise mode", () => {
    const start = 1_700_000_000_000;
    let now = start;
    const svc = createAuthService({
      jwtSecret: "test_secret",
      nowMs: () => now,
      guestSessionLifetimeMinutes: 120,
      userStoreFilePath: tempStorePath()
    });

    const guest = svc.createGuestSession();

    expect(guest.ok).toBe(true);
    if (!guest.ok) throw new Error("unreachable");
    expect(guest.value.session.userType).toBe("guest");
    expect(guest.value.session.tier).toBe("free");
    expect(guest.value.session.mode).toBe("cruise");
    expect(guest.value.session.ageVerified).toBe(false);
    expect(guest.value.session.hybridOptIn).toBe(false);
    expect(guest.value.session.expiresAtMs).toBe(start + 120 * 60 * 1000);

    const fetched = svc.getSession(guest.value.session.sessionToken);
    expect(fetched.ok).toBe(true);

    now = start + 120 * 60 * 1000;
    const expired = svc.getSession(guest.value.session.sessionToken);
    expect(expired.ok).toBe(false);
    if (expired.ok) throw new Error("unreachable");
    expect(expired.error).toEqual({
      code: "INVALID_SESSION",
      message: "Session expired."
    });
  });

  it("Given an empty session token When getSession is called Then it rejects deterministically with INVALID_SESSION", () => {
    const svc = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: tempStorePath() });

    const result = svc.getSession("");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toEqual({
      code: "INVALID_SESSION",
      message: "Invalid session."
    });
  });

  it("Given an unknown session token When getSession is called Then it rejects deterministically with INVALID_SESSION", () => {
    const svc = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: tempStorePath() });

    const result = svc.getSession("not-a-real-token");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toEqual({
      code: "INVALID_SESSION",
      message: "Invalid session."
    });
  });

  it("Given an invalid user object When issueJWT is called Then it rejects deterministically with UNAUTHORIZED_ACTION", () => {
    const svc = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: tempStorePath() });

    const result = svc.issueJWT({
      id: "",
      email: "user@example.com",
      userType: "registered",
      tier: "free"
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toEqual({
      code: "UNAUTHORIZED_ACTION",
      message: "Invalid user."
    });
  });

  it("Given a valid user object When issueJWT is called Then it returns a signed JWT string", () => {
    const svc = createAuthService({ jwtSecret: "test_secret", userStoreFilePath: tempStorePath() });

    const token = svc.issueJWT({
      id: "u_1",
      email: "user@example.com",
      userType: "registered",
      tier: "free"
    });

    expect(token.ok).toBe(true);
    if (!token.ok) throw new Error("unreachable");
    expect(typeof token.value).toBe("string");
    expect(token.value.length).toBeGreaterThan(10);
  });

  it("Given a valid session token When verifyAge is called with age < 18 Then it rejects deterministically with AGE_GATE_REQUIRED", () => {
    const now = 1_700_000_000_000;
    const svc = createAuthService({ jwtSecret: "test_secret", nowMs: () => now, userStoreFilePath: tempStorePath() });
    const guest = svc.createGuestSession();
    expect(guest.ok).toBe(true);
    if (!guest.ok) throw new Error("unreachable");

    const res = svc.verifyAge(guest.value.session.sessionToken, 17);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({
      code: "AGE_GATE_REQUIRED",
      message: "You must be 18 or older to use Red Door.",
      context: { minimumAge: 18 }
    });
  });

  it("Given a verified registered session without age verification When setHybridOptIn is called Then it rejects with AGE_GATE_REQUIRED", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });
    const reg = svc.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);
    const verified = svc.verifyEmail("user@example.com", sent[0]?.code ?? "");
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error("unreachable");

    const res = svc.setHybridOptIn(verified.value.session.sessionToken, true);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({
      code: "AGE_GATE_REQUIRED",
      message: "You must be 18 or older to use Red Door.",
      context: { minimumAge: 18 }
    });
  });

  it("Given verified users When listRegisteredUserIds is called Then it returns only verified ids", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });

    const a = svc.register("a@example.com", "StrongPass1!", "+15555551234");
    const b = svc.register("b@example.com", "StrongPass2!", "+15555551235");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const codeForA = sent.find((x) => x.destination === "+15555551234")?.code ?? "";
    const verifiedA = svc.verifyEmail("a@example.com", codeForA);
    expect(verifiedA.ok).toBe(true);
    if (!verifiedA.ok) throw new Error("unreachable");

    const ids = svc.listRegisteredUserIds();
    expect(ids).toEqual([verifiedA.value.user.id]);
  });

  it("Given resend verification scenarios When resendVerificationCode is called Then deterministic outcomes are returned", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });
    const invalid = svc.resendVerificationCode("not-an-email");
    expect(invalid.ok).toBe(false);
    if (invalid.ok) throw new Error("unreachable");
    expect(invalid.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid email." });

    const missing = svc.resendVerificationCode("missing@example.com");
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error("unreachable");
    expect(missing.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Email not registered." });

    const reg = svc.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);
    const resent = svc.resendVerificationCode("user@example.com");
    expect(resent.ok).toBe(true);
    if (!resent.ok) throw new Error("unreachable");
    expect(resent.value).toEqual({ email: "user@example.com", verificationRequired: true });

    const verified = svc.verifyEmail("user@example.com", sent[sent.length - 1]?.code ?? "");
    expect(verified.ok).toBe(true);
    const already = svc.resendVerificationCode("user@example.com");
    expect(already.ok).toBe(false);
    if (already.ok) throw new Error("unreachable");
    expect(already.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Email already verified." });
  });

  it("Given a verified + age-verified user When setHybridOptIn and setMode are called Then the session updates are persisted", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });
    const reg = svc.register("user@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);
    const verified = svc.verifyEmail("user@example.com", sent[0]?.code ?? "");
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error("unreachable");
    const aged = svc.verifyAge(verified.value.session.sessionToken, 30);
    expect(aged.ok).toBe(true);
    if (!aged.ok) throw new Error("unreachable");
    const opt = svc.setHybridOptIn(aged.value.sessionToken, true);
    expect(opt.ok).toBe(true);
    if (!opt.ok) throw new Error("unreachable");
    const mode = svc.setMode(opt.value.sessionToken, "hybrid");
    expect(mode.ok).toBe(true);
    if (!mode.ok) throw new Error("unreachable");
    expect(mode.value.mode).toBe("hybrid");
  });

  it("Given an initial auth state When service is created Then state is hydrated and snapshotState returns users/sessions", () => {
    const svc = createAuthService({
      jwtSecret: "test_secret",
      initialState: {
        users: [
          {
            id: "u1",
            email: "seed@example.com",
            phoneE164: "+15555550000",
            userType: "registered",
            tier: "free",
            ageVerified: true,
            emailVerified: true,
            verificationCodeSaltB64: null,
            verificationCodeHashB64: null,
            verificationCodeExpiresAtMs: null,
            passwordSaltB64: Buffer.from("salt").toString("base64"),
            passwordHashB64: Buffer.from("hash").toString("base64"),
            createdAtMs: 1_700_000_000_000
          }
        ],
        sessions: [
          {
            sessionToken: "s1",
            userType: "registered",
            tier: "free",
            mode: "cruise",
            userId: "u1",
            ageVerified: true,
            hybridOptIn: false,
            expiresAtMs: Date.now() + 60_000
          }
        ]
      }
    });

    const session = svc.getSession("s1");
    expect(session.ok).toBe(true);
    const snapshot = svc.snapshotState();
    expect(snapshot.users).toHaveLength(1);
    expect(snapshot.sessions).toHaveLength(1);
  });

  it("Given onStateChanged throws When auth mutates state Then operation still succeeds", () => {
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onStateChanged: () => {
        throw new Error("persist failed");
      }
    });
    const res = svc.createGuestSession();
    expect(res.ok).toBe(true);
  });

  it("Given edge auth validation paths When called Then explicit errors are returned", () => {
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath()
    });

    const badPhone = svc.register("user@example.com", "StrongPass1!", "123");
    expect(badPhone.ok).toBe(false);
    if (badPhone.ok) throw new Error("unreachable");
    expect(badPhone.error.code).toBe("UNAUTHORIZED_ACTION");

    const missingVerify = svc.verifyEmail("missing@example.com", "123456");
    expect(missingVerify.ok).toBe(false);
    if (missingVerify.ok) throw new Error("unreachable");
    expect(missingVerify.error.code).toBe("INVALID_VERIFICATION_CODE");

    const guest = svc.createGuestSession();
    expect(guest.ok).toBe(true);
    if (!guest.ok) throw new Error("unreachable");

    const badAge = svc.verifyAge(guest.value.session.sessionToken, Number.NaN);
    expect(badAge.ok).toBe(false);
    if (badAge.ok) throw new Error("unreachable");
    expect(badAge.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid age." });

    const guestHybrid = svc.setHybridOptIn(guest.value.session.sessionToken, true);
    expect(guestHybrid.ok).toBe(false);
    if (guestHybrid.ok) throw new Error("unreachable");
    expect(guestHybrid.error.code).toBe("ANONYMOUS_FORBIDDEN");
  });

  it("Given a non-hybrid-capable session When setMode is called to hybrid Then mode transition is rejected", () => {
    const sent: Array<{ destination: string; code: string }> = [];
    const svc = createAuthService({
      jwtSecret: "test_secret",
      userStoreFilePath: tempStorePath(),
      onVerificationCodeIssued: (destination, code) => sent.push({ destination, code })
    });
    const reg = svc.register("hybrid@example.com", "StrongPass1!", "+15555551234");
    expect(reg.ok).toBe(true);
    const verified = svc.verifyEmail("hybrid@example.com", sent[0]?.code ?? "");
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error("unreachable");
    const aged = svc.verifyAge(verified.value.session.sessionToken, 30);
    expect(aged.ok).toBe(true);
    if (!aged.ok) throw new Error("unreachable");

    const mode = svc.setMode(aged.value.sessionToken, "hybrid");
    expect(mode.ok).toBe(false);
    if (mode.ok) throw new Error("unreachable");
    expect(mode.error.code).toBe("INVALID_MODE_TRANSITION");
  });
});
