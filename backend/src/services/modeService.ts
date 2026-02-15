export type Mode = "cruise" | "date" | "hybrid";

export type UserType = "guest" | "registered" | "subscriber";

export type ErrorCode =
  | "INVALID_MODE_TRANSITION"
  | "ANONYMOUS_FORBIDDEN"
  | "INVALID_SESSION"
  | "AGE_GATE_REQUIRED";

export type ServiceError = {
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
};

export type Session = Readonly<{
  sessionId: string;
  userType: UserType;
  mode: Mode;
  ageVerified?: boolean;
  /**
   * Hybrid Mode requires explicit opt-in. How this is set is outside modeService;
   * modeService only enforces that it must already be true when entering hybrid.
   */
  hybridOptIn?: boolean;
}>;

export type SetModeResult =
  | { ok: true; session: Session }
  | { ok: false; error: ServiceError };

const ALL_MODES: ReadonlySet<string> = new Set(["cruise", "date", "hybrid"]);

function isMode(value: string): value is Mode {
  return ALL_MODES.has(value);
}

function reject(code: ErrorCode, message: string, context?: Record<string, unknown>): SetModeResult {
  const error: ServiceError = context ? { code, message, context } : { code, message };
  return { ok: false, error };
}

function isSessionLike(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.sessionId !== "string" || candidate.sessionId.trim() === "") return false;
  if (
    candidate.userType !== "guest" &&
    candidate.userType !== "registered" &&
    candidate.userType !== "subscriber"
  ) {
    return false;
  }
  if (candidate.mode !== "cruise" && candidate.mode !== "date" && candidate.mode !== "hybrid") return false;
  return true;
}

export function getCurrentMode(session: Session): Mode {
  return session.mode;
}

/**
 * Server-authoritative mode transition enforcement.
 *
 * - Only 3 modes exist: cruise/date/hybrid
 * - Guests can only be in Cruise mode
 * - Hybrid requires explicit opt-in (session.hybridOptIn === true) and a registered identity
 *
 * Returns a new session object on success and never mutates the input session.
 */
export function setMode(session: Session, requestedMode: string): SetModeResult {
  if (!isSessionLike(session)) {
    return reject("INVALID_SESSION", "Invalid session.", undefined);
  }

  if (!isMode(requestedMode)) {
    return reject("INVALID_MODE_TRANSITION", "Invalid mode transition.", {
      requestedMode
    });
  }

  if (session.ageVerified !== true) {
    return reject("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
  }

  if (session.userType === "guest" && requestedMode !== "cruise") {
    return reject("ANONYMOUS_FORBIDDEN", "Anonymous access is forbidden for this mode.", {
      requestedMode
    });
  }

  if (requestedMode === "hybrid") {
    if (session.hybridOptIn !== true) {
      return reject("INVALID_MODE_TRANSITION", "Hybrid Mode requires explicit opt-in.", {
        requestedMode
      });
    }
  }

  if (requestedMode === session.mode) {
    // Deterministic no-op; return the original session to avoid false state churn.
    return { ok: true, session };
  }

  return { ok: true, session: { ...session, mode: requestedMode } };
}
