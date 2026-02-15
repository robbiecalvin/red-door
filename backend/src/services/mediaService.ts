import { createHash, randomUUID } from "node:crypto";

import type { ProfileRepository, SessionLike } from "./profileService";

export type MediaKind = "photo_main" | "photo_gallery" | "video";

export type ErrorCode =
  | "ANONYMOUS_FORBIDDEN"
  | "AGE_GATE_REQUIRED"
  | "INVALID_INPUT"
  | "UNAUTHORIZED_ACTION"
  | "MEDIA_TYPE_NOT_ALLOWED"
  | "MEDIA_TOO_LARGE"
  | "MEDIA_UPLOAD_INCOMPLETE"
  | "PROFILE_NOT_FOUND"
  | "STORAGE_ERROR";

export type ServiceError = Readonly<{
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
}>;

type ResultOk<T> = Readonly<{ ok: true; value: T }>;
type ResultErr = Readonly<{ ok: false; error: ServiceError }>;
export type Result<T> = ResultOk<T> | ResultErr;

export type MediaRecord = Readonly<{
  mediaId: string;
  userId: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  objectKey: string;
  sha256?: string;
  createdAtMs: number;
  uploadedAtMs?: number;
}>;

export type MediaRepository = Readonly<{
  createInitiated(record: MediaRecord): Promise<void>;
  getById(mediaId: string): Promise<MediaRecord | null>;
  markUploaded(mediaId: string, uploadedAtMs: number, sha256?: string): Promise<void>;
}>;

export type ObjectStorage = Readonly<{
  presignPutObject(params: Readonly<{ bucket: string; key: string; mimeType: string; expiresInSeconds: number }>): Promise<string>;
  presignGetObject(params: Readonly<{ bucket: string; key: string; expiresInSeconds: number }>): Promise<string>;
  headObject(params: Readonly<{ bucket: string; key: string }>): Promise<{ ok: true; sizeBytes?: number } | { ok: false; error: string }>;
}>;

export type MediaServiceDeps = Readonly<{
  repo: MediaRepository;
  profileRepo: ProfileRepository;
  storage: ObjectStorage;
  bucket: string;
  nowMs?: () => number;
}>;

export type InitiateRequest = Readonly<{
  kind: unknown;
  mimeType: unknown;
  sizeBytes: unknown;
}>;

export type InitiateResponse = Readonly<{
  mediaId: string;
  uploadUrl: string;
  objectKey: string;
  expiresInSeconds: number;
}>;

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  return { ok: false, error: context ? { code, message, context } : { code, message } };
}

function requireRegistered(session: SessionLike): Result<{ userId: string }> {
  if (session.userType === "guest") return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot upload media.");
  if (session.ageVerified !== true) return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
  if (typeof session.userId !== "string" || session.userId.trim() === "") return err("INVALID_INPUT", "Invalid user identity.");
  return ok({ userId: session.userId });
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const i = Math.trunc(v);
  return i === v ? i : null;
}

function validateKind(v: unknown): Result<MediaKind> {
  if (v === "photo_main" || v === "photo_gallery" || v === "video") return ok(v);
  return err("INVALID_INPUT", "Invalid media kind.");
}

function validateMimeType(kind: MediaKind, v: unknown): Result<string> {
  const mime = asString(v);
  if (!mime) return err("INVALID_INPUT", "MIME type is required.");

  const allowed =
    kind === "video"
      ? new Set(["video/mp4", "video/webm", "video/quicktime"])
      : new Set(["image/jpeg", "image/png", "image/webp"]);

  if (!allowed.has(mime)) return err("MEDIA_TYPE_NOT_ALLOWED", "Media type is not allowed.", { mimeType: mime });
  return ok(mime);
}

function maxSizeBytesFor(kind: MediaKind): number {
  // Keep conservative defaults; enforce deterministically server-side.
  return kind === "video" ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  return "bin";
}

function objectKeyFor(userId: string, mediaId: string, mimeType: string): string {
  const ext = extensionForMime(mimeType);
  return `profiles/${userId}/${mediaId}.${ext}`;
}

