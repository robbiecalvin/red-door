import fs from "node:fs";
import path from "node:path";

import type { ObjectStorage } from "../mediaService";

type StoredObject = Readonly<{
  data: Buffer;
  mimeType: string;
}>;

export type LocalObjectStorage = ObjectStorage & Readonly<{
  putObject(key: string, data: Buffer, mimeType: string): void;
  getObject(key: string): StoredObject | null;
}>;

function encodeKey(key: string): string {
  return encodeURIComponent(key);
}

function decodeKey(encoded: string): string {
  return decodeURIComponent(encoded);
}

export function createLocalObjectStorage(): LocalObjectStorage {
  const byKey = new Map<string, StoredObject>();
  const baseDir = path.resolve(process.cwd(), "backend/.data/local-objects");

  function filePathForKey(key: string): string {
    return path.join(baseDir, `${encodeKey(key)}.bin`);
  }

  function mimePathForKey(key: string): string {
    return path.join(baseDir, `${encodeKey(key)}.mime`);
  }

  function ensureLoaded(key: string): StoredObject | null {
    const cached = byKey.get(key);
    if (cached) return cached;
    const filePath = filePathForKey(key);
    const mimePath = mimePathForKey(key);
    if (!fs.existsSync(filePath) || !fs.existsSync(mimePath)) return null;
    const data = fs.readFileSync(filePath);
    const mimeType = fs.readFileSync(mimePath, "utf8").trim() || "application/octet-stream";
    const stored: StoredObject = { data, mimeType };
    byKey.set(key, stored);
    return stored;
  }

  function loadAll(): void {
    if (!fs.existsSync(baseDir)) return;
    const entries = fs.readdirSync(baseDir);
    for (const entry of entries) {
      if (!entry.endsWith(".bin")) continue;
      const encoded = entry.slice(0, -4);
      const key = decodeKey(encoded);
      void ensureLoaded(key);
    }
  }

  loadAll();

  return {
    async presignPutObject(params) {
      const mime = encodeURIComponent(params.mimeType);
      return `/api/storage/local/upload/${encodeKey(params.key)}?mimeType=${mime}`;
    },

    async presignGetObject(params) {
      return `/api/storage/local/download/${encodeKey(params.key)}`;
    },

    async headObject(params) {
      const existing = ensureLoaded(params.key);
      if (!existing) return { ok: false as const, error: "Object not found." };
      return { ok: true as const, sizeBytes: existing.data.byteLength };
    },

    putObject(key, data, mimeType) {
      const stored: StoredObject = { data, mimeType };
      byKey.set(key, stored);
      fs.mkdirSync(baseDir, { recursive: true });
      fs.writeFileSync(filePathForKey(key), data);
      fs.writeFileSync(mimePathForKey(key), mimeType, "utf8");
    },

    getObject(key) {
      return ensureLoaded(key);
    }
  };
}
