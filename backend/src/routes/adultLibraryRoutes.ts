import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { isAdultVideoCategory, type AdultVideo, type AdultVideoFavorite } from "../../../shared/adultLibrary";
import type { CommunityRepository } from "../repositories/communityRepository";
import type { Session, StoredUser } from "../services/authService";

const libraryKey = "adultVideoLibrary";

type BulkVideo = { watchUrl: string; thumbnailUrl: string };
type BulkPage = { name: string; slug: string; page: number; pages: number; videos: BulkVideo[] };
type ReadBulk = (category: string, page: number) => Promise<BulkPage | null | undefined>;
const categoryPattern = "[a-z0-9][a-z0-9-]{0,90}-[a-f0-9]{10}";
const bulkIdPattern = new RegExp(`^bulk:(${categoryPattern}):([1-9][0-9]{0,5}):(\\d{1,2}):[a-f0-9]{24}$`);

function catalogId(page: BulkPage, index: number) {
  const fingerprint = createHash("sha256").update(page.videos[index].watchUrl).digest("hex").slice(0, 24);
  return `bulk:${page.slug}:${page.page}:${index}:${fingerprint}`;
}

async function readCatalogPage(category: string, page: number, reader?: ReadBulk): Promise<BulkPage | null | undefined> {
  const directory = process.env.ADULT_CATALOG_DIR;
  if (!directory) return reader?.(category, page);
  try {
    const manifest: { name: string; slug: string; pages: number }[] =
      JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
    const entry = manifest.find(item => item.slug === category);
    if (!entry || page > entry.pages) return null;
    const videos = JSON.parse(await readFile(path.join(directory, category, `${page}.json`), "utf8"));
    return { ...entry, page, videos };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function adultProfileFavorites(repository: CommunityRepository, ids: readonly string[] = [], reader?: ReadBulk): Promise<AdultVideoFavorite[]> {
  if (!ids.length) return [];
  const videos = await repository.readSetting<AdultVideo[]>(libraryKey) ?? [];
  const resolved = await Promise.all(ids.map(async id => {
    const match = bulkIdPattern.exec(id);
    if (match) {
      const page = await readCatalogPage(match[1], Number(match[2]), reader);
      const index = Number(match[3]);
      const video = page?.videos[index];
      if (!page || !video || catalogId(page, index) !== id) return null;
      return { id, title: `${page.name} · Video ${(page.page - 1) * 20 + index + 1}`, creator: new URL(video.watchUrl).hostname, watchUrl: video.watchUrl };
    }
    const video = videos.find(entry => entry.id === id);
    return video ? { id, title: video.title, creator: video.creator, watchUrl: video.watchUrl } : null;
  }));
  return resolved.filter((video): video is AdultVideoFavorite => video !== null);
}

class FavoritesLimit extends Error {}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Invalid URLs are rejected by the caller. */ }
}

