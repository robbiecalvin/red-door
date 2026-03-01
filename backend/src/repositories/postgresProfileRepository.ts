import type { Pool } from "pg";

import type { Profile, ProfileRepository, ProfileStats } from "../services/profileService";

function parseStats(value: unknown): ProfileStats {
  if (typeof value !== "object" || value === null) return {};
  const raw = value as Record<string, unknown>;
  return {
    heightInches: typeof raw.heightInches === "number" ? raw.heightInches : undefined,
    race: typeof raw.race === "string" ? raw.race : undefined,
    cockSizeInches: typeof raw.cockSizeInches === "number" ? raw.cockSizeInches : undefined,
    cutStatus: raw.cutStatus === "cut" || raw.cutStatus === "uncut" ? raw.cutStatus : undefined,
    weightLbs: typeof raw.weightLbs === "number" ? raw.weightLbs : undefined,
    position: raw.position === "top" || raw.position === "bottom" || raw.position === "side" ? raw.position : undefined
  };
}

function parseTravelMode(value: unknown): Profile["travelMode"] {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const enabled = raw.enabled === true;
  const lat = typeof raw.lat === "number" ? raw.lat : undefined;
  const lng = typeof raw.lng === "number" ? raw.lng : undefined;
  return { enabled, lat, lng };
}

function parseGallery(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function toProfile(row: Record<string, unknown>): Profile {
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name),
    age: Number(row.age),
    bio: String(row.bio),
    stats: parseStats(row.stats_json),
    discreetMode: row.discreet_mode === true,
    travelMode: parseTravelMode(row.travel_mode_json),
    mainPhotoMediaId: typeof row.main_photo_media_id === "string" ? row.main_photo_media_id : undefined,
    galleryMediaIds: parseGallery(row.gallery_media_ids),
    videoMediaId: typeof row.video_media_id === "string" ? row.video_media_id : undefined,
    updatedAtMs: Number(row.updated_at_ms)
  };
}

export function createPostgresProfileRepository(pool: Pool): ProfileRepository {
  return {
    async getByUserId(userId: string): Promise<Profile | null> {
      const res = await pool.query(
        `SELECT user_id, display_name, age, bio, stats_json, discreet_mode, travel_mode_json, main_photo_media_id, gallery_media_ids, video_media_id, updated_at_ms
         FROM profiles
         WHERE user_id = $1`,
        [userId]
      );
      if (res.rowCount !== 1) return null;
      return toProfile(res.rows[0] as Record<string, unknown>);
    },

    async listAll(): Promise<ReadonlyArray<Profile>> {
      const res = await pool.query(
        `SELECT user_id, display_name, age, bio, stats_json, discreet_mode, travel_mode_json, main_photo_media_id, gallery_media_ids, video_media_id, updated_at_ms
         FROM profiles`
      );
      return res.rows.map((row) => toProfile(row as Record<string, unknown>));
    },

    async upsert(profile: Profile): Promise<void> {
      await pool.query(
        `INSERT INTO profiles (
          user_id, display_name, age, bio, stats_json, discreet_mode, travel_mode_json, main_photo_media_id, gallery_media_ids, video_media_id, updated_at_ms
        ) VALUES (
          $1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9::jsonb, $10, $11
        )
        ON CONFLICT (user_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          age = EXCLUDED.age,
          bio = EXCLUDED.bio,
          stats_json = EXCLUDED.stats_json,
          discreet_mode = EXCLUDED.discreet_mode,
          travel_mode_json = EXCLUDED.travel_mode_json,
          main_photo_media_id = EXCLUDED.main_photo_media_id,
          gallery_media_ids = EXCLUDED.gallery_media_ids,
          video_media_id = EXCLUDED.video_media_id,
          updated_at_ms = EXCLUDED.updated_at_ms`,
        [
          profile.userId,
          profile.displayName,
          profile.age,
          profile.bio,
          JSON.stringify(profile.stats ?? {}),
          profile.discreetMode === true,
          profile.travelMode ? JSON.stringify(profile.travelMode) : null,
          profile.mainPhotoMediaId ?? null,
          JSON.stringify(profile.galleryMediaIds ?? []),
          profile.videoMediaId ?? null,
          profile.updatedAtMs
        ]
      );
    }
  };
}
