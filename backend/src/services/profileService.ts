import { containsDisallowedKidVariation } from "./contentPolicy";

export type ErrorCode = "ANONYMOUS_FORBIDDEN" | "AGE_GATE_REQUIRED" | "INVALID_INPUT" | "PROFILE_NOT_FOUND" | "PROFILE_HIDDEN";

export type ServiceError = Readonly<{
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
}>;

type ResultOk<T> = Readonly<{ ok: true; value: T }>;
type ResultErr = Readonly<{ ok: false; error: ServiceError }>;
export type Result<T> = ResultOk<T> | ResultErr;

export type ProfileCutStatus = "cut" | "uncut";
export type ProfilePosition = "top" | "bottom" | "side";

export type ProfileStats = Readonly<{
  heightInches?: number;
  race?: string;
  cockSizeInches?: number;
  cutStatus?: ProfileCutStatus;
  weightLbs?: number;
  position?: ProfilePosition;
}>;

export type Profile = Readonly<{
  userId: string;
  displayName: string;
  age: number;
  bio: string;
  stats: ProfileStats;
  discreetMode?: boolean;
  travelMode?: Readonly<{ enabled: boolean; lat?: number; lng?: number }>;
  mainPhotoMediaId?: string;
  galleryMediaIds: ReadonlyArray<string>;
  videoMediaId?: string;
  updatedAtMs: number;
}>;

export type PublicProfile = Readonly<{
  userId: string;
  displayName: string;
  age: number;
  bio: string;
  stats: ProfileStats;
  discreetMode?: boolean;
  mainPhotoMediaId?: string;
  galleryMediaIds: ReadonlyArray<string>;
  videoMediaId?: string;
  updatedAtMs: number;
}>;

export type SessionLike = Readonly<{
  userType: "guest" | "registered" | "subscriber";
  sessionToken?: string;
  userId?: string;
  ageVerified: boolean;
}>;

export type ProfileUpdate = Readonly<{
  displayName: unknown;
  age: unknown;
  bio: unknown;
  stats?: unknown;
  discreetMode?: unknown;
  travelMode?: unknown;
}>;

export type ProfileRepository = Readonly<{
  getByUserId(userId: string): Promise<Profile | null>;
  listAll(): Promise<ReadonlyArray<Profile>>;
  upsert(profile: Profile): Promise<void>;
}>;

export type ProfileServiceDeps = Readonly<{
  repo: ProfileRepository;
  nowMs?: () => number;
}>;

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  return { ok: false, error: context ? { code, message, context } : { code, message } };
}