export function createMediaService(deps: MediaServiceDeps): Readonly<{
  initiateUpload(session: SessionLike, req: InitiateRequest): Promise<Result<InitiateResponse>>;
  completeUpload(session: SessionLike, mediaId: unknown): Promise<Result<{ media: MediaRecord }>>;
  getDownloadUrl(session: SessionLike, mediaId: string): Promise<Result<{ downloadUrl: string }>>;
  getPublicDownloadUrl(mediaId: string): Promise<Result<{ downloadUrl: string }>>;
}> {
  const nowMs = deps.nowMs ?? (() => Date.now());
  const bucket = deps.bucket;

  return {
    async initiateUpload(session: SessionLike, req: InitiateRequest): Promise<Result<InitiateResponse>> {
      const auth = requireRegistered(session);
      if (!auth.ok) return auth;

      const kindRes = validateKind(req.kind);
      if (!kindRes.ok) return kindRes;
      const kind = kindRes.value;

      const mimeRes = validateMimeType(kind, req.mimeType);
      if (!mimeRes.ok) return mimeRes;
      const mimeType = mimeRes.value;

      const sizeBytes = asInt(req.sizeBytes);
      if (sizeBytes === null || sizeBytes <= 0) return err("INVALID_INPUT", "Size must be a positive integer.");
      const max = maxSizeBytesFor(kind);
      if (sizeBytes > max) return err("MEDIA_TOO_LARGE", "Media is too large.", { maxSizeBytes: max });

      const mediaId = randomUUID();
      const objectKey = objectKeyFor(auth.value.userId, mediaId, mimeType);
      const expiresInSeconds = 60 * 5;

      const uploadUrl = await deps.storage.presignPutObject({
        bucket,
        key: objectKey,
        mimeType,
        expiresInSeconds
      });

      const record: MediaRecord = {
        mediaId,
        userId: auth.value.userId,
        kind,
        mimeType,
        sizeBytes,
        objectKey,
        createdAtMs: nowMs()
      };

      await deps.repo.createInitiated(record);

      return ok({ mediaId, uploadUrl, objectKey, expiresInSeconds });
    },

    async completeUpload(session: SessionLike, mediaId: unknown): Promise<Result<{ media: MediaRecord }>> {
      const auth = requireRegistered(session);
      if (!auth.ok) return auth;

      const id = asString(mediaId);
      if (!id) return err("INVALID_INPUT", "mediaId is required.");

      const media = await deps.repo.getById(id);
      if (!media) return err("INVALID_INPUT", "Unknown media.");
      if (media.userId !== auth.value.userId) return err("UNAUTHORIZED_ACTION", "Not allowed.");

      const head = await deps.storage.headObject({ bucket, key: media.objectKey });
      if (!head.ok) return err("MEDIA_UPLOAD_INCOMPLETE", "Upload is not complete.");

      const max = maxSizeBytesFor(media.kind);
      const actualSize = head.sizeBytes;
      if (typeof actualSize === "number" && Number.isFinite(actualSize) && actualSize > max) {
        return err("MEDIA_TOO_LARGE", "Media is too large.", { maxSizeBytes: max });
      }

      const sha256 = createHash("sha256").update(media.objectKey).digest("hex");
      const uploadedAtMs = nowMs();
      await deps.repo.markUploaded(id, uploadedAtMs, sha256);

      // Attach to profile if it exists. Profiles are required for Date discovery and must be server-owned.
      const profile = await deps.profileRepo.getByUserId(auth.value.userId);
      if (!profile) return err("PROFILE_NOT_FOUND", "Profile not found.");

      const updatedAtMs = nowMs();
      const updated = (() => {
        if (media.kind === "photo_main") return { ...profile, mainPhotoMediaId: id, updatedAtMs };
        if (media.kind === "video") return { ...profile, videoMediaId: id, updatedAtMs };
        const nextGallery = Array.from(new Set([...(profile.galleryMediaIds ?? []), id])).slice(0, 7);
        return { ...profile, galleryMediaIds: nextGallery, updatedAtMs };
      })();

      await deps.profileRepo.upsert(updated);

      const refreshed = await deps.repo.getById(id);
      if (!refreshed) return err("STORAGE_ERROR", "Media storage error.");
      return ok({ media: refreshed });
    },

    async getDownloadUrl(session: SessionLike, mediaId: string): Promise<Result<{ downloadUrl: string }>> {
      const auth = requireRegistered(session);
      if (!auth.ok) return auth;

      const media = await deps.repo.getById(mediaId);
      if (!media) return err("INVALID_INPUT", "Unknown media.");
      if (media.userId !== auth.value.userId) return err("UNAUTHORIZED_ACTION", "Not allowed.");
      if (!media.uploadedAtMs) return err("MEDIA_UPLOAD_INCOMPLETE", "Upload is not complete.");

      const downloadUrl = await deps.storage.presignGetObject({ bucket, key: media.objectKey, expiresInSeconds: 60 * 10 });
      return ok({ downloadUrl });
    },

    async getPublicDownloadUrl(mediaId: string): Promise<Result<{ downloadUrl: string }>> {
      const id = asString(mediaId);
      if (!id) return err("INVALID_INPUT", "mediaId is required.");
      const media = await deps.repo.getById(id);
      if (!media) return err("INVALID_INPUT", "Unknown media.");
      if (!media.uploadedAtMs) return err("MEDIA_UPLOAD_INCOMPLETE", "Upload is not complete.");
      const downloadUrl = await deps.storage.presignGetObject({ bucket, key: media.objectKey, expiresInSeconds: 60 * 10 });
      return ok({ downloadUrl });
    }
  };
}
