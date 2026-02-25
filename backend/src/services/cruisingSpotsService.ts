export type ErrorCode = "ANONYMOUS_FORBIDDEN" | "AGE_GATE_REQUIRED" | "INVALID_INPUT" | "SPOT_NOT_FOUND";

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
  sessionToken?: string;
  ageVerified: boolean;
}>;

export type CruisingSpot = Readonly<{
  spotId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  description: string;
  creatorUserId: string;
  createdAtMs: number;
  checkInCount: number;
  actionCount: number;
}>;

export type SpotCheckIn = Readonly<{
  spotId: string;
  actorKey: string;
  checkedInAtMs: number;
}>;

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  return { ok: false, error: context ? { code, message, context } : { code, message } };
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function actorKey(session: SessionLike): string {
  if (typeof session.userId === "string" && session.userId.trim() !== "") return `user:${session.userId}`;
  const token = typeof session.sessionToken === "string" ? session.sessionToken.trim() : "";
  return `session:${token}`;
}

function requireAge(session: SessionLike): Result<void> {
  if (session.ageVerified !== true) {
    return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
  }
  return ok(undefined);
}

export function createCruisingSpotsService(
  deps?: Readonly<{ nowMs?: () => number; idFactory?: () => string }>
): Readonly<{
  list(): Result<ReadonlyArray<CruisingSpot>>;
  create(
    session: SessionLike,
    input: Readonly<{ name: unknown; address: unknown; lat: unknown; lng: unknown; description: unknown }>
  ): Result<CruisingSpot>;
  checkIn(session: SessionLike, spotId: unknown): Result<SpotCheckIn>;
  recordAction(session: SessionLike, spotId: unknown): Result<{ spotId: string; actorKey: string; markedAtMs: number }>;
  listCheckIns(spotId: unknown): Result<ReadonlyArray<SpotCheckIn>>;
}> {
  const nowMs = deps?.nowMs ?? (() => Date.now());
  const idFactory = deps?.idFactory ?? (() => `spot_${Math.random().toString(16).slice(2)}_${Date.now()}`);
  const spots: CruisingSpot[] = [];
  const checkInsBySpot = new Map<string, Map<string, SpotCheckIn>>();
  const actionBySpot = new Map<string, Map<string, { spotId: string; actorKey: string; markedAtMs: number }>>();

  function updateSpotCounts(spotId: string): void {
    const idx = spots.findIndex((s) => s.spotId === spotId);
    if (idx < 0) return;
    const checkInCount = (checkInsBySpot.get(spotId) ?? new Map()).size;
    const actionCount = (actionBySpot.get(spotId) ?? new Map()).size;
    spots[idx] = { ...spots[idx], checkInCount, actionCount };
  }

  return {
    list(): Result<ReadonlyArray<CruisingSpot>> {
      return ok([...spots].sort((a, b) => b.createdAtMs - a.createdAtMs));
    },

    create(
      session: SessionLike,
      input: Readonly<{ name: unknown; description: unknown; address: unknown; lat: unknown; lng: unknown }>
    ): Result<CruisingSpot> {
      const name = asText(input.name);
      const description = asText(input.description);
      const address = asText(input.address);
      const lat = typeof input.lat === "number" && Number.isFinite(input.lat) ? input.lat : null;
      const lng = typeof input.lng === "number" && Number.isFinite(input.lng) ? input.lng : null;
      if (!name) return err("INVALID_INPUT", "Spot name is required.");
      if (!address) return err("INVALID_INPUT", "Spot address is required.");
      if (!description) return err("INVALID_INPUT", "Spot description is required.");
      if (lat === null || lng === null) return err("INVALID_INPUT", "Spot coordinates are required.");
      if (name.length > 120) return err("INVALID_INPUT", "Spot name is too long.", { max: 120 });
      if (address.length > 240) return err("INVALID_INPUT", "Spot address is too long.", { max: 240 });
      if (description.length > 1000) return err("INVALID_INPUT", "Spot description is too long.", { max: 1000 });
      const spot: CruisingSpot = {
        spotId: idFactory(),
        name,
        address,
        lat,
        lng,
        description,
        creatorUserId: actorKey(session),
        createdAtMs: nowMs(),
        checkInCount: 0,
        actionCount: 0
      };
      spots.push(spot);
      return ok(spot);
    },

    checkIn(session: SessionLike, spotId: unknown): Result<SpotCheckIn> {
      const age = requireAge(session);
      if (!age.ok) return age as Result<SpotCheckIn>;
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      if (!spots.some((s) => s.spotId === id)) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      const key = actorKey(session);
      const record: SpotCheckIn = { spotId: id, actorKey: key, checkedInAtMs: nowMs() };
      const map = checkInsBySpot.get(id) ?? new Map<string, SpotCheckIn>();
      map.set(key, record);
      checkInsBySpot.set(id, map);
      updateSpotCounts(id);
      return ok(record);
    },

    recordAction(session: SessionLike, spotId: unknown): Result<{ spotId: string; actorKey: string; markedAtMs: number }> {
      const age = requireAge(session);
      if (!age.ok) return age as Result<{ spotId: string; actorKey: string; markedAtMs: number }>;
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      if (!spots.some((s) => s.spotId === id)) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      const actor = actorKey(session);
      const row = { spotId: id, actorKey: actor, markedAtMs: nowMs() };
      const map = actionBySpot.get(id) ?? new Map<string, { spotId: string; actorKey: string; markedAtMs: number }>();
      map.set(actor, row);
      actionBySpot.set(id, map);
      updateSpotCounts(id);
      return ok(row);
    },

    listCheckIns(spotId: unknown): Result<ReadonlyArray<SpotCheckIn>> {
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      if (!spots.some((s) => s.spotId === id)) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      const values = Array.from((checkInsBySpot.get(id) ?? new Map()).values()).sort((a, b) => b.checkedInAtMs - a.checkedInAtMs);
      return ok(values);
    }
  };
}
