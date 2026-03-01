import type { Pool } from "pg";

import type { MediaRecord, MediaRepository } from "../services/mediaService";

function toMediaRecord(row: Record<string, unknown>): MediaRecord {
  const uploadedAtRaw = row.uploaded_at_ms;
  const uploadedAtMs =
    typeof uploadedAtRaw === "number"
      ? uploadedAtRaw
      : typeof uploadedAtRaw === "string" && uploadedAtRaw.trim() !== ""
        ? Number(uploadedAtRaw)
        : undefined;
  return {
    mediaId: String(row.media_id),
    userId: String(row.user_id),
    kind: row.kind as MediaRecord["kind"],
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    objectKey: String(row.object_key),
    sha256: typeof row.sha256 === "string" ? row.sha256 : undefined,
    createdAtMs: Number(row.created_at_ms),
    uploadedAtMs: Number.isFinite(uploadedAtMs) ? uploadedAtMs : undefined
  };
}

export function createPostgresMediaRepository(pool: Pool): MediaRepository {
  return {
    async createInitiated(record: MediaRecord): Promise<void> {
      await pool.query(
        `INSERT INTO media_records (
          media_id, user_id, kind, mime_type, size_bytes, object_key, sha256, created_at_ms, uploaded_at_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          record.mediaId,
          record.userId,
          record.kind,
          record.mimeType,
          record.sizeBytes,
          record.objectKey,
          record.sha256 ?? null,
          record.createdAtMs,
          record.uploadedAtMs ?? null
        ]
      );
    },

    async getById(mediaId: string): Promise<MediaRecord | null> {
      const res = await pool.query(
        `SELECT media_id, user_id, kind, mime_type, size_bytes, object_key, sha256, created_at_ms, uploaded_at_ms
         FROM media_records
         WHERE media_id = $1`,
        [mediaId]
      );
      if (res.rowCount !== 1) return null;
      return toMediaRecord(res.rows[0] as Record<string, unknown>);
    },

    async markUploaded(mediaId: string, uploadedAtMs: number, sha256?: string): Promise<void> {
      await pool.query(
        `UPDATE media_records
         SET uploaded_at_ms = $2,
             sha256 = COALESCE($3, sha256)
         WHERE media_id = $1`,
        [mediaId, uploadedAtMs, sha256 ?? null]
      );
    }
  };
}
