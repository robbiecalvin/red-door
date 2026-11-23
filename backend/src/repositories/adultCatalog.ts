import { createHash, timingSafeEqual } from "node:crypto";
import express, { type Express } from "express";
import type { Pool } from "pg";
import manifest from "../../../shared/adult-catalog-manifest.json";

const entries = new Map(manifest.map(entry => [entry.slug, entry]));
const total = manifest.reduce((sum, entry) => sum + entry.pages, 0);
type Video = { watchUrl: string; thumbnailUrl: string };
type Page = { category: string; page: number; videos: Video[] };

function isHttps(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 8192) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validPage(page: Page | null): page is Page {
  if (!page || !Number.isInteger(page.page) || page.page < 1 || !Array.isArray(page.videos)) return false;
  const entry = entries.get(page.category);
  return Boolean(entry && page.page <= entry.pages &&
    page.videos.length === Math.min(20, entry.count - (page.page - 1) * 20) &&
    page.videos.every(video => video && isHttps(video.watchUrl) && (video.thumbnailUrl === "" || isHttps(video.thumbnailUrl))));
}

export async function configureAdultCatalog(app: Express, pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS public_adult_catalog_pages (
    category text NOT NULL, page integer NOT NULL, videos jsonb NOT NULL, PRIMARY KEY(category, page)
  )`);
  const importHash = process.env.ADULT_CATALOG_IMPORT_SHA256;
  if (importHash && /^[0-9a-f]{64}$/.test(importHash)) {
    app.post("/internal/adult-catalog/import", (req, res, next) => {
      const digest = createHash("sha256").update(req.get("x-catalog-import-key") ?? "").digest();
      if (!timingSafeEqual(digest, Buffer.from(importHash, "hex"))) {
        return res.status(404).end();
      }
      res.setHeader("Cache-Control", "no-store");
      next();
    }, express.json({ limit: "2mb" }), async (req, res, next) => {
      try {
        if (!Array.isArray(req.body) || req.body.length > 100 || !req.body.every(validPage)) {
          return res.status(400).json({ message: "Invalid catalog batch." });
        }
        const keys = new Set(req.body.map((page: Page) => `${page.category}/${page.page}`));
        if (keys.size !== req.body.length) return res.status(400).json({ message: "Duplicate page in batch." });
        await pool.query(`INSERT INTO public_adult_catalog_pages (category, page, videos)
          SELECT category, page, videos FROM jsonb_to_recordset($1::jsonb) AS payload(category text, page int, videos jsonb)
          ON CONFLICT(category, page) DO UPDATE SET videos=EXCLUDED.videos`, [JSON.stringify(req.body)]);
        const { rows } = await pool.query("SELECT count(*)::int AS imported FROM public_adult_catalog_pages");
        return res.json({ imported: rows[0].imported, expected: total });
      } catch (error) { next(error); }
    });
  }

  return async (category: string, page: number) => {
    const entry = entries.get(category);
    if (!entry || page < 1 || page > entry.pages) return null;
    const { rows } = await pool.query<{ videos: Video[] }>(
      "SELECT videos FROM public_adult_catalog_pages WHERE category=$1 AND page=$2", [category, page]
    );
    return rows[0] ? { ...entry, page, videos: rows[0].videos } : null;
  };
}
