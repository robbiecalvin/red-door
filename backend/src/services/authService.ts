import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

import * as modeService from "./modeService";

export type UserType = "guest" | "registered" | "subscriber";
export type SubscriptionTier = "free" | "premium";
export type Mode = "cruise" | "date" | "hybrid";

export type ErrorCode =
  | "INVALID_SESSION"
  | "UNAUTHORIZED_ACTION"
  | "RATE_LIMITED"
  | "AGE_GATE_REQUIRED"
  | "ANONYMOUS_FORBIDDEN"
  | "INVALID_MODE_TRANSITION"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "INVALID_VERIFICATION_CODE";

export type ServiceError = {
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
};

type ResultOk<T> = { ok: true; value: T };
type ResultErr = { ok: false; error: ServiceError };
export type Result<T> = ResultOk<T> | ResultErr;

export type StoredUser = Readonly<{
  id: string;
  email: string;
  phoneE164: string | null;
  userType: Exclude<UserType, "guest">;
  tier: SubscriptionTier;
  ageVerified: boolean;
  emailVerified: boolean;
  verificationCodeSaltB64: string | null;
  verificationCodeHashB64: string | null;
  verificationCodeExpiresAtMs: number | null;
  passwordSaltB64: string;
  passwordHashB64: string;
  createdAtMs: number;
}>;

export type Session = Readonly<{
  sessionToken: string;
  userType: UserType;
  tier: SubscriptionTier;
  mode: Mode;
  userId?: string;
  ageVerified: boolean;
  hybridOptIn: boolean;
  expiresAtMs: number;
}>;

export type RegisterResult = Readonly<{
  email: string;
  verificationRequired: true;
}>;

export type LoginResult = VerifyEmailResult;

export type VerifyEmailResult = Readonly<{
  user: Pick<StoredUser, "id" | "email" | "userType" | "tier">;
  jwt: string;
  session: Session;
}>;

export type GuestSessionResult = Readonly<{
  session: Session;
}>;

export type AuthService = Readonly<{
  createGuestSession(): Result<GuestSessionResult>;
  register(email: string, password: string, phoneE164: string): Result<RegisterResult>;
  verifyEmail(email: string, code: string): Result<VerifyEmailResult>;
  resendVerificationCode(email: string): Result<RegisterResult>;
  login(email: string, password: string): Result<VerifyEmailResult>;
  issueJWT(user: Pick<StoredUser, "id" | "email" | "userType" | "tier">): Result<string>;
  getSession(sessionToken: string): Result<Session>;
  verifyAge(sessionToken: string, ageYears: number): Result<Session>;
  setHybridOptIn(sessionToken: string, optIn: boolean): Result<Session>;
  setMode(sessionToken: string, mode: Mode): Result<Session>;
  listRegisteredUserIds(): ReadonlyArray<string>;
  snapshotState(): AuthStateSnapshot;
}>;

export type AuthStateSnapshot = Readonly<{
  users: ReadonlyArray<StoredUser>;
  sessions: ReadonlyArray<Session>;
}>;

export type AuthServiceDeps = Readonly<{
  jwtSecret: string;
  nowMs?: () => number;
  guestSessionLifetimeMinutes?: number;
  userStoreFilePath?: string;
  verificationCodeTtlMinutes?: number;
  verificationCodeGenerator?: () => string;
  skipEmailVerification?: boolean;
  initialState?: AuthStateSnapshot;
  onStateChanged?: (state: AuthStateSnapshot) => void;
  onVerificationCodeIssued?: (
    destination: string,
    code: string,
    channel: "sms" | "email",
    user: Pick<StoredUser, "email" | "phoneE164" | "id">
  ) => void;
}>;

