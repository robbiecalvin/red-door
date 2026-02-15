export type ErrorCode = "ANONYMOUS_FORBIDDEN" | "AGE_GATE_REQUIRED" | "INVALID_INPUT";

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

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  return { ok: false, error: context ? { code, message, context } : { code, message } };
}

function requireRegistered(session: SessionLike): Result<{ userId: string }> {
  if (session.userType === "guest") {
    return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot modify favorites.");
  }
  if (session.ageVerified !== true) {
    return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
  }
  if (typeof session.userId !== "string" || session.userId.trim() === "") {
    return err("INVALID_INPUT", "Invalid user identity.");
  }
  return ok({ userId: session.userId });
}

export function createFavoritesService(): Readonly<{
  list(session: SessionLike): Result<ReadonlyArray<string>>;
  toggle(session: SessionLike, targetUserId: unknown): Result<{ targetUserId: string; isFavorite: boolean; favorites: ReadonlyArray<string> }>;
}> {
  const byUser = new Map<string, Set<string>>();

  function getSet(userId: string): Set<string> {
    const existing = byUser.get(userId);
    if (existing) return existing;
    const created = new Set<string>();
    byUser.set(userId, created);
    return created;
  }

  return {
    list(session: SessionLike): Result<ReadonlyArray<string>> {
      const auth = requireRegistered(session);
      if (!auth.ok) return auth;
      return ok(Array.from(getSet(auth.value.userId)));
    },

    toggle(session: SessionLike, targetUserId: unknown): Result<{ targetUserId: string; isFavorite: boolean; favorites: ReadonlyArray<string> }> {
      const auth = requireRegistered(session);
      if (!auth.ok) return auth;

      if (typeof targetUserId !== "string" || targetUserId.trim() === "") {
        return err("INVALID_INPUT", "Invalid target user id.");
      }
      const target = targetUserId.trim();
      if (target === auth.value.userId) {
        return err("INVALID_INPUT", "Cannot favorite yourself.");
      }

      const favorites = getSet(auth.value.userId);
      let isFavorite: boolean;
      if (favorites.has(target)) {
        favorites.delete(target);
        isFavorite = false;
      } else {
        favorites.add(target);
        isFavorite = true;
      }

      return ok({ targetUserId: target, isFavorite, favorites: Array.from(favorites) });
    }
  };
}
