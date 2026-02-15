import fs from "node:fs";
import path from "node:path";

import type { MediaRecord, MediaRepository } from "../services/mediaService";

type MediaRepoOptions = Readonly<{
  storeFilePath?: string;
}>;

const DEFAULT_MEDIA_STORE_FILE_PATH = path.resolve(process.cwd(), "backend/.data/media.json");

function isMediaRecordLike(value: unknown): value is MediaRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.mediaId === "string" &&
    typeof v.userId === "string" &&
    typeof v.kind === "string" &&
    typeof v.mimeType === "string" &&
    typeof v.sizeBytes === "number" &&
    typeof v.objectKey === "string" &&
    typeof v.createdAtMs === "number"
  );
}

export function createInMemoryMediaRepository(options: MediaRepoOptions = {}): MediaRepository {
  const storeFilePath = options.storeFilePath ?? DEFAULT_MEDIA_STORE_FILE_PATH;
  const byId = new Map<string, MediaRecord>();

  function load(): void {
    if (!fs.existsSync(storeFilePath)) return;
    const raw = fs.readFileSync(storeFilePath, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as { version?: unknown; media?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.media)) {
      throw new Error("Invalid media store format.");
    }
    for (const candidate of parsed.media) {
      if (!isMediaRecordLike(candidate)) continue;
      byId.set(candidate.mediaId, candidate);
    }
  }

  function persist(): void {
    const dir = path.dirname(storeFilePath);
    fs.mkdirSync(dir, { recursive: true });
    const payload = { version: 1, media: Array.from(byId.values()) };
    fs.writeFileSync(storeFilePath, JSON.stringify(payload), "utf8");
  }

  load();

  return {
    async createInitiated(record: MediaRecord): Promise<void> {
      byId.set(record.mediaId, record);
      persist();
    },
    async getById(mediaId: string): Promise<MediaRecord | null> {
      return byId.get(mediaId) ?? null;
    },
    async markUploaded(mediaId: string, uploadedAtMs: number, sha256?: string): Promise<void> {
      const existing = byId.get(mediaId);
      if (!existing) return;
      byId.set(mediaId, { ...existing, uploadedAtMs, sha256 });
      persist();
    }
  };
}
