import { createMediaService, type MediaRecord, type MediaRepository, type ObjectStorage } from "../backend/src/services/mediaService";
import type { Profile, ProfileRepository, SessionLike } from "../backend/src/services/profileService";

function createMediaRepo(): MediaRepository & { byId: Map<string, MediaRecord> } {
  const byId = new Map<string, MediaRecord>();
  return {
    byId,
    async createInitiated(record: MediaRecord): Promise<void> {
      byId.set(record.mediaId, record);
    },
    async getById(mediaId: string): Promise<MediaRecord | null> {
      return byId.get(mediaId) ?? null;
    },
    async markUploaded(mediaId: string, uploadedAtMs: number, sha256?: string): Promise<void> {
      const existing = byId.get(mediaId);
      if (!existing) return;
      byId.set(mediaId, { ...existing, uploadedAtMs, sha256 });
    }
  };
}

function createProfileRepo(seed?: Profile): ProfileRepository {
  const byUserId = new Map<string, Profile>();
  if (seed) byUserId.set(seed.userId, seed);
  return {
    async getByUserId(userId: string): Promise<Profile | null> {
      return byUserId.get(userId) ?? null;
    },
    async listAll(): Promise<ReadonlyArray<Profile>> {
      return Array.from(byUserId.values());
    },
    async upsert(profile: Profile): Promise<void> {
      byUserId.set(profile.userId, profile);
    }
  };
}

function createStorage(overrides: Partial<ObjectStorage> = {}): ObjectStorage {
  return {
    async presignPutObject(params) {
      return `https://upload.local/${encodeURIComponent(params.key)}`;
    },
    async presignGetObject(params) {
      return `https://download.local/${encodeURIComponent(params.key)}`;
    },
    async headObject() {
      return { ok: true as const, sizeBytes: 1024 };
    },
    ...overrides
  };
}

const session: SessionLike = { userType: "registered", userId: "user_1", ageVerified: true };

describe("mediaService", () => {
  it("Given no profile exists When completeUpload is called Then it rejects before marking media as uploaded", async () => {
    const repo = createMediaRepo();
    let headCalls = 0;
    const storage = createStorage({
      async headObject() {
        headCalls += 1;
        return { ok: true as const, sizeBytes: 1024 };
      }
    });
    const svc = createMediaService({
      repo,
      profileRepo: createProfileRepo(),
      storage,
      bucket: "test-bucket",
      nowMs: () => 1_700_000_000_000
    });

    const initiated = await svc.initiateUpload(session, {
      kind: "photo_main",
      mimeType: "image/png",
      sizeBytes: 1024
    });
    expect(initiated.ok).toBe(true);
    if (!initiated.ok) throw new Error("unreachable");

    const completed = await svc.completeUpload(session, initiated.value.mediaId);
    expect(completed.ok).toBe(false);
    if (completed.ok) throw new Error("unreachable");
    expect(completed.error).toEqual({ code: "PROFILE_NOT_FOUND", message: "Profile not found." });

    const stored = await repo.getById(initiated.value.mediaId);
    expect(stored?.uploadedAtMs).toBeUndefined();
    expect(headCalls).toBe(0);
  });

  it("Given a HEIC photo upload request When initiateUpload is called Then it is accepted with a HEIC object key", async () => {
    const repo = createMediaRepo();
    const svc = createMediaService({
      repo,
      profileRepo: createProfileRepo({
        userId: "user_1",
        displayName: "User",
        age: 30,
        bio: "Bio",
        stats: {},
        galleryMediaIds: [],
        updatedAtMs: 1_700_000_000_000
      }),
      storage: createStorage(),
      bucket: "test-bucket",
      nowMs: () => 1_700_000_000_001
    });

    const initiated = await svc.initiateUpload(session, {
      kind: "photo_main",
      mimeType: "image/heic",
      sizeBytes: 1024
    });

    expect(initiated.ok).toBe(true);
    if (!initiated.ok) throw new Error("unreachable");
    expect(initiated.value.objectKey.endsWith(".heic")).toBe(true);
  });
});
