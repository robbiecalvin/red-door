export type Mode = "cruise" | "date" | "hybrid";
export type UserType = "guest" | "registered" | "subscriber";

export type ErrorCode = "INVALID_SESSION" | "ANONYMOUS_FORBIDDEN" | "UNAUTHORIZED_ACTION" | "AGE_GATE_REQUIRED";

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

export type DatingProfile = Readonly<{
  id: string;
  displayName: string;
  age?: number;
  race?: string;
  heightInches?: number;
  weightLbs?: number;
  cockSizeInches?: number;
  cutStatus?: "cut" | "uncut";
  // Distance must be bucketed only; the bucket set is defined in codex.config.toml.
  // If unknown, it is omitted.
  distanceBucket?: "<500m" | "<1km" | "<5km" | ">5km";
}>;

export type DatingFeedServiceDeps = Readonly<{
  userDirectory: Readonly<{
    listRegisteredUserIds(): ReadonlyArray<string>;
  }>;
  profileDirectory?: Readonly<{
    getByUserId(userId: string): Promise<{
      displayName: string;
      age: number;
      discreetMode?: boolean;
      stats: {
        race?: string;
        heightInches?: number;
        weightLbs?: number;
        cockSizeInches?: number;
        cutStatus?: "cut" | "uncut";
      };
    } | null>;
  }>;
}>;

export type DatingFeedService = Readonly<{
  getFeed(session: Session, limit: number): Promise<Result<ReadonlyArray<DatingProfile>>>;
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
  if (session.userType === "guest") {
    return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot access Date discovery.");
  }
  if (session.mode !== "date" && session.mode !== "hybrid") {
    return err("UNAUTHORIZED_ACTION", "Date discovery is not allowed in the current mode.", { mode: session.mode });
  }
  if (!isNonEmptyString(session.userId)) {
    return err("INVALID_SESSION", "Invalid session.");
  }
  return ok(undefined);
}

function makeDisplayName(userId: string): string {
  const trimmed = userId.trim();
  const prefix = trimmed.length >= 8 ? trimmed.slice(0, 8) : trimmed;
  return `User ${prefix}`;
}

export function createDatingFeedService(deps: DatingFeedServiceDeps): DatingFeedService {
  if (!deps || typeof deps !== "object") {
    throw new Error("datingFeedService requires deps.");
  }
  if (!deps.userDirectory || typeof deps.userDirectory.listRegisteredUserIds !== "function") {
    throw new Error("datingFeedService requires userDirectory.listRegisteredUserIds.");
  }

  return {
    async getFeed(session: Session, limit: number): Promise<Result<ReadonlyArray<DatingProfile>>> {
      const valid = validateSession(session);
      if (!valid.ok) return valid as Result<ReadonlyArray<DatingProfile>>;

      if (!Number.isFinite(limit) || limit <= 0 || limit > 100) {
        return err("UNAUTHORIZED_ACTION", "Invalid feed limit.");
      }

      const ids = deps.userDirectory.listRegisteredUserIds();
      const me = session.userId!.trim();
      const profiles: DatingProfile[] = [];
      for (const id of ids) {
        if (!isNonEmptyString(id)) continue;
        const trimmed = id.trim();
        if (trimmed === me) continue;
        const profile = deps.profileDirectory ? await deps.profileDirectory.getByUserId(trimmed) : null;
        if (profile?.discreetMode === true) continue;
        profiles.push({
          id: trimmed,
          displayName: profile?.displayName ?? makeDisplayName(trimmed),
          age: profile?.age,
          race: profile?.stats?.race,
          heightInches: profile?.stats?.heightInches,
          weightLbs: profile?.stats?.weightLbs,
          cockSizeInches: profile?.stats?.cockSizeInches,
          cutStatus: profile?.stats?.cutStatus
        });
        if (profiles.length >= limit) break;
      }

      return ok(profiles);
    }
  };
}
