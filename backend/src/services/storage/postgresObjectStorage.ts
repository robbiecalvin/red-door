import type { Pool } from "pg";

import type { ObjectStorage } from "../mediaService";

type StoredObject = Readonly<{
  data: Buffer;
  mimeType: string;
}>;

export type PostgresObjectStorage = ObjectStorage & Readonly<{
  putObject(key: string, data: Buffer, mimeType: string): Promise<void>;
  getObject(key: string): Promise<StoredObject | null>;
}>;

function encodeKey(key: string): string {
  return encodeURIComponent(key);
}

export function createPostgresObjectStorage(pool: Pool): PostgresObjectStorage {
  return {
    async presignPutObject(params) {
      const mime = encodeURIComponent(params.mimeType);
      return `/api/storage/postgres/upload/${encodeKey(params.key)}?mimeType=${mime}`;
    },

    async presignGetObject(params) {
      return `/api/storage/postgres/download/${encodeKey(params.key)}`;
    },

    async headObject(params) {
      const res = await pool.query<{ size_bytes: number }>(
        "SELECT octet_length(data) AS size_bytes FROM media_objects WHERE object_key = $1",
        [params.key]
      );
      if (res.rowCount !== 1) {
        return { ok: false as const, error: "Object not found." };
      }
      const sizeBytes = res.rows[0]?.size_bytes;
      return { ok: true as const, sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : undefined };
    },

    async putObject(key, data, mimeType) {
      await pool.query(
        `
          INSERT INTO media_objects (object_key, mime_type, data, updated_at_ms)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (object_key) DO UPDATE
          SET mime_type = EXCLUDED.mime_type,
              data = EXCLUDED.data,
              updated_at_ms = EXCLUDED.updated_at_ms
        `,
        [key, mimeType, data, Date.now()]
      );
    },

    async getObject(key) {
      const res = await pool.query<{ data: Buffer; mime_type: string }>(
        "SELECT data, mime_type FROM media_objects WHERE object_key = $1",
        [key]
      );
      if (res.rowCount !== 1) return null;
      const row = res.rows[0];
      return { data: row.data, mimeType: row.mime_type || "application/octet-stream" };
    }
  };
}