const DEFAULT_GUEST_SESSION_LIFETIME_MINUTES = 120;
const PASSWORD_SCRYPT_N = 16384;
const PASSWORD_SCRYPT_R = 8;
const PASSWORD_SCRYPT_P = 1;
const PASSWORD_HASH_BYTES = 64;
const PASSWORD_SALT_BYTES = 16;
const DEFAULT_VERIFICATION_CODE_TTL_MINUTES = 15;
const DEFAULT_USER_STORE_FILE_PATH = path.resolve(process.cwd(), "backend/.data/auth-users.json");

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  const error: ServiceError = context ? { code, message, context } : { code, message };
  return { ok: false, error };
}

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isLikelyValidEmail(email: string): boolean {
  // Minimal deterministic validation; format correctness beyond this is not defined in product docs.
  const value = normalizeEmail(email);
  if (value.length < 3) return false;
  const at = value.indexOf("@");
  if (at <= 0) return false;
  if (at !== value.lastIndexOf("@")) return false;
  const dot = value.indexOf(".", at + 2);
  if (dot === -1) return false;
  return true;
}

function isLikelyValidPhoneE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

function isStrongPassword(password: string): boolean {
  if (typeof password !== "string" || password.length < 10) return false;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  return hasLower && hasUpper && hasDigit && hasSymbol;
}

