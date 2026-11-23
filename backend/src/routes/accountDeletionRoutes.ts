import { createHash, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { Session } from "../services/authService";
import type { CommunityRepository } from "../repositories/communityRepository";

type Job = { requestedAt: number; completedAt?: number };
type Challenge = { userId: string; expiresAt: number };
const jobsKey = "accountDeletionJobs";
const challengeKey = "accountDeletionChallenges";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function installAccountDeletionRoutes(app: Express, deps: {
  repository: CommunityRepository;
  admin(req: Request, res: Response): Session | null;
  lookup(email: string): { id: string; email: string } | undefined;
  send(email: string, code: string): Promise<void>;
  erase(userId: string): Promise<void>;
}) {
  const windows = new Map<string, { count: number; expiresAt: number }>();
  const active = new Map<string, Promise<void>>();
  let stopping = false;

  function erase(userId: string) {
    const current = active.get(userId);
    if (current) return current;
    const operation = Promise.resolve().then(async () => {
      await deps.erase(userId);
      await deps.repository.update(state => {
        const jobs = state.settings[jobsKey] as Record<string, Job>;
        jobs[userId].completedAt = Date.now();
      });
    }).finally(() => active.delete(userId));
    active.set(userId, operation);
    return operation;
  }

  async function retry() {
    if (stopping) return;
    const jobs = await deps.repository.readSetting<Record<string, Job>>(jobsKey) ?? {};
    for (const [id, job] of Object.entries(jobs)) {
      if (stopping) break;
      if (job.completedAt === undefined) await erase(id).catch(() => console.error("[Badehaus X] Account deletion will be retried."));
    }
  }
  const runRetry = () => {
    void retry().catch(() => console.error("[Badehaus X] Account deletion retry was unavailable."));
  };
  runRetry();
  const timer = setInterval(runRetry, 60_000).unref();

  const wrap = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    void handler(req, res).catch(() => {
      if (!res.headersSent) res.status(503).json({ message: "Account deletion is temporarily unavailable." });
    });
  };

  function limited(req: Request, action: string, max: number) {
    const now = Date.now();
    for (const [key, value] of windows) if (value.expiresAt <= now) windows.delete(key);
    const key = `${action}:${req.socket.remoteAddress ?? "unknown"}`;
    const window = windows.get(key) ?? { count: 0, expiresAt: now + 900_000 };
    if (window.count >= max) return true;
    window.count++;
    windows.set(key, window);
    return false;
  }

  app.get("/admin/account-deletion", wrap(async (req, res) => {
    if (!deps.admin(req, res)) return;
    const jobs = await deps.repository.readSetting<Record<string, Job>>(jobsKey) ?? {};
    return res.json({ pending: Object.entries(jobs).filter(([, job]) => job.completedAt === undefined)
      .map(([userId, job]) => ({ userId, requestedAt: job.requestedAt })) });
  }));

  app.post("/account-deletion/request", wrap(async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !email.includes("@")) return res.status(400).json({ message: "Enter your account email." });
    const now = Date.now();
    if (limited(req, "request", 15)) return res.status(429).json({ message: "Please wait before requesting another code." });

    const account = deps.lookup(email);
    if (account) {
      const token = randomBytes(24).toString("base64url");
      const issued = await deps.repository.update(state => {
        const challenges = (state.settings[challengeKey] ??= {}) as Record<string, Challenge>;
        for (const [hash, row] of Object.entries(challenges)) if (row.expiresAt <= now) delete challenges[hash];
        const jobs = state.settings[jobsKey] as Record<string, Job> | undefined;
        if (jobs?.[account.id] || Object.values(challenges).some(row => row.userId === account.id && row.expiresAt > now + 840_000)) return false;
        for (const [hash, row] of Object.entries(challenges)) if (row.userId === account.id) delete challenges[hash];
        challenges[digest(token)] = { userId: account.id, expiresAt: now + 900_000 };
        return true;
      });
      if (issued) void deps.send(account.email, token).catch(() => console.error("[Badehaus X] Account deletion email unavailable."));
    }
    return res.json({ message: "If the email belongs to an eligible account, you’ll receive a deletion code." });
  }));

  app.post("/account-deletion/confirm", wrap(async (req, res) => {
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (req.body?.confirmation !== "DELETE" || !/^[A-Za-z0-9_-]{32}$/.test(code)) {
      return res.status(400).json({ message: "Enter the emailed code and type DELETE to confirm." });
    }
    if (limited(req, "confirm", 30)) return res.status(429).json({ message: "Please wait before trying another code." });
    const id = await deps.repository.update(state => {
      const challenges = (state.settings[challengeKey] ??= {}) as Record<string, Challenge>;
      const key = digest(code);
      const row = challenges[key];
      if (!row || row.expiresAt <= Date.now()) return undefined;
      delete challenges[key];
      const jobs = (state.settings[jobsKey] ??= {}) as Record<string, Job>;
      jobs[row.userId] ??= { requestedAt: Date.now() };
      return row.userId;
    });
    if (!id) return res.status(400).json({ message: "Invalid or expired deletion code." });
    try {
      await erase(id);
      return res.json({ status: "deleted" });
    } catch {
      return res.status(202).json({ status: "queued" });
    }
  }));
  return { async inProgress(id: string) {
    const jobs = await deps.repository.readSetting<Record<string, Job>>(jobsKey);
    return Boolean(jobs?.[id] && jobs[id].completedAt === undefined);
  }, async stop() { stopping = true; clearInterval(timer); await Promise.allSettled(active.values()); } };
}