function requireProfileOwner(session: SessionLike): Result<{ userId: string }> {
  if (session.ageVerified !== true) {
    return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
  }
  if (session.userType === "guest") {
    if (typeof session.sessionToken !== "string" || session.sessionToken.trim() === "") {
      return err("INVALID_INPUT", "Invalid session.");
    }
    return ok({ userId: `guest:${session.sessionToken}` });
  }
  if (typeof session.userId !== "string" || session.userId.trim() === "") {
    return err("INVALID_INPUT", "Invalid user identity.");
  }
  return ok({ userId: session.userId });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function isGuestUserId(userId: string): boolean {
  return userId.startsWith("guest:");
}

function asNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function asInt(v: unknown): number | null {
  const n = asNumber(v);
  if (n === null) return null;
  const i = Math.trunc(n);
  return i === n ? i : null;
}

function validateDisplayName(v: unknown): Result<string> {
  const s = asTrimmedString(v);
  if (!s) return err("INVALID_INPUT", "Display name is required.");
  if (s.length < 2 || s.length > 32) {
    return err("INVALID_INPUT", "Display name must be 2-32 characters.", { min: 2, max: 32 });
  }
  if (containsDisallowedKidVariation(s)) {
    return err("INVALID_INPUT", "Display name contains disallowed language.");
  }
  return ok(s);
}

function validateAge(v: unknown): Result<number> {
  const age = asInt(v);
  if (age === null) return err("INVALID_INPUT", "Age must be an integer.");
  if (age < 18) return err("INVALID_INPUT", "Age must be 18 or older.", { minimumAge: 18 });
  if (age > 120) return err("INVALID_INPUT", "Age is out of range.", { maximumAge: 120 });
  return ok(age);
}

function validateBio(v: unknown): Result<string> {
  const s = typeof v === "string" ? v : "";
  const t = s.trim();
  if (t.length > 280) return err("INVALID_INPUT", "Bio must be 280 characters or fewer.", { max: 280 });
  if (containsDisallowedKidVariation(t)) {
    return err("INVALID_INPUT", "Bio contains disallowed language.");
  }
  return ok(t);
}

function validateStats(v: unknown): Result<ProfileStats> {
  if (v === undefined) return ok({});
  if (!isObject(v)) return err("INVALID_INPUT", "Stats must be an object.");

  const stats: Record<string, unknown> = v;

  const heightInches = (() => {
    if (stats.heightInches === undefined) return undefined;
    return asInt(stats.heightInches);
  })();
  if (heightInches === null) return err("INVALID_INPUT", "Height must be an integer (inches).");
  if (heightInches !== undefined && (heightInches < 36 || heightInches > 96)) {
    return err("INVALID_INPUT", "Height is out of range.", { min: 36, max: 96 });
  }

  const race = (() => {
    if (stats.race === undefined) return undefined;
    return asTrimmedString(stats.race);
  })();
  if (race === null) return err("INVALID_INPUT", "Race must be a non-empty string.");
  if (race !== undefined && race.length > 24) return err("INVALID_INPUT", "Race must be 24 characters or fewer.", { max: 24 });
  if (race !== undefined && containsDisallowedKidVariation(race)) {
    return err("INVALID_INPUT", "Race contains disallowed language.");
  }

  const cockSize = (() => {
    if (stats.cockSizeInches === undefined) return undefined;
    return asNumber(stats.cockSizeInches);
  })();
  if (cockSize === null) return err("INVALID_INPUT", "Cock size must be a number (inches).");
  if (cockSize !== undefined && (cockSize < 1 || cockSize > 20)) {
    return err("INVALID_INPUT", "Cock size is out of range.", { min: 1, max: 20 });
  }

  const cutStatusRaw = stats.cutStatus;
  const cutStatus = (() => {
    if (cutStatusRaw === undefined) return undefined;
    if (cutStatusRaw === "cut" || cutStatusRaw === "uncut") return cutStatusRaw as ProfileCutStatus;
    return null;
  })();
  if (cutStatus === null) return err("INVALID_INPUT", "Cut status must be 'cut' or 'uncut'.");

  const weightLbs = (() => {
    if (stats.weightLbs === undefined) return undefined;
    return asInt(stats.weightLbs);
  })();
  if (weightLbs === null) return err("INVALID_INPUT", "Weight must be an integer (lbs).");
  if (weightLbs !== undefined && (weightLbs < 80 || weightLbs > 500)) {
    return err("INVALID_INPUT", "Weight is out of range.", { min: 80, max: 500 });
  }

  const positionRaw = stats.position;
  const position = (() => {
    if (positionRaw === undefined) return undefined;
    if (positionRaw === "top" || positionRaw === "bottom" || positionRaw === "side") return positionRaw as ProfilePosition;
    return null;
  })();
  if (position === null) return err("INVALID_INPUT", "Position must be 'top', 'bottom', or 'side'.");

  return ok({
    heightInches,
    race,
    cockSizeInches: cockSize,
    cutStatus,
    weightLbs,
    position
  });
}

export function createProfileService(deps: ProfileServiceDeps): Readonly<{
  getMe(session: SessionLike): Promise<Result<Profile>>;
  upsertMe(session: SessionLike, update: ProfileUpdate): Promise<Result<Profile>>;
  updateMediaReferences(
    session: SessionLike,
    update: Readonly<{
      galleryMediaIds?: unknown;
      mainPhotoMediaId?: unknown;
    }>
  ): Promise<Result<Profile>>;
  getPublicByUserId(userId: unknown): Promise<Result<PublicProfile>>;
  listPublicProfiles(): Promise<Result<ReadonlyArray<PublicProfile>>>;
}> {
  const nowMs = deps.nowMs ?? (() => Date.now());

  return {
    async getMe(session: SessionLike): Promise<Result<Profile>> {
      const auth = requireProfileOwner(session);
      if (!auth.ok) return auth;

      const existing = await deps.repo.getByUserId(auth.value.userId);
      if (!existing) return err("PROFILE_NOT_FOUND", "Profile not found.");
      return ok(existing);
    },

    async upsertMe(session: SessionLike, update: ProfileUpdate): Promise<Result<Profile>> {
      const auth = requireProfileOwner(session);
      if (!auth.ok) return auth;

      const displayNameRes = validateDisplayName(update.displayName);
      if (!displayNameRes.ok) return displayNameRes;
      const ageRes = validateAge(update.age);
      if (!ageRes.ok) return ageRes;
      const bioRes = validateBio(update.bio);
      if (!bioRes.ok) return bioRes;
      const statsRes = validateStats(update.stats);
      if (!statsRes.ok) return statsRes;

      const userId = auth.value.userId;
      const existing = await deps.repo.getByUserId(userId);
      const discreetMode = update.discreetMode === undefined ? existing?.discreetMode === true : update.discreetMode === true;
      let travelMode = existing?.travelMode;
      if (update.travelMode !== undefined) {
        if (!isObject(update.travelMode)) return err("INVALID_INPUT", "travelMode must be an object.");
        const enabled = (update.travelMode as Record<string, unknown>).enabled === true;
        const latRaw = (update.travelMode as Record<string, unknown>).lat;
        const lngRaw = (update.travelMode as Record<string, unknown>).lng;
        const lat = latRaw === undefined ? undefined : asNumber(latRaw);
        const lng = lngRaw === undefined ? undefined : asNumber(lngRaw);
        if (latRaw !== undefined && lat === null) return err("INVALID_INPUT", "travelMode.lat must be a number.");
        if (lngRaw !== undefined && lng === null) return err("INVALID_INPUT", "travelMode.lng must be a number.");
        if (typeof lat === "number" && (lat < -90 || lat > 90)) return err("INVALID_INPUT", "travelMode.lat is out of range.", { min: -90, max: 90 });
        if (typeof lng === "number" && (lng < -180 || lng > 180)) return err("INVALID_INPUT", "travelMode.lng is out of range.", { min: -180, max: 180 });
        travelMode = {
          enabled,
          lat: lat === null ? undefined : lat,
          lng: lng === null ? undefined : lng
        };
      }

      const next: Profile = {
        userId,
        displayName: displayNameRes.value,
        age: ageRes.value,
        bio: bioRes.value,
        stats: statsRes.value,
        discreetMode,
        travelMode,
        mainPhotoMediaId: existing?.mainPhotoMediaId,
        galleryMediaIds: existing?.galleryMediaIds ?? [],
        videoMediaId: existing?.videoMediaId,
        updatedAtMs: nowMs()
      };

      await deps.repo.upsert(next);
      return ok(next);
    },

    async updateMediaReferences(
      session: SessionLike,
      update: Readonly<{
        galleryMediaIds?: unknown;
        mainPhotoMediaId?: unknown;
      }>
    ): Promise<Result<Profile>> {
      const auth = requireProfileOwner(session);
      if (!auth.ok) return auth;
      const existing = await deps.repo.getByUserId(auth.value.userId);
      if (!existing) return err("PROFILE_NOT_FOUND", "Profile not found.");

      let nextGallery = existing.galleryMediaIds;
      if (update.galleryMediaIds !== undefined) {
        if (!Array.isArray(update.galleryMediaIds)) {
          return err("INVALID_INPUT", "galleryMediaIds must be an array.");
        }
        const parsed = update.galleryMediaIds
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .filter((v) => v.length > 0);
        const deduped = Array.from(new Set(parsed)).slice(0, 7);
        nextGallery = deduped;
      }

      const allowedIds = new Set<string>([
        ...existing.galleryMediaIds,
        ...(typeof existing.mainPhotoMediaId === "string" && existing.mainPhotoMediaId.trim() ? [existing.mainPhotoMediaId.trim()] : [])
      ]);

      for (const id of nextGallery) {
        if (!allowedIds.has(id)) {
          return err("INVALID_INPUT", "Gallery media reference is not owned by this profile.");
        }
      }

      let nextMain = existing.mainPhotoMediaId;
      if (update.mainPhotoMediaId !== undefined) {
        const mainId = typeof update.mainPhotoMediaId === "string" ? update.mainPhotoMediaId.trim() : "";
        if (!mainId) {
          return err("INVALID_INPUT", "mainPhotoMediaId must be a non-empty string.");
        }
        if (!allowedIds.has(mainId)) {
          return err("INVALID_INPUT", "Main photo reference is not owned by this profile.");
        }
        nextMain = mainId;
      }

      const next: Profile = {
        ...existing,
        galleryMediaIds: nextGallery,
        mainPhotoMediaId: nextMain,
        updatedAtMs: nowMs()
      };
      await deps.repo.upsert(next);
      return ok(next);
    },

    async getPublicByUserId(userId: unknown): Promise<Result<PublicProfile>> {
      const id = asTrimmedString(userId);
      if (!id) return err("INVALID_INPUT", "userId is required.");
      if (isGuestUserId(id)) return err("PROFILE_NOT_FOUND", "Profile not found.");
      const existing = await deps.repo.getByUserId(id);
      if (!existing) return err("PROFILE_NOT_FOUND", "Profile not found.");
      if (existing.discreetMode === true) return err("PROFILE_HIDDEN", "Profile is hidden.");
      return ok({
        userId: existing.userId,
        displayName: existing.displayName,
        age: existing.age,
        bio: existing.bio,
        stats: existing.stats,
        discreetMode: existing.discreetMode,
        mainPhotoMediaId: existing.mainPhotoMediaId,
        galleryMediaIds: existing.galleryMediaIds,
        videoMediaId: existing.videoMediaId,
        updatedAtMs: existing.updatedAtMs
      });
    },

    async listPublicProfiles(): Promise<Result<ReadonlyArray<PublicProfile>>> {
      const all = await deps.repo.listAll();
      const visible = all
        .filter((p) => !isGuestUserId(p.userId))
        .filter((p) => p.discreetMode !== true)
        .map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
          age: p.age,
          bio: p.bio,
          stats: p.stats,
          discreetMode: p.discreetMode,
          mainPhotoMediaId: p.mainPhotoMediaId,
          galleryMediaIds: p.galleryMediaIds,
          videoMediaId: p.videoMediaId,
          updatedAtMs: p.updatedAtMs
        }));
      return ok(visible);
    }
  };
}
