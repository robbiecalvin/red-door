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

export type BlockRecord = Readonly<{
  blockerKey: string;
  blockedKey: string;
  createdAtMs: number;
}>;

export type BlockServiceDeps = Readonly<{
  nowMs?: () => number;
}>;

export type BlockService = Readonly<{
  block(session: Session, targetKey: string): Result<BlockRecord>;
  unblock(session: Session, targetKey: string): Result<void>;
  isBlocked(fromKey: string, toKey: string): boolean;
  listBlocked(blockerKey: string): ReadonlyArray<string>;
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

function normalizeKey(value: string): string {
  return value.trim();
}

function deriveActorKey(session: Session): string {
  return session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
}

function edgeKey(blockerKey: string, blockedKey: string): string {
  return `${normalizeKey(blockerKey)}=>${normalizeKey(blockedKey)}`;
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

export function createBlockService(deps: BlockServiceDeps = {}): BlockService {
  const nowMs = deps.nowMs ?? (() => Date.now());

  const blockedEdges = new Set<string>();
  const blockedByBlocker = new Map<string, Set<string>>();

  function addIndex(blockerKey: string, blockedKey: string): void {
    const existing = blockedByBlocker.get(blockerKey);
    if (existing) {
      existing.add(blockedKey);
      return;
    }
    blockedByBlocker.set(blockerKey, new Set([blockedKey]));
  }

  function removeIndex(blockerKey: string, blockedKey: string): void {
    const existing = blockedByBlocker.get(blockerKey);
    if (!existing) return;
    existing.delete(blockedKey);
    if (existing.size === 0) blockedByBlocker.delete(blockerKey);
  }

  return {
    block(session: Session, targetKey: string): Result<BlockRecord> {
      const valid = validateSession(session);
      if (!valid.ok) return valid as Result<BlockRecord>;

      if (!isNonEmptyString(targetKey)) {
        return err("UNAUTHORIZED_ACTION", "Invalid target.");
      }

      const blockerKey = deriveActorKey(session);
      const blockedKey = normalizeKey(targetKey);
      if (blockedKey === blockerKey) {
        return err("UNAUTHORIZED_ACTION", "Invalid target.");
      }

      const key = edgeKey(blockerKey, blockedKey);
      blockedEdges.add(key);
      addIndex(blockerKey, blockedKey);

      return ok({ blockerKey, blockedKey, createdAtMs: nowMs() });
    },

    unblock(session: Session, targetKey: string): Result<void> {
      const valid = validateSession(session);
      if (!valid.ok) return valid;

      if (!isNonEmptyString(targetKey)) {
        return err("UNAUTHORIZED_ACTION", "Invalid target.");
      }

      const blockerKey = deriveActorKey(session);
      const blockedKey = normalizeKey(targetKey);
      const key = edgeKey(blockerKey, blockedKey);
      blockedEdges.delete(key);
      removeIndex(blockerKey, blockedKey);
      return ok(undefined);
    },

    isBlocked(fromKey: string, toKey: string): boolean {
      if (!isNonEmptyString(fromKey) || !isNonEmptyString(toKey)) return false;
      const a = normalizeKey(fromKey);
      const b = normalizeKey(toKey);
      // Global + immediate: a blocked b OR b blocked a prevents interactions.
      return blockedEdges.has(edgeKey(a, b)) || blockedEdges.has(edgeKey(b, a));
    },

    listBlocked(blockerKey: string): ReadonlyArray<string> {
      if (!isNonEmptyString(blockerKey)) return [];
      const set = blockedByBlocker.get(normalizeKey(blockerKey));
      if (!set) return [];
      return Array.from(set.values()).sort();
    }
  };
}

