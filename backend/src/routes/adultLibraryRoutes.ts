import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { isAdultVideoCategory, type AdultVideo, type AdultVideoFavorite } from "../../../shared/adultLibrary";
import type { CommunityRepository } from "../repositories/communityRepository";
import type { Session, StoredUser } from "../services/authService";

const libraryKey = "adultVideoLibrary";

export async function adultProfileFavorites(repository: CommunityRepository, ids: readonly string[] = []): Promise<AdultVideoFavorite[]> {
  if (!ids.length) return [];
  const videos = await repository.readSetting<AdultVideo[]>(libraryKey) ?? [];
  return ids.flatMap(id => {
    const video = videos.find(entry => entry.id === id);
    return video ? [{ id, title: video.title, creator: video.creator, watchUrl: video.watchUrl }] : [];
  });
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Invalid URLs are rejected by the caller. */ }
}

export function installAdultLibraryRoutes(app: Express, deps: {
  repository: CommunityRepository;
  member(req: Request, res: Response): { user: StoredUser; session: Session } | null;
  saveFavorites(userId: string, ids: string[]): Promise<void>;
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
      void handler(req, res).catch(() => {
        if (!res.headersSent) res.status(503).json({ message: "The adult video directory is temporarily unavailable." });
      });
    };
  }

  app.get("/adult-library", route(async (req, res) => {
    const actor = deps.member(req, res);
    if (!actor) return;
    const videos = await deps.repository.readSetting<AdultVideo[]>(libraryKey) ?? [];
    const favorites = (actor.user.plusData?.adultVideoFavorites ?? []).filter(id => videos.some(video => video.id === id));
    return res.json({ videos, favorites });
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
    if (!deps.member(req, res)) return;
    const { category, page } = req.query;
    const directory = process.env.ADULT_CATALOG_DIR;
    if (!directory) return res.status(404).json({ message: "The bulk catalog is unavailable." });
    if (typeof category !== "string" || !/^[a-z0-9][a-z0-9-]{0,90}-[a-f0-9]{10}$/.test(category) ||
        typeof page !== "string" || !/^[1-9][0-9]{0,5}$/.test(page)) {
      return res.status(400).json({ message: "Choose a catalog category and page." });
    }
    try {
      const manifest: { name: string; slug: string; pages: number }[] =
        JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
      const entry = manifest.find(item => item.slug === category);
      if (!entry || Number(page) > entry.pages) return res.status(404).json({ message: "Catalog page not found." });
      const videos = JSON.parse(await readFile(path.join(directory, category, `${page}.json`), "utf8"));
      return res.json({ ...entry, page: Number(page), videos });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({ message: "Catalog page not found." });
      }
      throw error;
    }
  }));

  app.put("/adult-library/favorites", route(async (req, res) => {
    const actor = deps.member(req, res);
    if (!actor) return;
    const ids: unknown = req.body?.ids;
    const videos = await deps.repository.readSetting<AdultVideo[]>(libraryKey) ?? [];
    if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length ||
        !ids.every(id => typeof id === "string" && videos.some(video => video.id === id))) {
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
