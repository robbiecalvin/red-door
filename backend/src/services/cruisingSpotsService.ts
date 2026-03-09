import fs from "node:fs";
import path from "node:path";

import { containsDisallowedKidVariation } from "./contentPolicy";

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
  role?: "user" | "admin";
}>;

export type ModerationStatus = "pending" | "approved" | "rejected";

export type CruisingSpot = Readonly<{
  spotId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  description: string;
  photoMediaId?: string;
  creatorUserId: string;
  createdAtMs: number;
  checkInCount: number;
  actionCount: number;
  moderationStatus: ModerationStatus;
  moderatedAtMs?: number;
  moderatedByUserId?: string;
  moderationReason?: string;
}>;

export type SpotCheckIn = Readonly<{
  spotId: string;
  actorKey: string;
  checkedInAtMs: number;
}>;

export type CruisingSpotsState = Readonly<{
  spots: ReadonlyArray<CruisingSpot>;
  checkIns: ReadonlyArray<Readonly<{ spotId: string; rows: ReadonlyArray<SpotCheckIn> }>>;
  actions: ReadonlyArray<Readonly<{ spotId: string; rows: ReadonlyArray<{ spotId: string; actorKey: string; markedAtMs: number }> }>>;
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

function asOptionalText(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
  deps?: Readonly<{
    nowMs?: () => number;
    idFactory?: () => string;
    persistenceFilePath?: string;
    initialState?: CruisingSpotsState;
    onStateChanged?: (state: CruisingSpotsState) => void;
  }>
): Readonly<{
  list(viewer?: SessionLike): Result<ReadonlyArray<CruisingSpot>>;
  listAll(): Result<ReadonlyArray<CruisingSpot>>;
  create(
    session: SessionLike,
    input: Readonly<{ name: unknown; address: unknown; lat: unknown; lng: unknown; description: unknown; photoMediaId?: unknown }>
  ): Result<CruisingSpot>;
  checkIn(session: SessionLike, spotId: unknown): Result<SpotCheckIn>;
  recordAction(session: SessionLike, spotId: unknown): Result<{ spotId: string; actorKey: string; markedAtMs: number }>;
  listCheckIns(spotId: unknown): Result<ReadonlyArray<SpotCheckIn>>;
  approve(adminSession: SessionLike, spotId: unknown, reason?: unknown): Result<CruisingSpot>;
  reject(adminSession: SessionLike, spotId: unknown, reason?: unknown): Result<CruisingSpot>;
  remove(spotId: unknown): Result<{ spotId: string }>;
}> {
  const nowMs = deps?.nowMs ?? (() => Date.now());
  const idFactory = deps?.idFactory ?? (() => `spot_${Math.random().toString(16).slice(2)}_${Date.now()}`);
  const persistenceFilePath = deps?.persistenceFilePath;
  const onStateChanged = deps?.onStateChanged;
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

  function snapshotStateInternal(): CruisingSpotsState {
    return {
      spots: [...spots],
      checkIns: Array.from(checkInsBySpot.entries()).map(([spotId, rows]) => ({
        spotId,
        rows: Array.from(rows.values())
      })),
      actions: Array.from(actionBySpot.entries()).map(([spotId, rows]) => ({
        spotId,
        rows: Array.from(rows.values())
      }))
    };
  }

  function notifyStateChanged(): void {
    if (!onStateChanged) return;
    try {
      onStateChanged(snapshotStateInternal());
    } catch {
      // hooks are best effort
    }
  }

  function persistState(): void {
    if (!persistenceFilePath) {
      notifyStateChanged();
      return;
    }
    const dir = path.dirname(persistenceFilePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      persistenceFilePath,
      JSON.stringify({ version: 1, ...snapshotStateInternal() }),
      "utf8"
    );
    notifyStateChanged();
  }

  function hydrateSpotCounts(): void {
    for (const spot of spots) updateSpotCounts(spot.spotId);
  }

  function loadState(): void {
    const initial = deps?.initialState;
    const applyState = (state: CruisingSpotsState): void => {
      spots.splice(0, spots.length, ...(state.spots ?? []));
      checkInsBySpot.clear();
      actionBySpot.clear();
      for (const group of state.checkIns ?? []) {
        if (!group || typeof group.spotId !== "string") continue;
        const map = new Map<string, SpotCheckIn>();
        for (const row of group.rows ?? []) {
          if (!row || typeof row.actorKey !== "string") continue;
          map.set(row.actorKey, row);
        }
        checkInsBySpot.set(group.spotId, map);
      }
      for (const group of state.actions ?? []) {
        if (!group || typeof group.spotId !== "string") continue;
        const map = new Map<string, { spotId: string; actorKey: string; markedAtMs: number }>();
        for (const row of group.rows ?? []) {
          if (!row || typeof row.actorKey !== "string") continue;
          map.set(row.actorKey, row);
        }
        actionBySpot.set(group.spotId, map);
      }
      hydrateSpotCounts();
    };
    if (initial) {
      applyState(initial);
      return;
    }
    if (!persistenceFilePath) return;
    if (!fs.existsSync(persistenceFilePath)) return;
    const raw = fs.readFileSync(persistenceFilePath, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as { version?: unknown; spots?: unknown; checkIns?: unknown; actions?: unknown };
    if (parsed.version !== 1) return;
    applyState({
      spots: Array.isArray(parsed.spots) ? (parsed.spots as ReadonlyArray<CruisingSpot>) : [],
      checkIns: Array.isArray(parsed.checkIns) ? (parsed.checkIns as CruisingSpotsState["checkIns"]) : [],
      actions: Array.isArray(parsed.actions) ? (parsed.actions as CruisingSpotsState["actions"]) : []
    });
  }

  loadState();

  return {
    list(viewer?: SessionLike): Result<ReadonlyArray<CruisingSpot>> {
      const isAdmin = viewer?.role === "admin";
      const viewerActorKey = viewer ? actorKey(viewer) : null;
      const visible = isAdmin
        ? spots
        : spots.filter((spot) => {
            if (spot.moderationStatus === "approved") return true;
            return viewerActorKey !== null && spot.creatorUserId === viewerActorKey;
          });
      return ok([...visible].sort((a, b) => b.createdAtMs - a.createdAtMs));
    },

    listAll(): Result<ReadonlyArray<CruisingSpot>> {
      return ok([...spots].sort((a, b) => b.createdAtMs - a.createdAtMs));
    },

    create(
      session: SessionLike,
      input: Readonly<{ name: unknown; description: unknown; address: unknown; lat: unknown; lng: unknown; photoMediaId?: unknown }>
    ): Result<CruisingSpot> {
      const name = asText(input.name);
      const description = asText(input.description);
      const address = asText(input.address);
      const photoMediaId = asOptionalText(input.photoMediaId);
      const lat = typeof input.lat === "number" && Number.isFinite(input.lat) ? input.lat : null;
      const lng = typeof input.lng === "number" && Number.isFinite(input.lng) ? input.lng : null;
      if (!name) return err("INVALID_INPUT", "Spot name is required.");
      if (!address) return err("INVALID_INPUT", "Spot address is required.");
      if (!description) return err("INVALID_INPUT", "Spot description is required.");
      if (photoMediaId === null) return err("INVALID_INPUT", "photoMediaId must be a string when provided.");
      if (lat === null || lng === null) return err("INVALID_INPUT", "Spot coordinates are required.");
      if (name.length > 120) return err("INVALID_INPUT", "Spot name is too long.", { max: 120 });
      if (address.length > 240) return err("INVALID_INPUT", "Spot address is too long.", { max: 240 });
      if (description.length > 1000) return err("INVALID_INPUT", "Spot description is too long.", { max: 1000 });
      if (containsDisallowedKidVariation(name)) return err("INVALID_INPUT", "Spot name contains disallowed language.");
      if (containsDisallowedKidVariation(address)) return err("INVALID_INPUT", "Spot address contains disallowed language.");
      if (containsDisallowedKidVariation(description)) return err("INVALID_INPUT", "Spot description contains disallowed language.");
      if (typeof photoMediaId === "string" && photoMediaId.length > 200) return err("INVALID_INPUT", "photoMediaId is too long.", { max: 200 });
      const spot: CruisingSpot = {
        spotId: idFactory(),
        name,
        address,
        lat,
        lng,
        description,
        ...(photoMediaId ? { photoMediaId } : {}),
        creatorUserId: actorKey(session),
        createdAtMs: nowMs(),
        checkInCount: 0,
        actionCount: 0,
        moderationStatus: "approved",
        moderatedAtMs: nowMs(),
        moderatedByUserId: "system:auto"
      };
      spots.push(spot);
      persistState();
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
      persistState();
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
      persistState();
      return ok(row);
    },

    listCheckIns(spotId: unknown): Result<ReadonlyArray<SpotCheckIn>> {
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      if (!spots.some((s) => s.spotId === id)) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      const values = Array.from((checkInsBySpot.get(id) ?? new Map()).values()).sort((a, b) => b.checkedInAtMs - a.checkedInAtMs);
      return ok(values);
    },

    approve(adminSession: SessionLike, spotId: unknown, reason?: unknown): Result<CruisingSpot> {
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      const idx = spots.findIndex((s) => s.spotId === id);
      if (idx < 0) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      const adminUserId = typeof adminSession.userId === "string" && adminSession.userId.trim() ? adminSession.userId : "system";
      const reasonText = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : undefined;
      spots[idx] = {
        ...spots[idx],
        moderationStatus: "approved",
        moderatedAtMs: nowMs(),
        moderatedByUserId: adminUserId,
        ...(reasonText ? { moderationReason: reasonText } : {})
      };
      persistState();
      return ok(spots[idx]);
    },

    reject(adminSession: SessionLike, spotId: unknown, reason?: unknown): Result<CruisingSpot> {
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      const idx = spots.findIndex((s) => s.spotId === id);
      if (idx < 0) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      const adminUserId = typeof adminSession.userId === "string" && adminSession.userId.trim() ? adminSession.userId : "system";
      const reasonText = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : undefined;
      spots[idx] = {
        ...spots[idx],
        moderationStatus: "rejected",
        moderatedAtMs: nowMs(),
        moderatedByUserId: adminUserId,
        ...(reasonText ? { moderationReason: reasonText } : {})
      };
      persistState();
      return ok(spots[idx]);
    },

    remove(spotId: unknown): Result<{ spotId: string }> {
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      const idx = spots.findIndex((s) => s.spotId === id);
      if (idx < 0) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      spots.splice(idx, 1);
      checkInsBySpot.delete(id);
      actionBySpot.delete(id);
      persistState();
      return ok({ spotId: id });
    }
  };
}
