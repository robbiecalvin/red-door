import { randomBytes, randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { MARKETING_CONSENT_VERSION, type MarketingConsent } from "../../../shared/marketing";
import { hasPlus } from "../../../shared/plus";
import type { CommunityRepository } from "../repositories/communityRepository";
import type { AuthService, Session, StoredUser } from "../services/authService";
import { MemberError, text } from "../services/memberService";
import { commissionCents, creditStatus, summarizeReferrals, type createReferralLedger } from "../services/referralLedger";

type Segment = "all" | "plus" | "free" | "priority";
type Campaign = {
  id: string; subject: string; body: string; segment: Segment; atMs: number; actorId: string;
  status: "scheduled" | "sending" | "completed" | "canceled";
  deliveries: Record<string, "claimed" | "accepted" | "failed">;
};
const campaignKey = "marketingCampaigns";
const segments = new Set(["all", "plus", "free", "priority"]);

export function installGrowthRoutes(app: Express, deps: {
  auth: AuthService;
  repository: CommunityRepository;
  ledger: ReturnType<typeof createReferralLedger>;
  member(req: Request, res: Response): { user: StoredUser } | null;
  admin(req: Request, res: Response): Session | null;
  persist(): Promise<void>;
  send?: (message: { to: string; subject: string; text: string; headers?: Record<string, string> }) => Promise<unknown>;
  sendSummary?: (to: string, body: string) => Promise<unknown>;
  notify(userId: string, subject: string, message: string): void;
}) {
  const users = () => deps.auth.listRegisteredUserIds().flatMap(id => {
    const user = deps.auth.getUser(id);
    return user ? [user] : [];
  });
  function route(handler: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response) => {
      res.set("Cache-Control", "private, no-store");
      void handler(req, res).catch(error => {
        if (!res.headersSent) res.status(error instanceof MemberError ? error.status : 503)
          .json({ message: error instanceof MemberError ? error.message : "Unable to complete this request." });
      });
    };
  }
  async function consent(user: StoredUser, enabled: boolean, source: MarketingConsent["history"][number]["source"]) {
    const previous = user.plusData?.marketing;
    if (Boolean(previous?.enabled) === enabled) return;
    deps.auth.updatePlus(user.id, { plusData: { ...user.plusData, marketing: { enabled,
      token: enabled ? randomBytes(32).toString("hex") : undefined,
      history: [...(previous?.history ?? []), { enabled, source, atMs: Date.now(), version: MARKETING_CONSENT_VERSION }]
    } } });
    await deps.persist();
  }
  app.get("/account/marketing", route(async (req, res) => {
    const actor = deps.member(req, res); if (!actor) return;
    return res.json({ enabled: actor.user.plusData?.marketing?.enabled === true });
  }));
  app.put("/account/marketing", route(async (req, res) => {
    const actor = deps.member(req, res); if (!actor) return;
    if (typeof req.body?.enabled !== "boolean") throw new MemberError("INVALID_INPUT", "Choose a preference.");
    await consent(actor.user, req.body.enabled, "settings");
    return res.json({ enabled: req.body.enabled });
  }));
  app.get("/email/unsubscribe/:token", route(async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.sendStatus(404);
    res.set({ "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; form-action 'self'; base-uri 'none'" });
    return res.type("html").send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribe from Badehaus X email</title><h1>Badehaus X email</h1><form method="post"><button type="submit">Unsubscribe from marketing email</button></form></html>');
  }));
  app.post("/email/unsubscribe/:token", route(async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.sendStatus(404);
    const user = users().find(row => row.plusData?.marketing?.token === req.params.token);
    if (user) await consent(user, false, "unsubscribe");
    res.set("Referrer-Policy", "no-referrer");
    return res.type("text").send("Marketing email is unsubscribed.");
  }));

  const marketingAddress = process.env.MARKETING_CONTACT_ADDRESS?.trim();
  const marketingFrom = process.env.MARKETING_FROM?.trim();
  let base: URL | undefined;
  try {
    const url = new URL(process.env.MARKETING_PUBLIC_API_URL ?? "");
    if (url.protocol === "https:" && !url.username && !url.password) base = url;
  } catch {}
  const sendingEnabled = process.env.MARKETING_SEND_ENABLED === "true" && Boolean(deps.send && marketingAddress && marketingFrom && base);
  async function campaigns() { return (await deps.repository.readSetting<Campaign[]>(campaignKey)) ?? []; }
  function change<T>(fn: (rows: Campaign[]) => T) {
    return deps.repository.update(state => {
      const rows = (state.settings[campaignKey] as Campaign[] | undefined) ?? [];
      const result = fn(rows);
      state.settings[campaignKey] = rows;
      return result;
    });
  }
  function inAudience(user: StoredUser, segment: Segment) {
    return user.emailVerified && !user.bannedAtMs && user.plusData?.marketing?.enabled && user.plusData.marketing.token &&
      (segment === "all" || (segment === "plus" && hasPlus(user)) || (segment === "free" && !hasPlus(user)) ||
        (segment === "priority" && user.plusData.priorityApprovedAtMs !== undefined));
  }
  let sending = false;
  let shuttingDown = false;
  async function deliver() {
    if (!sendingEnabled || sending || shuttingDown) return;
    sending = true;
    try {
      const due = (await campaigns()).find(row => (row.status === "scheduled" || row.status === "sending") && row.atMs <= Date.now());
      if (!due) return;
      const audience = users().filter(user => inAudience(user, due.segment) && !due.deliveries[user.id]).slice(0, 10);
      if (!audience.length) {
        if (Object.values(due.deliveries).includes("claimed")) return;
        await change(rows => {
          const row = rows.find(item => item.id === due.id);
          if (row && row.status !== "canceled" && !Object.values(row.deliveries).includes("claimed")) row.status = "completed";
        });
        return;
      }
      for (const person of audience) {
        if (shuttingDown) break;
        const claimed = await change(rows => {
          const row = rows.find(item => item.id === due.id);
          if (!row || !["scheduled", "sending"].includes(row.status) || row.deliveries[person.id]) return false;
          row.status = "sending";
          row.deliveries[person.id] = "claimed";
          return true;
        });
        if (!claimed) continue;
        let result: "accepted" | "failed" = "failed";
        const current = deps.auth.getUser(person.id);
        if (current && inAudience(current, due.segment)) {
          const url = new URL(`/email/unsubscribe/${current.plusData!.marketing!.token}`, base);
          try {
            await deps.send!({ to: current.email, subject: due.subject, text: `Badehaus X\n\n${due.body}\n\n${marketingAddress}\nUnsubscribe: ${url}`,
              headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
            result = "accepted";
          } catch {}
        }
        await change(rows => { const row = rows.find(item => item.id === due.id); if (row) row.deliveries[person.id] = result; });
      }
    } finally { sending = false; }
  }
  let wake: NodeJS.Timeout | undefined;
  const timer = setInterval(() => void deliver().catch(() => {}), 15_000).unref();

  app.get("/membership/referrals", route(async (req, res) => {
    const actor = deps.member(req, res); if (!actor) return;
    const credits = (await deps.ledger.list()).filter(row => row.live && row.ownerId === actor.user.id);
    return res.json({
      verified: users().filter(row => row.emailVerified && row.plusData?.priorityReferralOwnerId === actor.user.id).length,
      credits: credits.map(row => ({ status: creditStatus(row), atMs: row.earnedAtMs })),
      ...summarizeReferrals(credits, actor.user.plusData?.priorityApprovedAtMs !== undefined),
      commissionCents
    });
  }));
  app.post("/admin/growth/summary-email", route(async (req, res) => {
    const actor = deps.admin(req, res); if (!actor?.userId) return;
    const user = deps.auth.getUser(actor.userId);
    if (!deps.sendSummary || !user?.emailVerified) throw new MemberError("UNAVAILABLE", "Growth summary email is unavailable.", 503);
    const credits = (await deps.ledger.list()).filter(row => row.live);
    const count = (status: string) => credits.filter(row => creditStatus(row) === status).length;
    const verified = users().filter(row => row.emailVerified && row.plusData?.priorityReferralOwnerId).length;
    await deps.sendSummary(user.email, [
      "Badehaus X Growth summary", `Verified referral registrations: ${verified}`,
      `Pending: ${count("pending")}`, `Earned: ${count("earned")}`, `Paid: ${count("paid")}`,
      `Reversed: ${count("reversed")}`, `Refund review: ${count("refund-review")}`
    ].join("\n"));
    return res.json({ ok: true });
  }));
  app.get("/admin/growth", route(async (req, res) => {
    if (!deps.admin(req, res)) return;
    const members = users();
    const credits = await deps.ledger.list();
    const campaignRows = await campaigns();
    return res.json({
      referrals: members.filter(row => row.plusData?.priorityReferralOwnerId).length,
      verifiedReferrals: members.filter(row => row.emailVerified && row.plusData?.priorityReferralOwnerId).length,
      marketingSubscribers: members.filter(row => inAudience(row, "all")).length,
      marketingSendingEnabled: sendingEnabled,
      commissionCents,
      credits: credits.map(row => ({ ...row, ownerEmail: deps.auth.getUser(row.ownerId)?.email, status: creditStatus(row) })),
      campaigns: campaignRows.map(({ body, deliveries, ...row }) => ({ ...row,
        accepted: Object.values(deliveries).filter(status => status === "accepted").length,
        failed: Object.values(deliveries).filter(status => status === "failed").length,
        unconfirmed: Object.values(deliveries).filter(status => status === "claimed").length
      }))
    });
  }));
  app.post("/admin/growth/commission", route(async (req, res) => {
    const actor = deps.admin(req, res); if (!actor?.userId) return;
    const row = await deps.ledger.review(text(req.body?.invoiceId, 120, "Invoice"), actor.userId, req.body?.action, req.body?.reference);
    if (row.payout) deps.notify(row.ownerId, "Badehaus X referral payout recorded", "A CAD $5.00 referral payout was recorded.");
    else deps.notify(row.ownerId, "Badehaus X referral commission approved", "A CAD $5.00 referral commission was approved.");
    return res.json({ ok: true });
  }));
  app.post("/admin/growth/campaign", route(async (req, res) => {
    const actor = deps.admin(req, res); if (!actor?.userId) return;
    if (!sendingEnabled) throw new MemberError("UNAVAILABLE", "Campaign sending is disabled.", 503);
    const atMs = req.body?.atMs;
    const segment = req.body?.segment;
    if (!Number.isSafeInteger(atMs) || atMs <= Date.now() || !segments.has(segment)) throw new MemberError("INVALID_INPUT", "Select an audience and future send time.");
    const subject = text(req.body?.subject, 120, "Subject");
    if (/[\r\n]/.test(subject)) throw new MemberError("INVALID_INPUT", "Use a single-line subject.");
    const campaign: Campaign = { id: randomUUID(), subject, body: text(req.body?.body, 4000, "Message"),
      atMs, segment, actorId: actor.userId, status: "scheduled", deliveries: {} };
    await change(rows => rows.push(campaign));
    // Wake promptly for a newly scheduled campaign. The interval recovers work after restarts.
    if (!wake && atMs - Date.now() < 15_000) {
      wake = setTimeout(() => {
        wake = undefined;
        void deliver().catch(() => {});
      }, Math.max(0, atMs - Date.now())).unref();
    }
    return res.status(201).json({ id: campaign.id });
  }));
  app.post("/admin/growth/campaign/:id/cancel", route(async (req, res) => {
    const actor = deps.admin(req, res); if (!actor?.userId) return;
    await change(rows => {
      const row = rows.find(item => item.id === req.params.id);
      if (!row || !["scheduled", "sending"].includes(row.status)) throw new MemberError("NOT_FOUND", "Active campaign not found.", 404);
      row.status = "canceled";
      Object.assign(row, { canceledBy: actor.userId, canceledAtMs: Date.now() });
    });
    return res.json({ ok: true });
  }));
  return () => { shuttingDown = true; clearInterval(timer); clearTimeout(wake); };
}
