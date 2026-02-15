import fs from "node:fs";
import path from "node:path";

import type { Profile, ProfileRepository } from "../services/profileService";

type ProfileRepoOptions = Readonly<{
  storeFilePath?: string;
}>;

const DEFAULT_PROFILE_STORE_FILE_PATH = path.resolve(process.cwd(), "backend/.data/profiles.json");

function isProfileLike(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.userId === "string" &&
    typeof v.displayName === "string" &&
    typeof v.age === "number" &&
    typeof v.bio === "string" &&
    typeof v.updatedAtMs === "number" &&
    Array.isArray(v.galleryMediaIds)
  );
}

export function createInMemoryProfileRepository(options: ProfileRepoOptions = {}): ProfileRepository {
  const storeFilePath = options.storeFilePath ?? DEFAULT_PROFILE_STORE_FILE_PATH;
  const byUserId = new Map<string, Profile>();

  function load(): void {
    if (!fs.existsSync(storeFilePath)) return;
    const raw = fs.readFileSync(storeFilePath, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as { version?: unknown; profiles?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.profiles)) {
      throw new Error("Invalid profile store format.");
    }
    for (const candidate of parsed.profiles) {
      if (!isProfileLike(candidate)) continue;
      byUserId.set(candidate.userId, candidate);
    }
  }

  function persist(): void {
    const dir = path.dirname(storeFilePath);
    fs.mkdirSync(dir, { recursive: true });
    const profiles = Array.from(byUserId.values()).filter((p) => !p.userId.startsWith("guest:"));
    const payload = { version: 1, profiles };
    fs.writeFileSync(storeFilePath, JSON.stringify(payload), "utf8");
  }

  load();

  return {
    async getByUserId(userId: string): Promise<Profile | null> {
      return byUserId.get(userId) ?? null;
    },
    async listAll(): Promise<ReadonlyArray<Profile>> {
      return Array.from(byUserId.values());
    },
    async upsert(profile: Profile): Promise<void> {
      byUserId.set(profile.userId, profile);
      // Persist only registered/subscriber profiles; guest profiles remain session-ephemeral.
      if (!profile.userId.startsWith("guest:")) {
        persist();
      }
    }
  };
}
