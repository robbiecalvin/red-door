import { backroomLaunch } from "../../../shared/backroomLaunch";
import type { Express, Request, Response } from "express";
import type { Article } from "../../../shared/backroom";
import type { CommunityRepository } from "../repositories/communityRepository";
import type { Session, StoredUser } from "../services/authService";
import { MemberError, text } from "../services/memberService";

type Entry = Article & { authorId: string };
const key = "backroomArticles";
const publicFields = ({ authorId: _author, ...article }: Entry): Article => article;

export async function publishedArticles(repository: CommunityRepository) {
  return ((await repository.readSetting<Entry[]>(key)) ?? [])
    .filter(article => article.status === "published")
    .sort((a, b) => b.publishedAtMs! - a.publishedAtMs!)
    .map(publicFields);
}

export function installBackroomRoutes(app: Express, deps: {
  repository: CommunityRepository;
  member(req: Request, res: Response): { user: StoredUser; session: Session } | null;
  admin(req: Request, res: Response): Session | null;
}) {
  function route(handler: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response) => {
      res.set("Cache-Control", "no-store");
      void handler(req, res).catch(error => {
        if (!res.headersSent) res.status(error instanceof MemberError ? error.status : 503)
          .json({ message: error instanceof MemberError ? error.message : "The Backroom is unavailable." });
      });
    };
  }

  app.get("/backroom/articles", route(async (_req, res) => res.json(await publishedArticles(deps.repository))));
  app.get("/backroom/editor", route(async (req, res) => {
    const actor = deps.member(req, res);
    if (!actor) return;
    const admin = actor.session.role === "admin";
    if (!admin && actor.user.plusData?.priorityApprovedAtMs === undefined) throw new MemberError("FORBIDDEN", "Priority access is required.", 403);
    const entries = (await deps.repository.readSetting<Entry[]>(key)) ?? [];
    return res.json({ admin, articles: entries.filter(row => admin || row.authorId === actor.user.id).map(publicFields) });
  }));
  app.put("/backroom/editor/:slug", route(async (req, res) => {
    const actor = deps.member(req, res);
    if (!actor) return;
    const admin = actor.session.role === "admin";
    if (!admin && actor.user.plusData?.priorityApprovedAtMs === undefined) throw new MemberError("FORBIDDEN", "Priority access is required.", 403);
    const slug = req.params.slug;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) throw new MemberError("INVALID_INPUT", "Pick a URL slug using lowercase letters, digits and hyphens.");
    if (backroomLaunch.some(article => article.slug === slug)) throw new MemberError("CONFLICT", "This slug is already published.", 409);
    const action = req.body?.action;
    if (action !== "draft" && action !== "submit") throw new MemberError("INVALID_INPUT", "Choose whether to save or submit.");
    const status = action === "draft" ? "draft" : admin ? "published" : "pending";
    const entry: Entry = {
      slug, status, authorId: actor.user.id,
      title: text(req.body?.title, 120, "Title"), synopsis: text(req.body?.synopsis, 300, "Synopsis"),
      body: text(req.body?.body, 20000, "Article"),
      byline: typeof req.body?.byline === "string" && req.body.byline.trim() ? text(req.body.byline, 80, "Public byline") : "Badehaus X",
      publishedAtMs: status === "published" ? Date.now() : undefined
    };
    await deps.repository.update(state => {
      const rows = (state.settings[key] as Entry[] | undefined) ?? [];
      const index = rows.findIndex(row => row.slug === slug);
      const existing = rows[index];
      if (existing && (existing.authorId !== actor.user.id || existing.status === "published" || existing.status === "pending")) {
        throw new MemberError("CONFLICT", "This slug is in use or the article is under review.", 409);
      }
      if (index < 0) rows.push(entry);
      else rows[index] = entry;
      state.settings[key] = rows;
    });
    return res.json(publicFields(entry));
  }));
  app.post("/backroom/review/:slug", route(async (req, res) => {
    if (!deps.admin(req, res)) return;
    const action = req.body?.action;
    if (action !== "publish" && action !== "reject") throw new MemberError("INVALID_INPUT", "Choose publish or reject.");
    return res.json(await deps.repository.update(state => {
      const row = (state.settings[key] as Entry[] | undefined)?.find(article => article.slug === req.params.slug);
      if (row?.status !== "pending") throw new MemberError("INVALID_STATE", "This article is no longer pending.", 409);
      row.status = action === "publish" ? "published" : "rejected";
      if (action === "publish") row.publishedAtMs = Date.now();
      return publicFields(row);
    }));
  }));
}
