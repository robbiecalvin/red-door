import { childSafetyPriority } from "../../../shared/childSafety";
import { isMediaDue, type RetainedMedia } from "../services/mediaRetention";
import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { CommunityRepository } from "../repositories/communityRepository";
import type { Session } from "../services/authService";

const destinations = ["profile-photo", "profile-gallery", "profile-video", "private-album",
  "group-photo", "chat-photo", "chat-video", "chat-audio"] as const;
type Destination = typeof destinations[number];
type Submission = RetainedMedia & {
  id: string;
  ownerId: string;
  destination: Destination;
  mimeType: string;
  reason?: string;
  childSafetyRestricted?: boolean;
  retentionAudit?: Array<{ action: "hold" | "release"; reviewerId: string; at: number; reason: string }>;
  decisions?: Array<{ status: "approved" | "rejected" | "removed"; reviewerId: string; at: number; reason: string }>;
};
const settingsKey = "mediaReviews";
const maxBytes = 20 * 1024 * 1024;
const run = promisify(execFile);
const tempPrefix = "badehaus-review-";

async function cleanupInterruptedTranscodes() {
  const directory = tmpdir();
  const cutoff = Date.now() - 86_400_000;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const pid = /^badehaus-review-(\d+)-[a-zA-Z0-9]{6}$/.exec(entry.name)?.[1];
    if (!pid || !entry.isDirectory()) continue;
    try { process.kill(Number(pid), 0); continue; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") continue; }
    const path = join(directory, entry.name);
    try {
      if ((await stat(path)).mtimeMs < cutoff) await rm(path, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function normalizeMedia(body: Buffer, destination: Destination) {
  const video = destination.endsWith("-video");
  const audio = destination === "chat-audio";
  const formats = audio ? "mov,mp3,ogg,matroska,webm,wav" : video ? "mov,matroska,webm" : "jpeg_pipe,png_pipe,webp_pipe";
  const directory = await mkdtemp(join(tmpdir(), `${tempPrefix}${process.pid}-`));
  try {
    const input = join(directory, "upload");
    const output = join(directory, audio ? "review.m4a" : video ? "review.mp4" : "review.jpg");
    await writeFile(input, body, { mode: 0o600 });
    const { stdout } = await run("ffprobe", ["-v", "error", "-protocol_whitelist", "file",
      "-format_whitelist", formats, "-show_entries", "format=format_name,duration:stream=codec_type,width,height",
      "-of", "json", input], { timeout: 5000, maxBuffer: 65536 });
    const { streams, format } = JSON.parse(stdout);
    const containers = String(format?.format_name ?? "").split(",");
    const allowed = audio ? ["mov", "mp3", "ogg", "webm", "wav"] :
      video ? ["mov", "webm"] : ["jpeg_pipe", "png_pipe", "webp_pipe"];
    if (!containers.some(container => allowed.includes(container))) throw new Error("Unsupported format");
    if (!Array.isArray(streams) || !streams.some(stream => stream.codec_type === (audio ? "audio" : "video")) ||
      streams.some(stream => stream.width > 4096 || stream.height > 4096) ||
      ((audio || video) && !(Number(format.duration) > 0 && Number(format.duration) <= 60))) {
      throw new Error("Unsupported media");
    }
    const encoding = audio ? ["-vn", "-c:a", "aac", "-b:a", "128k"] :
      video ? ["-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"] :
        ["-map", "0:v:0", "-frames:v", "1", "-c:v", "mjpeg"];
    await run("ffmpeg", ["-nostdin", "-v", "error", "-xerror", "-protocol_whitelist", "file",
      "-format_whitelist", formats, "-threads", "1", "-i", input, "-map_metadata", "-1", "-map_chapters", "-1",
      "-threads", "1", ...encoding, "-fs", String(maxBytes), output], { timeout: 30000, maxBuffer: 65536 });
    const size = (await stat(output)).size;
    if (!size || size >= maxBytes) throw new Error("Output exceeds limit");
    return { bytes: await readFile(output), mimeType: audio ? "audio/mp4" : video ? "video/mp4" : "image/jpeg" };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function installMediaReviewRoutes(app: Express, deps: {
  repository: CommunityRepository;
  member(req: Request, res: Response): Session | null;
  admin(req: Request, res: Response): Session | null;
  childSafetyReviewer(session: Session): boolean;
  reportSession(req: Request, res: Response): Session | null;
  report(session: Session, mediaId: string, ownerId: string, reason: string): Promise<string>;
  reportedMedia(reportId: string): { mediaId: string; childSafety: boolean } | undefined;
  profileVisible(ownerId: string): Promise<boolean>;
  publicUrl(req: Request, path: string): string;
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
  referencedMediaIds(): ReadonlySet<string>;
  profileOwnerExists(ownerId: string): boolean;
  reportedMediaTimes(): ReadonlyMap<string, number>;
  retentionEnabled: boolean;
}) {
  const inFlight = new Set<string>();
  const keyFor = (id: string) => `private-profiles/review/${id}`;
  const readRows = async () => (await deps.repository.readSetting<Record<string, Submission>>(settingsKey)) ?? {};
  const wrap = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    void handler(req, res).catch(() => {
      if (!res.headersSent) res.status(503).json({ message: "Media review is temporarily unavailable." });
    });
  };

  function profileMedia(rows: Submission[]) {
    const approved = rows.flatMap(row => {
      const at = row.decisions?.find(decision => decision.status === "approved")?.at;
      return at === undefined ? [] : [{ row, at }];
    }).sort((a, b) => b.at - a.at || b.row.submittedAt - a.row.submittedAt || b.row.id.localeCompare(a.row.id));
    const current = (destination: Destination) => {
      const row = approved.find(entry => entry.row.destination === destination)?.row;
      return row?.status === "approved" && !row.childSafetyRestricted ? row.id : undefined;
    };
    return {
      mainPhotoMediaId: current("profile-photo"),
      videoMediaId: current("profile-video"),
      galleryMediaIds: approved.filter(({ row }) => row.destination === "profile-gallery" && row.status === "approved" && !row.childSafetyRestricted)
        .slice(0, 12).map(({ row }) => row.id)
    };
  }

  async function profileMediaByOwner() {
    const byOwner = new Map<string, Submission[]>();
    for (const row of Object.values(await readRows())) {
      const entries = byOwner.get(row.ownerId) ?? [];
      entries.push(row);
      byOwner.set(row.ownerId, entries);
    }
    return new Map(Array.from(byOwner, ([owner, rows]) => [owner, profileMedia(rows)]));
  }

  async function publishedProfileMedia(id: string) {
    const rows = await readRows();
    const row = Object.prototype.hasOwnProperty.call(rows, id) ? rows[id] : undefined;
    if (!row || row.status !== "approved" || row.childSafetyRestricted) return null;
    const media = profileMedia(Object.values(rows).filter(entry => entry.ownerId === row.ownerId));
    if (media.mainPhotoMediaId !== id && media.videoMediaId !== id && !media.galleryMediaIds.includes(id)) return null;
    return await deps.profileVisible(row.ownerId) ? row : null;
  }

  app.get("/media/public/:id/url", wrap(async (req, res) => {
    const id = String(req.params.id);
    if (!await publishedProfileMedia(id)) return res.status(404).json({ message: "Media is unavailable." });
    return res.json({ downloadUrl: deps.publicUrl(req, `/media-review/published/${id}`) });
  }));

  app.get("/media-review/published/:id", wrap(async (req, res) => {
    const id = String(req.params.id);
    const row = await publishedProfileMedia(id);
    if (!row || row.purgeStartedAt !== undefined) return res.status(404).end();
    const bytes = await deps.read(keyFor(id));
    if (!bytes || !await publishedProfileMedia(id)) return res.status(404).end();
    return res.set("X-Content-Type-Options", "nosniff").type(row.mimeType).send(bytes);
  }));

  app.post("/media-review/published/:id/report", wrap(async (req, res) => {
    const session = deps.reportSession(req, res);
    if (!session) return;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason || reason.length > 500) return res.status(400).json({ message: "Enter a report reason of up to 500 characters." });
    const row = await publishedProfileMedia(String(req.params.id));
    if (!row) return res.status(404).json({ message: "Media is unavailable." });
    if (row.ownerId === session.userId) return res.status(400).json({ message: "Choose media from another profile." });
    if (!await retainReportedMedia(row.id, childSafetyPriority(reason) === "exploitation")) return res.status(404).json({ message: "Media is unavailable." });
    const reportId = await deps.report(session, row.id, row.ownerId, reason);
    return res.json({ reportId });
  }));

  app.get("/admin/safety-reports/:reportId/media", wrap(async (req, res) => {
    const admin = deps.admin(req, res);
    if (!admin) return;
    const evidence = deps.reportedMedia(String(req.params.reportId));
    if (!evidence) return res.status(404).end();
    const rows = await readRows();
    const row = rows[evidence.mediaId];
    if (!row || row.purgeStartedAt !== undefined) return res.status(404).end();
    if ((evidence.childSafety || row.childSafetyRestricted) && !deps.childSafetyReviewer(admin)) return res.status(403).end();
    const bytes = await deps.read(keyFor(row.id));
    if (!bytes) return res.status(404).end();
    return res.set("X-Content-Type-Options", "nosniff").type(row.mimeType).send(bytes);
  }));

  app.get("/media-review", wrap(async (req, res) => {
    const account = deps.member(req, res);
    if (!account) return;
    const rows = Object.values(await readRows());
    res.json({ submissions: rows.filter(row => row.ownerId === account.userId)
      .filter(row => row.status !== "uploading")
      .map(({ decisions, retentionAudit, hold, holdReleasedAt, purgeStartedAt, ...submission }) => submission).reverse().slice(0, 100) });
  }));

  app.post("/media-review/:destination", (req, res, next) => {
    const account = deps.member(req, res);
    if (!account) return;
    if (inFlight.size >= 2 || inFlight.has(account.userId!)) {
      res.status(429).json({ message: "Please wait for the current media upload to finish." });
      return;
    }
    inFlight.add(account.userId!);
    res.locals.reviewAccount = account;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inFlight.delete(account.userId!);
    };
    res.locals.releaseReviewUpload = release;
    res.once("finish", release);
    res.once("close", () => { if (!res.locals.reviewProcessing) release(); });
    next();
  }, express.raw({ type: "application/octet-stream", limit: maxBytes }), wrap(async (req, res) => {
    const account = res.locals.reviewAccount as Session;
    res.locals.reviewProcessing = true;
    try {
      const destination = req.params.destination as Destination;
      if (!destinations.includes(destination) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ message: "Choose a supported media destination and file." });
      }
      const rows = Object.values(await readRows());
      if (rows.filter(row => row.ownerId === account.userId && row.status === "pending").length >= 5) {
        return res.status(429).json({ message: "Wait for your pending submissions to be reviewed." });
      }
      let normalized: Awaited<ReturnType<typeof normalizeMedia>>;
      try {
        normalized = await normalizeMedia(req.body, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw error;
        return res.status(422).json({ message: "Use a supported image or an audio or video clip up to 60 seconds." });
      }
      const id = randomUUID();
      const submission: Submission = { id, ownerId: account.userId!, destination, mimeType: normalized.mimeType,
        status: "pending", submittedAt: Date.now() };
      await deps.repository.update(state => {
        const entries = (state.settings[settingsKey] ??= {}) as Record<string, Submission>;
        if (Object.values(entries).filter(row => row.ownerId === account.userId && ["uploading", "pending"].includes(row.status)).length >= 5) {
          throw new Error("Pending submission limit reached");
        }
        entries[id] = { ...submission, status: "uploading" };
      });
      await deps.put(keyFor(id), normalized.bytes, normalized.mimeType);
      const committed = await deps.repository.update(state => {
        const rows = state.settings[settingsKey] as Record<string, Submission>;
        if (rows[id]?.status !== "uploading") return false;
        rows[id] = submission;
        return true;
      });
      if (!committed) {
        await deps.remove(keyFor(id));
        return res.status(409).json({ message: "This upload is no longer available." });
      }
      res.status(201).json({ submission });
    } finally {
      res.locals.releaseReviewUpload();
    }
  }));

  app.post("/media-review/:id/withdraw", wrap(async (req, res) => {
    const owner = deps.member(req, res);
    if (!owner?.userId) return;
    const withdrawn = await deps.repository.update(state => {
      const rows = state.settings[settingsKey] as Record<string, Submission> | undefined;
      const id = String(req.params.id);
      const row = rows && Object.prototype.hasOwnProperty.call(rows, id) ? rows[id] : undefined;
      if (!row || row.ownerId !== owner.userId || (row.status !== "pending" && row.status !== "approved")) return false;
      row.status = "removed";
      row.reason = "Withdrawn by uploader";
      row.decidedAt = Date.now();
      return true;
    });
    return withdrawn ? res.json({ ok: true }) : res.status(404).json({ message: "This submission is unavailable." });
  }));

  app.get("/admin/media-review", wrap(async (req, res) => {
    if (!deps.admin(req, res)) return;
    const status = req.query.status === "approved" ? "approved" : "pending";
    const submissions = Object.values(await readRows()).filter(row => row.status === status && !row.childSafetyRestricted)
      .sort((a, b) => status === "pending" ? a.submittedAt - b.submittedAt : b.submittedAt - a.submittedAt);
    res.json({ submissions: submissions.slice(0, 100) });
  }));

  app.get("/admin/media-review/:id/content", wrap(async (req, res) => {
    if (!deps.admin(req, res)) return;
    const row = Object.values(await readRows()).find(entry => entry.id === req.params.id);
    if (!row || row.childSafetyRestricted || !["pending", "approved"].includes(row.status)) return res.status(404).end();
    const bytes = await deps.read(keyFor(row.id));
    if (!bytes) return res.status(404).end();
    return res.set("X-Content-Type-Options", "nosniff").type(row.mimeType).send(bytes);
  }));

  app.post("/admin/media-review/:id/decision", wrap(async (req, res) => {
    const admin = deps.admin(req, res);
    if (!admin) return;
    const { action } = req.body ?? {};
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!["approved", "rejected", "removed"].includes(action) || reason.length > 500 ||
      (action !== "approved" && !reason)) {
      return res.status(400).json({ message: "Choose a valid decision and give a reason for rejection or removal." });
    }
    const submission = await deps.repository.update(state => {
      const rows = state.settings[settingsKey] as Record<string, Submission> | undefined;
      const row = Object.values(rows ?? {}).find(entry => entry.id === req.params.id);
      if (!row || (row.childSafetyRestricted && !deps.childSafetyReviewer(admin)) || row.purgeStartedAt !== undefined || row.status !== (action === "removed" ? "approved" : "pending")) return null;
      const decidedAt = Date.now();
      const decided: Submission = { ...row, status: action, reason, decidedAt,
        decisions: [...(row.decisions ?? []), { status: action, reviewerId: admin.userId!, at: decidedAt, reason }] };
      rows![row.id] = decided;
      return decided;
    });
    if (!submission) return res.status(409).json({ message: "This submission has already changed." });
    // Delivery checks the current decision before serving each file.
    res.json({ submission });
  }));
  async function approvedPhotoOwner(id: string, destination: "group-photo" | "private-album" | "chat-photo") {
    const rows = await readRows();
    const row = Object.prototype.hasOwnProperty.call(rows, id) ? rows[id] : undefined;
    return row?.destination === destination && row.status === "approved" && !row.childSafetyRestricted ? row.ownerId : undefined;
  }

  async function approvedPhotos(destination: "group-photo" | "private-album" | "chat-photo") {
    return new Map(Object.values(await readRows())
      .filter(row => row.destination === destination && row.status === "approved" && !row.childSafetyRestricted)
      .map(row => [row.id, row.ownerId]));
  }

  async function readApprovedPhoto(id: string, ownerId: string, destination: "group-photo" | "private-album" | "chat-photo") {
    if (await approvedPhotoOwner(id, destination) !== ownerId) return null;
    const bytes = await deps.read(keyFor(id));
    if (!bytes || await approvedPhotoOwner(id, destination) !== ownerId) return null;
    return bytes;
  }

  function readGroupPhoto(id: string, ownerId: string) {
    return readApprovedPhoto(id, ownerId, "group-photo");
  }

  app.get("/media-review/group-photos/:id/preview", wrap(async (req, res) => {
    const owner = deps.member(req, res);
    if (!owner?.userId) return;
    const bytes = await readGroupPhoto(String(req.params.id), owner.userId);
    if (!bytes) return res.status(404).json({ message: "Group photo is unavailable." });
    return res.set("X-Content-Type-Options", "nosniff").type("image/jpeg").send(bytes);
  }));

  app.get("/media-review/photos/:id/preview", wrap(async (req, res) => {
    const owner = deps.member(req, res);
    if (!owner?.userId) return;
    const id = String(req.params.id);
    const rows = await readRows();
    const row = Object.prototype.hasOwnProperty.call(rows, id) ? rows[id] : undefined;
    if (row?.destination !== "private-album" && row?.destination !== "chat-photo") {
      return res.status(404).json({ message: "Photo is unavailable." });
    }
    const bytes = await readApprovedPhoto(id, owner.userId, row.destination);
    if (!bytes) return res.status(404).json({ message: "Photo is unavailable." });
    return res.set("X-Content-Type-Options", "nosniff").type("image/jpeg").send(bytes);
  }));

  async function touchPhoto(id: string, ownerId: string,
    destination: "group-photo" | "private-album" | "chat-photo"): Promise<boolean> {
    return deps.repository.update(state => {
      const rows = state.settings[settingsKey] as Record<string, Submission> | undefined;
      const row = rows && Object.prototype.hasOwnProperty.call(rows, id) ? rows[id] : undefined;
      if (row?.ownerId !== ownerId || row.destination !== destination || row.status !== "approved" || row.childSafetyRestricted || row.purgeStartedAt !== undefined) return false;
      row.lastUsedAt = Date.now();
      return true;
    });
  }

  async function retainReportedMedia(id: string, restrict = false) {
    return deps.repository.update(state => {
      const rows = state.settings[settingsKey] as Record<string, Submission> | undefined;
      const row = rows && Object.prototype.hasOwnProperty.call(rows, id) ? rows[id] : undefined;
      if (!row || row.purgeStartedAt !== undefined) return false;
      if (restrict) row.childSafetyRestricted = true;
      row.hold ??= { reason: restrict ? "Child safety report" : "Safety report", at: Date.now() };
      return true;
    });
  }

  app.post("/admin/media-review/:id/retention", wrap(async (req, res) => {
    const admin = deps.admin(req, res);
    if (!admin?.userId) return;
    const { action } = req.body ?? {};
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if ((action !== "hold" && action !== "release") || !reason || reason.length > 500) {
      return res.status(400).json({ message: "Choose hold or release and enter a reason." });
    }
    const updated = await deps.repository.update(state => {
      const rows = state.settings[settingsKey] as Record<string, Submission> | undefined;
      const id = String(req.params.id);
      const row = rows && Object.prototype.hasOwnProperty.call(rows, id) ? rows[id] : undefined;
      if (!row || row.purgeStartedAt !== undefined || (row.childSafetyRestricted && !deps.childSafetyReviewer(admin))) return false;
      const at = Date.now();
      if (action === "hold") row.hold = { reason, at, reviewerId: admin.userId };
      else {
        if (row.childSafetyRestricted && row.status === "approved") return false;
        delete row.hold; row.holdReleasedAt = at;
      }
      (row.retentionAudit ??= []).push({ action, reviewerId: admin.userId!, at, reason });
      return true;
    });
    return updated ? res.json({ ok: true }) : res.status(409).json({ message: "The file is already being deleted or is unavailable." });
  }));

  function liveReferences(rows: Submission[]) {
    const refs = new Set(deps.referencedMediaIds());
    const profiles = new Map<string, Submission[]>();
    for (const row of rows) {
      if (!row.destination.startsWith("profile-") || !deps.profileOwnerExists(row.ownerId)) continue;
      const owned = profiles.get(row.ownerId) ?? [];
      owned.push(row);
      profiles.set(row.ownerId, owned);
    }
    for (const owned of profiles.values()) {
      const { mainPhotoMediaId, videoMediaId, galleryMediaIds } = profileMedia(owned);
      for (const id of [mainPhotoMediaId, videoMediaId, ...galleryMediaIds]) if (id) refs.add(id);
    }
    return refs;
  }

  let running: Promise<{ eligible: number; deleted: number; failed: number }> | undefined;
  async function sweep(dryRun: boolean) {
    const rows = Object.values(await readRows());
    const refs = liveReferences(rows);
    const reports = deps.reportedMediaTimes();
    const now = Date.now();
    const eligible = rows.filter(row => isMediaDue(row, now, refs.has(row.id), reports.get(row.id)));
    let deleted = 0, failed = 0;
    if (dryRun) return { eligible: eligible.length, deleted, failed };
    for (const item of eligible.slice(0, 100)) {
      try {
        const claimed = await deps.repository.update(state => {
          const entries = state.settings[settingsKey] as Record<string, Submission> | undefined;
          const row = entries?.[item.id];
          if (!row || !isMediaDue(row, now, liveReferences(Object.values(entries ?? {})).has(row.id),
              deps.reportedMediaTimes().get(row.id))) return false;
          row.purgeStartedAt ??= now;
          if (["approved", "pending", "uploading"].includes(row.status)) row.status = "expired";
          return true;
        });
        if (!claimed) continue;
        await deps.remove(keyFor(item.id));
        await deps.repository.update(state => {
          const entries = state.settings[settingsKey] as Record<string, Submission>;
          entries[item.id].purgedAt = Date.now();
        });
        deleted++;
      } catch {
        failed++;
      }
    }
    return { eligible: eligible.length, deleted, failed };
  }

  function runSweep(dryRun: boolean) {
    if (dryRun) return sweep(true);
    running ??= sweep(false).finally(() => { running = undefined; });
    return running;
  }

  app.get("/admin/media-review/retention", wrap(async (req, res) => {
    if (!deps.admin(req, res)) return;
    return res.json({ enabled: deps.retentionEnabled, ...await runSweep(true) });
  }));

  app.post("/admin/media-review/retention", wrap(async (req, res) => {
    if (!deps.admin(req, res)) return;
    if (!deps.retentionEnabled) return res.status(409).json({ message: "Media deletion is disabled on this backend." });
    return res.json(await runSweep(false));
  }));

  const timer = deps.retentionEnabled ? setInterval(() => {
    void cleanupInterruptedTranscodes().catch(() => console.error("[Badehaus X] Media temporary file cleanup failed."));
    void runSweep(false).then(result => {
      if (result.failed) console.error("[Badehaus X] Media retention deletions will be retried.");
    }).catch(() => console.error("[Badehaus X] Media retention sweep failed."));
  }, 60 * 60 * 1000).unref() : undefined;

  async function eraseOwner(ownerId: string) {
    const reports = deps.reportedMediaTimes();
    const ids = await deps.repository.update(state => {
      const rows = (state.settings[settingsKey] ?? {}) as Record<string, Submission>;
      const deletable: string[] = [];
      for (const row of Object.values(rows)) {
        if (row.ownerId !== ownerId || row.purgedAt !== undefined) continue;
        if (!row.purgeStartedAt) {
          row.status = "removed";
          row.reason = "Account deleted";
          row.decidedAt = Date.now();
        }
        if (row.hold || (reports.get(row.id) ?? -1) > (row.holdReleasedAt ?? -1)) continue;
        row.purgeStartedAt ??= Date.now();
        deletable.push(row.id);
      }
      return deletable;
    });
    for (const id of ids) {
      await deps.remove(keyFor(id));
      await deps.repository.update(state => {
        const rows = state.settings[settingsKey] as Record<string, Submission>;
        rows[id].purgedAt = Date.now();
      });
    }
  }

  return { profileMediaByOwner, approvedPhotos, approvedPhotoOwner, readApprovedPhoto, readGroupPhoto,
    touchPhoto, retainReportedMedia, eraseOwner, async stopRetention() { if (timer) clearInterval(timer); await running; } };
}