function hashPassword(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, PASSWORD_HASH_BYTES, {
    N: PASSWORD_SCRYPT_N,
    r: PASSWORD_SCRYPT_R,
    p: PASSWORD_SCRYPT_P
  });
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const nowMs = deps.nowMs ?? (() => Date.now());
  const guestSessionLifetimeMinutes = deps.guestSessionLifetimeMinutes ?? DEFAULT_GUEST_SESSION_LIFETIME_MINUTES;
  const verificationCodeTtlMinutes = deps.verificationCodeTtlMinutes ?? DEFAULT_VERIFICATION_CODE_TTL_MINUTES;
  const skipEmailVerification = deps.skipEmailVerification === true;
  const jwtSecret = deps.jwtSecret;
  const userStoreFilePath = deps.userStoreFilePath ?? DEFAULT_USER_STORE_FILE_PATH;
  const useFilePersistence = deps.initialState === undefined;
  const codeGenerator =
    deps.verificationCodeGenerator ??
    (() => {
      const n = crypto.randomInt(0, 1_000_000);
      return String(n).padStart(6, "0");
    });
  const onVerificationCodeIssued =
    deps.onVerificationCodeIssued ??
    ((destination: string, code: string, channel: "sms" | "email") => {
      // Dev fallback when no SMTP provider is configured.
      console.log(`[RedDoor] Verification code via ${channel} for ${destination}: ${code}`);
    });
  const onStateChanged = deps.onStateChanged;

  if (typeof jwtSecret !== "string" || jwtSecret.trim() === "") {
    // Deterministic, explicit failure: without a secret we cannot issue/verify JWTs.
    throw new Error("AuthService requires a non-empty jwtSecret.");
  }
  if (!Number.isFinite(guestSessionLifetimeMinutes) || guestSessionLifetimeMinutes <= 0) {
    throw new Error("AuthService requires a positive guestSessionLifetimeMinutes.");
  }
  if (!Number.isFinite(verificationCodeTtlMinutes) || verificationCodeTtlMinutes <= 0) {
    throw new Error("AuthService requires a positive verificationCodeTtlMinutes.");
  }

  const usersByEmail = new Map<string, StoredUser>();
  const usersById = new Map<string, StoredUser>();
  const sessionsByToken = new Map<string, Session>();

  function snapshotStateInternal(): AuthStateSnapshot {
    return {
      users: Array.from(usersById.values()),
      sessions: Array.from(sessionsByToken.values())
    };
  }

  function notifyStateChanged(): void {
    if (!onStateChanged) return;
    try {
      onStateChanged(snapshotStateInternal());
    } catch {
      // Persistence hooks are best-effort and must not break auth paths.
    }
  }

  function persistUsers(): void {
    if (!useFilePersistence) return;
    const dir = path.dirname(userStoreFilePath);
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      version: 1,
      users: Array.from(usersById.values())
    };
    fs.writeFileSync(userStoreFilePath, JSON.stringify(payload), "utf8");
  }

  function loadUsers(): void {
    if (!fs.existsSync(userStoreFilePath)) {
      return;
    }
    const raw = fs.readFileSync(userStoreFilePath, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as { version?: unknown; users?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.users)) {
      throw new Error("Invalid auth user store format.");
    }
    for (const candidate of parsed.users) {
      if (typeof candidate !== "object" || candidate === null) continue;
      const c = candidate as Record<string, unknown>;
      if (
        typeof c.id !== "string" ||
        typeof c.email !== "string" ||
        !(typeof c.phoneE164 === "string" || c.phoneE164 === null || c.phoneE164 === undefined) ||
        (c.userType !== "registered" && c.userType !== "subscriber") ||
        (c.tier !== "free" && c.tier !== "premium") ||
        !(typeof c.ageVerified === "boolean" || c.ageVerified === undefined) ||
        typeof c.emailVerified !== "boolean" ||
        !(typeof c.verificationCodeSaltB64 === "string" || c.verificationCodeSaltB64 === null) ||
        !(typeof c.verificationCodeHashB64 === "string" || c.verificationCodeHashB64 === null) ||
        !(typeof c.verificationCodeExpiresAtMs === "number" || c.verificationCodeExpiresAtMs === null) ||
        typeof c.passwordSaltB64 !== "string" ||
        typeof c.passwordHashB64 !== "string" ||
        typeof c.createdAtMs !== "number"
      ) {
        continue;
      }
      const user: StoredUser = {
        id: c.id,
        email: normalizeEmail(c.email),
        phoneE164: typeof c.phoneE164 === "string" ? c.phoneE164 : null,
        userType: c.userType,
        tier: c.tier,
        ageVerified: c.ageVerified === true,
        emailVerified: c.emailVerified,
        verificationCodeSaltB64: c.verificationCodeSaltB64,
        verificationCodeHashB64: c.verificationCodeHashB64,
        verificationCodeExpiresAtMs: c.verificationCodeExpiresAtMs,
        passwordSaltB64: c.passwordSaltB64,
        passwordHashB64: c.passwordHashB64,
        createdAtMs: c.createdAtMs
      };
      usersByEmail.set(user.email, user);
      usersById.set(user.id, user);
    }
  }

  function hydrateInitialState(state: AuthStateSnapshot): void {
    for (const candidate of state.users) {
      if (!candidate || typeof candidate !== "object") continue;
      usersById.set(candidate.id, candidate);
      usersByEmail.set(candidate.email, candidate);
    }
    for (const session of state.sessions) {
      if (!session || typeof session !== "object") continue;
      if (typeof session.sessionToken !== "string" || session.sessionToken.trim() === "") continue;
      sessionsByToken.set(session.sessionToken, session);
    }
  }

  function userPublic(user: StoredUser): Pick<StoredUser, "id" | "email" | "userType" | "tier"> {
    return { id: user.id, email: user.email, userType: user.userType, tier: user.tier };
  }

  function setVerificationCode(user: StoredUser, now: number): StoredUser {
    const code = codeGenerator();
    if (!/^\d{6}$/.test(code)) {
      throw new Error("Verification code generator must return a 6-digit code.");
    }
    const salt = crypto.randomBytes(PASSWORD_SALT_BYTES);
    const hash = hashPassword(code, salt);
    const updated: StoredUser = {
      ...user,
      verificationCodeSaltB64: salt.toString("base64"),
      verificationCodeHashB64: hash.toString("base64"),
      verificationCodeExpiresAtMs: now + verificationCodeTtlMinutes * 60 * 1000
    };
    usersByEmail.set(updated.email, updated);
    usersById.set(updated.id, updated);
    persistUsers();
    const destination = typeof updated.phoneE164 === "string" && isLikelyValidPhoneE164(updated.phoneE164) ? updated.phoneE164 : updated.email;
    const channel: "sms" | "email" = destination === updated.email ? "email" : "sms";
    onVerificationCodeIssued(destination, code, channel, {
      id: updated.id,
      email: updated.email,
      phoneE164: updated.phoneE164
    });
    return updated;
  }

  if (deps.initialState) {
    hydrateInitialState(deps.initialState);
  } else {
    loadUsers();
  }

  function issueJWTInternal(
    user: Pick<StoredUser, "id" | "email" | "userType" | "tier">,
    issuedAtMs: number
  ): string {
    return jwt.sign(
      {
        email: user.email,
        userType: user.userType,
        tier: user.tier,
        iat: Math.floor(issuedAtMs / 1000)
      },
      jwtSecret,
      {
        algorithm: "HS256",
        subject: user.id
      }
    );
  }

  function createSessionForUser(user: StoredUser, issuedAtMs: number): Session {
    const sessionToken = crypto.randomUUID();
    // Default mode is not specified; using "cruise" is always legal and does not assume Date access.
    const session: Session = {
      sessionToken,
      userType: user.userType,
      tier: user.tier,
      mode: "cruise",
      userId: user.id,
      ageVerified: user.ageVerified === true,
      hybridOptIn: false,
      // Registered sessions are not defined as expiring in the spec; give them a long-lived token for MVP.
      expiresAtMs: issuedAtMs + 1000 * 60 * 60 * 24 * 365
    };
    sessionsByToken.set(sessionToken, session);
    notifyStateChanged();
    return session;
  }

  function createGuestSessionInternal(issuedAtMs: number): Session {
    const sessionToken = crypto.randomUUID();
    const expiresAtMs = issuedAtMs + guestSessionLifetimeMinutes * 60 * 1000;
    const session: Session = {
      sessionToken,
      userType: "guest",
      tier: "free",
      mode: "cruise",
      ageVerified: false,
      hybridOptIn: false,
      expiresAtMs
    };
    sessionsByToken.set(sessionToken, session);
    notifyStateChanged();
    return session;
  }

  function getSessionInternal(sessionToken: string): Result<Session> {
    if (typeof sessionToken !== "string" || sessionToken.trim() === "") {
      return err("INVALID_SESSION", "Invalid session.");
    }

    const existing = sessionsByToken.get(sessionToken);
    if (!existing) {
      return err("INVALID_SESSION", "Invalid session.");
    }

    const now = nowMs();
    if (now >= existing.expiresAtMs) {
      sessionsByToken.delete(sessionToken);
      notifyStateChanged();
      return err("INVALID_SESSION", "Session expired.");
    }

    return ok(existing);
  }

  return {
    createGuestSession(): Result<GuestSessionResult> {
      const session = createGuestSessionInternal(nowMs());
      return ok({ session });
    },

    register(email: string, password: string, phoneE164: string): Result<RegisterResult> {
      if (typeof email !== "string" || !isLikelyValidEmail(email)) {
        return err("UNAUTHORIZED_ACTION", "Invalid email.");
      }
      const normalizedPhone = typeof phoneE164 === "string" ? phoneE164.trim() : "";
      if (!skipEmailVerification && !isLikelyValidPhoneE164(normalizedPhone)) {
        return err("UNAUTHORIZED_ACTION", "Invalid phone number. Use E.164 format, e.g. +15555551234.");
      }
      if (skipEmailVerification && normalizedPhone.length > 0 && !isLikelyValidPhoneE164(normalizedPhone)) {
        return err("UNAUTHORIZED_ACTION", "Invalid phone number. Use E.164 format, e.g. +15555551234.");
      }
      if (!isStrongPassword(password)) {
        return err(
          "UNAUTHORIZED_ACTION",
          "Invalid password. Use at least 10 chars with uppercase, lowercase, number, and symbol."
        );
      }

      const normalizedEmail = normalizeEmail(email);
      if (usersByEmail.has(normalizedEmail)) {
        return err("UNAUTHORIZED_ACTION", "Email already registered.");
      }

      const salt = crypto.randomBytes(PASSWORD_SALT_BYTES);
      const hash = hashPassword(password, salt);

      const now = nowMs();
      const user: StoredUser = {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        phoneE164: normalizedPhone.length > 0 ? normalizedPhone : null,
        userType: "registered",
        tier: "free",
        ageVerified: false,
        // Web build currently runs without verification-code UX; treat new registrations as verified.
        emailVerified: skipEmailVerification,
        verificationCodeSaltB64: null,
        verificationCodeHashB64: null,
        verificationCodeExpiresAtMs: null,
        passwordSaltB64: salt.toString("base64"),
        passwordHashB64: hash.toString("base64"),
        createdAtMs: now
      };

      usersByEmail.set(normalizedEmail, user);
      usersById.set(user.id, user);
      persistUsers();
      if (!skipEmailVerification) {
        setVerificationCode(user, now);
      }
      notifyStateChanged();
      return ok({ email: normalizedEmail, verificationRequired: true });
    },

    verifyEmail(email: string, code: string): Result<VerifyEmailResult> {
      if (typeof email !== "string" || typeof code !== "string") {
        return err("UNAUTHORIZED_ACTION", "Invalid verification request.");
      }
      const normalizedEmail = normalizeEmail(email);
      const user = usersByEmail.get(normalizedEmail);
      if (!user) {
        return err("INVALID_VERIFICATION_CODE", "Invalid or expired verification code.");
      }
      if (user.emailVerified) {
        const now = nowMs();
        const token = issueJWTInternal(user, now);
        const session = createSessionForUser(user, now);
        return ok({
          user: userPublic(user),
          jwt: token,
          session
        });
      }
      if (
        typeof user.verificationCodeSaltB64 !== "string" ||
        typeof user.verificationCodeHashB64 !== "string" ||
        typeof user.verificationCodeExpiresAtMs !== "number"
      ) {
        return err("INVALID_VERIFICATION_CODE", "Invalid or expired verification code.");
      }
      if (nowMs() >= user.verificationCodeExpiresAtMs) {
        return err("INVALID_VERIFICATION_CODE", "Invalid or expired verification code.");
      }

      const salt = Buffer.from(user.verificationCodeSaltB64, "base64");
      const expectedHash = Buffer.from(user.verificationCodeHashB64, "base64");
      const actualHash = hashPassword(code.trim(), salt);
      if (!safeEqual(expectedHash, actualHash)) {
        return err("INVALID_VERIFICATION_CODE", "Invalid or expired verification code.");
      }

      const verifiedUser: StoredUser = {
        ...user,
        emailVerified: true,
        verificationCodeSaltB64: null,
        verificationCodeHashB64: null,
        verificationCodeExpiresAtMs: null
      };
      usersByEmail.set(verifiedUser.email, verifiedUser);
      usersById.set(verifiedUser.id, verifiedUser);
      persistUsers();

      const now = nowMs();
      const token = issueJWTInternal(verifiedUser, now);
      const session = createSessionForUser(verifiedUser, now);
      return ok({
        user: userPublic(verifiedUser),
        jwt: token,
        session
      });
    },

    resendVerificationCode(email: string): Result<RegisterResult> {
      if (typeof email !== "string" || !isLikelyValidEmail(email)) {
        return err("UNAUTHORIZED_ACTION", "Invalid email.");
      }
      const normalizedEmail = normalizeEmail(email);
      const user = usersByEmail.get(normalizedEmail);
      if (!user) {
        return err("UNAUTHORIZED_ACTION", "Email not registered.");
      }
      if (user.emailVerified) {
        return err("UNAUTHORIZED_ACTION", "Email already verified.");
      }
      setVerificationCode(user, nowMs());
      notifyStateChanged();
      return ok({ email: normalizedEmail, verificationRequired: true });
    },

    login(email: string, password: string): Result<VerifyEmailResult> {
      if (typeof email !== "string" || typeof password !== "string") {
        return err("UNAUTHORIZED_ACTION", "Invalid credentials.");
      }
      const normalizedEmail = normalizeEmail(email);
      const user = usersByEmail.get(normalizedEmail);
      if (!user) {
        return err("UNAUTHORIZED_ACTION", "Invalid credentials.");
      }

      const salt = Buffer.from(user.passwordSaltB64, "base64");
      const expectedHash = Buffer.from(user.passwordHashB64, "base64");
      const actualHash = hashPassword(password, salt);

      if (!safeEqual(expectedHash, actualHash)) {
        return err("UNAUTHORIZED_ACTION", "Invalid credentials.");
      }
      let loginUser = user;
      if (!user.emailVerified) {
        if (!skipEmailVerification) {
          setVerificationCode(user, nowMs());
          return err("EMAIL_VERIFICATION_REQUIRED", "Phone verification required before login.", {
            email: user.email,
            phoneE164: user.phoneE164
          });
        }
        const autoVerifiedUser: StoredUser = {
          ...user,
          emailVerified: true,
          verificationCodeSaltB64: null,
          verificationCodeHashB64: null,
          verificationCodeExpiresAtMs: null
        };
        usersByEmail.set(autoVerifiedUser.email, autoVerifiedUser);
        usersById.set(autoVerifiedUser.id, autoVerifiedUser);
        persistUsers();
        loginUser = autoVerifiedUser;
      }

      const now = nowMs();
      const token = issueJWTInternal(loginUser, now);
      const session = createSessionForUser(loginUser, now);
      return ok({
        user: userPublic(loginUser),
        jwt: token,
        session
      });
    },

    issueJWT(user: Pick<StoredUser, "id" | "email" | "userType" | "tier">): Result<string> {
      if (
        typeof user !== "object" ||
        user === null ||
        typeof user.id !== "string" ||
        user.id.trim() === "" ||
        typeof user.email !== "string" ||
        !isLikelyValidEmail(user.email) ||
        (user.userType !== "registered" && user.userType !== "subscriber") ||
        (user.tier !== "free" && user.tier !== "premium")
      ) {
        return err("UNAUTHORIZED_ACTION", "Invalid user.");
      }
      return ok(issueJWTInternal({ ...user, email: normalizeEmail(user.email) }, nowMs()));
    },

    getSession(sessionToken: string): Result<Session> {
      return getSessionInternal(sessionToken);
    },

    verifyAge(sessionToken: string, ageYears: number): Result<Session> {
      const sessionResult = getSessionInternal(sessionToken);
      if (!sessionResult.ok) return sessionResult;

      if (!Number.isFinite(ageYears)) {
        return err("UNAUTHORIZED_ACTION", "Invalid age.");
      }
      if (ageYears < 18) {
        return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
      }

      const existing = sessionResult.value;
      const updated: Session = { ...existing, ageVerified: true };
      sessionsByToken.set(existing.sessionToken, updated);
      if ((existing.userType === "registered" || existing.userType === "subscriber") && typeof existing.userId === "string") {
        const user = usersById.get(existing.userId);
        if (user && user.ageVerified !== true) {
          const ageVerifiedUser: StoredUser = { ...user, ageVerified: true };
          usersById.set(ageVerifiedUser.id, ageVerifiedUser);
          usersByEmail.set(ageVerifiedUser.email, ageVerifiedUser);
          persistUsers();
        }
      }
      notifyStateChanged();
      return ok(updated);
    },

    setHybridOptIn(sessionToken: string, optIn: boolean): Result<Session> {
      const sessionResult = getSessionInternal(sessionToken);
      if (!sessionResult.ok) return sessionResult;

      const existing = sessionResult.value;
      if (existing.userType === "guest") {
        return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot enable Hybrid Mode.");
      }
      if (existing.ageVerified !== true) {
        return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
      }

      const updated: Session = { ...existing, hybridOptIn: optIn === true };
      sessionsByToken.set(existing.sessionToken, updated);
      notifyStateChanged();
      return ok(updated);
    },

    setMode(sessionToken: string, mode: Mode): Result<Session> {
      const sessionResult = getSessionInternal(sessionToken);
      if (!sessionResult.ok) return sessionResult;

      const existing = sessionResult.value;
      const check = modeService.setMode(
        {
          sessionId: existing.sessionToken,
          userType: existing.userType,
          mode: existing.mode,
          ageVerified: existing.ageVerified,
          hybridOptIn: existing.hybridOptIn
        },
        mode
      );
      if (!check.ok) {
        // Pass through the binding error contract from modeService.
        return { ok: false, error: check.error };
      }

      const updated: Session = { ...existing, mode: check.session.mode };
      sessionsByToken.set(existing.sessionToken, updated);
      notifyStateChanged();
      return ok(updated);
    },

    listRegisteredUserIds(): ReadonlyArray<string> {
      return Array.from(usersById.values())
        .filter((u) => (u.userType === "registered" || u.userType === "subscriber") && u.emailVerified === true)
        .map((u) => u.id);
    },

    snapshotState(): AuthStateSnapshot {
      return snapshotStateInternal();
    }
  };
}
