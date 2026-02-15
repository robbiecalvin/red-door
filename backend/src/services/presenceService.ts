export type Mode = "cruise" | "date" | "hybrid";
export type UserType = "guest" | "registered" | "subscriber";

export type ErrorCode = "PRESENCE_NOT_ALLOWED" | "INVALID_SESSION" | "UNAUTHORIZED_ACTION" | "AGE_GATE_REQUIRED";

export type ServiceError = {
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
};

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

export type PresenceRecord = Readonly<{
  key: string;
  userType: UserType;
  userId?: string;
  // Randomized server-side. Raw client coordinates are never stored.
  lat: number;
  lng: number;
  status?: string;
  updatedAtMs: number;
}>;

export type PresenceUpdateInput = Readonly<{
  lat: number;
  lng: number;
  status?: string;
}>;

export type PresenceServiceDeps = Readonly<{
  nowMs?: () => number;
  random?: () => number; // [0, 1)
  randomizationMeters?: number;
  presenceExpiryMs?: number;
  broadcaster?: Readonly<{
    broadcast(type: string, payload: unknown): void;
  }>;
}>;

export type PresenceService = Readonly<{
  updatePresence(session: Session, input: PresenceUpdateInput): Result<PresenceRecord>;
  listActivePresence(): ReadonlyArray<PresenceRecord>;
  sweepExpired(): number;
}>;

const DEFAULT_RANDOMIZATION_METERS = 100;
const DEFAULT_PRESENCE_EXPIRY_MS = 45_000;

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  const error: ServiceError = context ? { code, message, context } : { code, message };
  return { ok: false, error };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidLatLng(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function randomizeLocation(
  lat: number,
  lng: number,
  radiusMeters: number,
  rand: () => number
): { lat: number; lng: number } {
  // Uniform in a disc (sqrt for radius).
  const u = rand();
  const v = rand();
  const r = Math.sqrt(Math.max(0, Math.min(1, u))) * radiusMeters;
  const theta = v * 2 * Math.PI;

  const dy = r * Math.sin(theta);
  const dx = r * Math.cos(theta);

  // Convert meters to degrees. This is sufficient for small radii (~100m).
  const metersPerDegreeLat = 111_111;
  const metersPerDegreeLng = Math.max(1e-6, Math.cos((lat * Math.PI) / 180) * 111_111);

  const randomizedLat = lat + dy / metersPerDegreeLat;
  const randomizedLng = lng + dx / metersPerDegreeLng;

  return { lat: randomizedLat, lng: randomizedLng };
}

function makePresenceKey(session: Session): string {
  // Guests may not have a userId; use session token as an ephemeral identity key.
  return session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
}

function validateStatus(status: unknown): string | undefined {
  if (status === undefined) return undefined;
  if (typeof status !== "string") return undefined;
  const trimmed = status.trim();
  if (trimmed === "") return undefined;
  // Bound size defensively to keep payloads small (<2kb constraint).
  if (trimmed.length > 64) return trimmed.slice(0, 64);
  return trimmed;
}

export function createPresenceService(deps: PresenceServiceDeps = {}): PresenceService {
  const nowMs = deps.nowMs ?? (() => Date.now());
  const random = deps.random ?? (() => Math.random());
  const randomizationMeters = deps.randomizationMeters ?? DEFAULT_RANDOMIZATION_METERS;
  const presenceExpiryMs = deps.presenceExpiryMs ?? DEFAULT_PRESENCE_EXPIRY_MS;
  const broadcaster = deps.broadcaster;

  if (!Number.isFinite(randomizationMeters) || randomizationMeters < 0) {
    throw new Error("presenceService requires randomizationMeters to be >= 0.");
  }
  if (!Number.isFinite(presenceExpiryMs) || presenceExpiryMs <= 0) {
    throw new Error("presenceService requires a positive presenceExpiryMs.");
  }

  const byKey = new Map<string, PresenceRecord>();

  function sweepExpiredInternal(now: number): number {
    let removed = 0;
    for (const [key, record] of byKey.entries()) {
      if (now - record.updatedAtMs >= presenceExpiryMs) {
        byKey.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  return {
    updatePresence(session: Session, input: PresenceUpdateInput): Result<PresenceRecord> {
      if (
        typeof session !== "object" ||
        session === null ||
        typeof session.sessionToken !== "string" ||
        session.sessionToken.trim() === "" ||
        (session.userType !== "guest" && session.userType !== "registered" && session.userType !== "subscriber") ||
        (session.mode !== "cruise" && session.mode !== "date" && session.mode !== "hybrid")
      ) {
        return err("INVALID_SESSION", "Invalid session.");
      }

      if (session.mode === "date") {
        return err("PRESENCE_NOT_ALLOWED", "Presence updates are not allowed in Date Mode.", { mode: session.mode });
      }

      if (session.ageVerified !== true) {
        return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
      }

      if (
        typeof input !== "object" ||
        input === null ||
        !isFiniteNumber(input.lat) ||
        !isFiniteNumber(input.lng) ||
        !isValidLatLng(input.lat, input.lng)
      ) {
        return err("UNAUTHORIZED_ACTION", "Invalid coordinates.");
      }

      const now = nowMs();
      sweepExpiredInternal(now);

      const randomized = randomizeLocation(input.lat, input.lng, randomizationMeters, random);
      const status = validateStatus(input.status);

      const key = makePresenceKey(session);
      const record: PresenceRecord = {
        key,
        userType: session.userType,
        userId: session.userId,
        lat: randomized.lat,
        lng: randomized.lng,
        status,
        updatedAtMs: now
      };

      byKey.set(key, record);

      // Broadcast only randomized coordinates. Never include raw client input.
      if (broadcaster) {
        const payload = {
          key: record.key,
          userType: record.userType,
          // userId is omitted intentionally; identity exposure rules are not defined yet.
          lat: record.lat,
          lng: record.lng,
          status: record.status,
          updatedAtMs: record.updatedAtMs
        };
        broadcaster.broadcast("presence_update", payload);
      }

      return ok(record);
    },

    listActivePresence(): ReadonlyArray<PresenceRecord> {
      const now = nowMs();
      sweepExpiredInternal(now);
      return Array.from(byKey.values());
    },

    sweepExpired(): number {
      return sweepExpiredInternal(nowMs());
    }
  };
}
