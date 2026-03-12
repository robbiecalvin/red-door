import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type ErrorCode = "INVALID_INPUT" | "MEMBERSHIP_CODE_NOT_FOUND";

export type ServiceError = Readonly<{
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
}>;

type ResultOk<T> = Readonly<{ ok: true; value: T }>;
type ResultErr = Readonly<{ ok: false; error: ServiceError }>;
export type Result<T> = ResultOk<T> | ResultErr;

export type EarlyAccessSignup = Readonly<{
  name: string;
  email: string;
  membershipCode: string;
  createdAtMs: number;
}>;

export type EarlyAccessSignupRecord = EarlyAccessSignup &
  Readonly<{
    existing: boolean;
  }>;

type PersistedStore = Readonly<{
  version: 1;
  signups: ReadonlyArray<EarlyAccessSignup>;
}>;

export type EarlyAccessServiceDeps = Readonly<{
  filePath?: string;
  nowMs?: () => number;
  membershipCodeGenerator?: () => string;
}>;

export type EarlyAccessService = Readonly<{
  registerInterest(name: string, email: string): Promise<Result<EarlyAccessSignupRecord>>;
  validateMembershipCode(membershipCode: string): Promise<Result<EarlyAccessSignup>>;
}>;

const DEFAULT_STORE_FILE_PATH = path.resolve(process.cwd(), "backend/.data/early-access-signups.json");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  return { ok: false, error: context ? { code, message, context } : { code, message } };
}

function normalizeName(value: string): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeEmail(value: string): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeMembershipCode(value: string): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function validateName(name: string): Result<string> {
  const normalized = normalizeName(name);
  if (normalized.length < 2 || normalized.length > 80) {
    return err("INVALID_INPUT", "Name must be between 2 and 80 characters.");
  }
  return ok(normalized);
}

function validateEmail(email: string): Result<string> {
  const normalized = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalized)) {
    return err("INVALID_INPUT", "Enter a valid email address.");
  }
  return ok(normalized);
}

function defaultMembershipCodeGenerator(): string {
  return `RED-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function readStore(filePath: string): Promise<PersistedStore> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.signups)) {
      throw new Error("Invalid early access store format.");
    }
    const signups: EarlyAccessSignup[] = [];
    for (const row of parsed.signups) {
      if (!row || typeof row !== "object") {
        throw new Error("Invalid early access signup record.");
      }
      const signup = row as Partial<EarlyAccessSignup>;
      const name = normalizeName(String(signup.name ?? ""));
      const email = normalizeEmail(String(signup.email ?? ""));
      const membershipCode = normalizeMembershipCode(String(signup.membershipCode ?? ""));
      const createdAtMs = Number(signup.createdAtMs);
      if (!name || !email || !membershipCode || !Number.isFinite(createdAtMs) || createdAtMs <= 0) {
        throw new Error("Invalid early access signup record.");
      }
      signups.push({ name, email, membershipCode, createdAtMs: Math.trunc(createdAtMs) });
    }
    return { version: 1, signups };
  } catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException;
    if (maybeNodeError?.code === "ENOENT") {
      return { version: 1, signups: [] };
    }
    throw error;
  }
}

async function writeStore(filePath: string, store: PersistedStore): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

export function createEarlyAccessService(deps: EarlyAccessServiceDeps = {}): EarlyAccessService {
  const filePath = deps.filePath ?? DEFAULT_STORE_FILE_PATH;
  const nowMs = deps.nowMs ?? (() => Date.now());
  const membershipCodeGenerator = deps.membershipCodeGenerator ?? defaultMembershipCodeGenerator;

  let queue = Promise.resolve();

  async function withLock<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work, work);
    queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async function nextMembershipCode(store: PersistedStore): Promise<string> {
    const existing = new Set(store.signups.map((signup) => signup.membershipCode));
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = normalizeMembershipCode(membershipCodeGenerator());
      if (!code) continue;
      if (!existing.has(code)) return code;
    }
    throw new Error("Unable to generate a unique membership code.");
  }

  return {
    async registerInterest(name: string, email: string): Promise<Result<EarlyAccessSignupRecord>> {
      return withLock(async () => {
        const normalizedName = validateName(name);
        if (!normalizedName.ok) return normalizedName;
        const normalizedEmail = validateEmail(email);
        if (!normalizedEmail.ok) return normalizedEmail;

        const store = await readStore(filePath);
        const existing = store.signups.find((signup) => signup.email === normalizedEmail.value);
        if (existing) {
          return ok({ ...existing, existing: true });
        }

        const createdAtMs = nowMs();
        const membershipCode = await nextMembershipCode(store);
        const signup: EarlyAccessSignup = {
          name: normalizedName.value,
          email: normalizedEmail.value,
          membershipCode,
          createdAtMs
        };
        await writeStore(filePath, { version: 1, signups: [...store.signups, signup] });
        return ok({ ...signup, existing: false });
      });
    },

    async validateMembershipCode(membershipCode: string): Promise<Result<EarlyAccessSignup>> {
      return withLock(async () => {
        const normalizedCode = normalizeMembershipCode(membershipCode);
        if (!normalizedCode) {
          return err("INVALID_INPUT", "Membership code is required.");
        }
        const store = await readStore(filePath);
        const signup = store.signups.find((entry) => entry.membershipCode === normalizedCode);
        if (!signup) {
          return err("MEMBERSHIP_CODE_NOT_FOUND", "Membership code not found.");
        }
        return ok(signup);
      });
    }
  };
}