export function installAdultLibraryRoutes(app: Express, deps: {
  repository: CommunityRepository;
  bulkCatalogPage?: ReadBulk;
  member(req: Request, res: Response): { user: StoredUser; session: Session } | null;
  saveFavorites(userId: string, ids: string[]): Promise<void>;
  changeFavorite?(userId: string, update: (ids: string[]) => string[]): Promise<string[]>;
}) {
  function admin(req: Request, res: Response): boolean {
    const actor = deps.member(req, res);
    if (!actor) return false;
    if (actor.session.role === "admin") return true;
    res.status(403).json({ message: "Admin access required." });
    return false;
  }

  function route(handler: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response) => {
      res.setHeader("Cache-Control", "private, no-store");
      void handler(req, res).catch(error => {
        if (error instanceof FavoritesLimit) { res.status(409).json({ message: "Remove one of your three saved videos before saving another." }); return; }
        if (!res.headersSent) res.status(503).json({ message: "The adult video directory is temporarily unavailable." });
      });
    };
  }

  app.get("/adult-library", route(async (req, res) => {
    const actor = deps.member(req, res);
    if (!actor) return;
    const videos = await deps.repository.readSetting<AdultVideo[]>(libraryKey) ?? [];
    const savedVideos = await adultProfileFavorites(deps.repository, actor.user.plusData?.adultVideoFavorites, deps.bulkCatalogPage);
    return res.json({ videos, favorites: savedVideos.map(video => video.id), savedVideos });
  }));

  app.get("/adult-library/previews", route(async (req, res) => {
    if (!deps.member(req, res)) return;
    const videos = await deps.repository.readSetting<AdultVideo[]>(libraryKey) ?? [];
    if (videos.length <= 3) return res.json({ videos });
    const day = new Date().toISOString().slice(0, 10);
    const offset = createHash("sha256").update(day).digest().readUInt32BE() % videos.length;
    return res.json({ videos: Array.from({ length: 3 }, (_, index) => videos[(offset + index) % videos.length]) });
  }));

  app.get("/adult-library/catalog", route(async (req, res) => {
    const actor = deps.member(req, res);
    if (!actor) return;
    const { category, page } = req.query;
    if (typeof category !== "string" || !new RegExp(`^${categoryPattern}$`).test(category) ||
        typeof page !== "string" || !/^[1-9][0-9]{0,5}$/.test(page)) {
      return res.status(400).json({ message: "Choose a catalog category and page." });
    }
    const result = await readCatalogPage(category, Number(page), deps.bulkCatalogPage);
    if (!result) return res.status(404).json({ message: "Catalog page not found." });
    return res.json({ ...result, favorites: actor.user.plusData?.adultVideoFavorites ?? [],
      videos: result.videos.map((video, index) => ({ ...video, id: catalogId(result, index) })) });
  }));

  app.put("/adult-library/favorite", route(async (req, res) => {
    const actor = deps.member(req, res);
    if (!actor) return;
    const { id, saved } = req.body ?? {};
    if (typeof id !== "string" || id.length > 160 || typeof saved !== "boolean" || !deps.changeFavorite) {
      return res.status(400).json({ message: "Choose a video and save or remove it." });
    }
    const previous = actor.user.plusData?.adultVideoFavorites ?? [];
    const candidates = [...new Set(saved ? [...previous, id] : previous)];
    const available = await adultProfileFavorites(deps.repository, candidates, deps.bulkCatalogPage);
    if (saved && !available.some(video => video.id === id)) return res.status(404).json({ message: "Video not found." });
    const invalid = new Set(previous.filter(item => !available.some(video => video.id === item)));
    const favorites = await deps.changeFavorite(actor.user.id, current => {
      const next = current.filter(item => !invalid.has(item) && item !== id);
      if (saved) {
        if (next.length >= 3) throw new FavoritesLimit();
        const existing = current.indexOf(id);
        next.splice(existing === -1 ? next.length : existing, 0, id);
      }
      return next;
    });
    const savedVideos = await adultProfileFavorites(deps.repository, favorites, deps.bulkCatalogPage);
    return res.json({ favorites, savedVideos });
  }));

  app.put("/adult-library/favorites", route(async (req, res) => {
    const actor = deps.member(req, res);
    if (!actor) return;
    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length ||
        !ids.every(id => typeof id === "string" && id.length <= 160) ||
        (await adultProfileFavorites(deps.repository, ids, deps.bulkCatalogPage)).length !== ids.length) {
      return res.status(400).json({ message: "Choose up to three different videos from the directory." });
    }
    await deps.saveFavorites(actor.user.id, ids);
    return res.json({ favorites: ids });
  }));

  app.put("/admin/adult-library", route(async (req, res) => {
    if (!admin(req, res)) return;
    const { id, title, creator, category, watchUrl, thumbnailUrl } = req.body ?? {};
    const watch = httpsUrl(watchUrl);
    const thumbnail = httpsUrl(thumbnailUrl);
    if ((id !== undefined && typeof id !== "string") ||
        typeof title !== "string" || !title.trim() || title.length > 140 ||
        typeof creator !== "string" || !creator.trim() || creator.length > 100 ||
        !isAdultVideoCategory(category) || !watch || !thumbnail) {
      return res.status(400).json({ message: "Enter a title, creator, category, and two valid HTTPS links." });
    }
    const video: AdultVideo = { id: id ?? randomUUID(), title: title.trim(), creator: creator.trim(), category, watchUrl: watch, thumbnailUrl: thumbnail };
    const saved = await deps.repository.update(state => {
      const previous = (state.settings[libraryKey] as AdultVideo[] | undefined) ?? [];
      if (id !== undefined && !previous.some(entry => entry.id === id)) return false;
      state.settings[libraryKey] = id === undefined ? [...previous, video] : previous.map(entry => entry.id === id ? video : entry);
      return true;
    });
    return saved ? res.json({ video }) : res.status(404).json({ message: "Video could not be found." });
  }));

  app.delete("/admin/adult-library/:id", route(async (req, res) => {
    if (!admin(req, res)) return;
    await deps.repository.update(state => {
      const videos = (state.settings[libraryKey] as AdultVideo[] | undefined) ?? [];
      state.settings[libraryKey] = videos.filter(video => video.id !== req.params.id);
    });
    return res.json({ ok: true });
  }));
}
