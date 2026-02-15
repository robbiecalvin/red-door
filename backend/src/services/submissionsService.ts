export type ErrorCode = "ANONYMOUS_FORBIDDEN" | "AGE_GATE_REQUIRED" | "INVALID_INPUT" | "SUBMISSION_NOT_FOUND" | "RATING_OUT_OF_RANGE";

export type ServiceError = Readonly<{
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
}>;

type ResultOk<T> = Readonly<{ ok: true; value: T }>;
type ResultErr = Readonly<{ ok: false; error: ServiceError }>;
export type Result<T> = ResultOk<T> | ResultErr;

export type SessionLike = Readonly<{
  userType: "guest" | "registered" | "subscriber";
  userId?: string;
  ageVerified: boolean;
}>;

export type Submission = Readonly<{
  submissionId: string;
  authorUserId: string;
  title: string;
  body: string;
  viewCount: number;
  ratingCount: number;
  ratingSum: number;
  createdAtMs: number;
}>;

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  return { ok: false, error: context ? { code, message, context } : { code, message } };
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function requireRegistered(session: SessionLike): Result<{ userId: string }> {
  if (session.userType === "guest") return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot create submissions.");
  if (session.ageVerified !== true) return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
  if (typeof session.userId !== "string" || session.userId.trim() === "") return err("INVALID_INPUT", "Invalid user identity.");
  return ok({ userId: session.userId });
}

export function createSubmissionsService(deps?: Readonly<{ nowMs?: () => number; idFactory?: () => string }>): Readonly<{
  list(): Result<ReadonlyArray<Submission>>;
  create(session: SessionLike, title: unknown, body: unknown): Result<Submission>;
  recordView(submissionId: unknown): Result<Submission>;
  rate(submissionId: unknown, stars: unknown): Result<Submission>;
}> {
  const nowMs = deps?.nowMs ?? (() => Date.now());
  const idFactory = deps?.idFactory ?? (() => `sub_${Math.random().toString(16).slice(2)}_${Date.now()}`);
  const byId = new Map<string, Submission>();

  function listSorted(): ReadonlyArray<Submission> {
    return Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  return {
    list(): Result<ReadonlyArray<Submission>> {
      return ok(listSorted());
    },

    create(session: SessionLike, title: unknown, body: unknown): Result<Submission> {
      const auth = requireRegistered(session);
      if (!auth.ok) return auth;

      const t = asText(title);
      if (!t) return err("INVALID_INPUT", "Title is required.");
      if (t.length > 140) return err("INVALID_INPUT", "Title is too long.", { max: 140 });

      const b = asText(body);
      if (!b) return err("INVALID_INPUT", "Body is required.");
      if (b.length > 20000) return err("INVALID_INPUT", "Body is too long.", { max: 20000 });

      const created: Submission = {
        submissionId: idFactory(),
        authorUserId: auth.value.userId,
        title: t,
        body: b,
        viewCount: 0,
        ratingCount: 0,
        ratingSum: 0,
        createdAtMs: nowMs()
      };

      byId.set(created.submissionId, created);
      return ok(created);
    },

    recordView(submissionId: unknown): Result<Submission> {
      if (typeof submissionId !== "string" || submissionId.trim() === "") return err("INVALID_INPUT", "Invalid submission id.");
      const existing = byId.get(submissionId.trim());
      if (!existing) return err("SUBMISSION_NOT_FOUND", "Submission not found.");
      const next: Submission = { ...existing, viewCount: existing.viewCount + 1 };
      byId.set(next.submissionId, next);
      return ok(next);
    },

    rate(submissionId: unknown, stars: unknown): Result<Submission> {
      if (typeof submissionId !== "string" || submissionId.trim() === "") return err("INVALID_INPUT", "Invalid submission id.");
      const existing = byId.get(submissionId.trim());
      if (!existing) return err("SUBMISSION_NOT_FOUND", "Submission not found.");

      if (typeof stars !== "number" || !Number.isFinite(stars) || Math.trunc(stars) !== stars) {
        return err("RATING_OUT_OF_RANGE", "Rating must be an integer from 1 to 5.", { min: 1, max: 5 });
      }
      if (stars < 1 || stars > 5) {
        return err("RATING_OUT_OF_RANGE", "Rating must be an integer from 1 to 5.", { min: 1, max: 5 });
      }

      const next: Submission = {
        ...existing,
        ratingCount: existing.ratingCount + 1,
        ratingSum: existing.ratingSum + stars
      };
      byId.set(next.submissionId, next);
      return ok(next);
    }
  };
}
