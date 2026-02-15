import crypto from "node:crypto";

export type Mode = "cruise" | "date" | "hybrid";
export type UserType = "guest" | "registered" | "subscriber";

export type ErrorCode = "INVALID_SESSION" | "UNAUTHORIZED_ACTION" | "AGE_GATE_REQUIRED";

export type ServiceError = Readonly<{
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
}>;

type ResultOk<T> = { ok: true; value: T };
type ResultErr = { ok: false; error: ServiceError };
export type Result<T> = ResultOk<T> | ResultErr;

export type Session = Readonly<{
  sessionToken: string;
  userType: UserType;
  mode: Mode;
  userId?: string;
  ageVerified?: boolean;
}>;

export type ReportTarget = Readonly<
  | { kind: "user"; targetKey: string }
  | { kind: "message"; messageId: string; targetKey?: string }
>;

export type ReportRecord = Readonly<{
  reportId: string;
  fromKey: string;
  target: ReportTarget;
  reason: string;
  createdAtMs: number;
}>;

export type ReportServiceDeps = Readonly<{
  nowMs?: () => number;
}>;

export type ReportService = Readonly<{
  reportUser(session: Session, targetKey: string, reason: string): Result<ReportRecord>;
  reportMessage(session: Session, messageId: string, reason: string, targetKey?: string): Result<ReportRecord>;
  listReports(): ReadonlyArray<ReportRecord>;
}>;

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  const error: ServiceError = context ? { code, message, context } : { code, message };
  return { ok: false, error };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function sanitizeReason(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 500) return trimmed.slice(0, 500);
  return trimmed;
}

function deriveFromKey(session: Session): string {
  return session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
}

function validateSession(session: Session): Result<void> {
  if (
    typeof session !== "object" ||
    session === null ||
    !isNonEmptyString(session.sessionToken) ||
    (session.userType !== "guest" && session.userType !== "registered" && session.userType !== "subscriber") ||
    (session.mode !== "cruise" && session.mode !== "date" && session.mode !== "hybrid")
  ) {
    return err("INVALID_SESSION", "Invalid session.");
  }
  if (session.ageVerified !== true) {
    return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
  }
  return ok(undefined);
}

export function createReportService(deps: ReportServiceDeps = {}): ReportService {
  const nowMs = deps.nowMs ?? (() => Date.now());
  const reports: ReportRecord[] = [];

  return {
    reportUser(session: Session, targetKey: string, reason: string): Result<ReportRecord> {
      const valid = validateSession(session);
      if (!valid.ok) return valid as Result<ReportRecord>;

      if (!isNonEmptyString(targetKey)) {
        return err("UNAUTHORIZED_ACTION", "Invalid report target.");
      }
      if (!isNonEmptyString(reason)) {
        return err("UNAUTHORIZED_ACTION", "Invalid report reason.");
      }

      const record: ReportRecord = {
        reportId: crypto.randomUUID(),
        fromKey: deriveFromKey(session),
        target: { kind: "user", targetKey: targetKey.trim() },
        reason: sanitizeReason(reason),
        createdAtMs: nowMs()
      };
      reports.push(record);
      return ok(record);
    },

    reportMessage(session: Session, messageId: string, reason: string, targetKey?: string): Result<ReportRecord> {
      const valid = validateSession(session);
      if (!valid.ok) return valid as Result<ReportRecord>;

      if (!isNonEmptyString(messageId)) {
        return err("UNAUTHORIZED_ACTION", "Invalid report target.");
      }
      if (!isNonEmptyString(reason)) {
        return err("UNAUTHORIZED_ACTION", "Invalid report reason.");
      }

      const record: ReportRecord = {
        reportId: crypto.randomUUID(),
        fromKey: deriveFromKey(session),
        target: {
          kind: "message",
          messageId: messageId.trim(),
          targetKey: isNonEmptyString(targetKey) ? targetKey.trim() : undefined
        },
        reason: sanitizeReason(reason),
        createdAtMs: nowMs()
      };
      reports.push(record);
      return ok(record);
    },

    listReports(): ReadonlyArray<ReportRecord> {
      return [...reports];
    }
  };
}

