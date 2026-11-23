import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import type { Session } from "../services/authService";
import { MemberError, text } from "../services/memberService";

const prefix = "badehaus-live-";
const viewerLimit = 10;
const connectionGraceMs = 45_000;
const broadcastLimitMs = 30 * 60_000;
type Admission = { sessionToken: string; holdUntil: number };
type Broadcast = {
  id: string;
  hostId: string;
  sessionToken: string;
  expiresAt: number;
  pendingUntil: number;
  live: boolean;
  ending: boolean;
  created: boolean;
  viewers: Map<string, Admission>;
};

export function installLiveRoutes(app: Express, deps: {
  disabled?: boolean;
  session(req: Request, res: Response): Session | null;
  admin(req: Request, res: Response): Session | null;
  eligible(id: string, token: string): boolean;
  discoverable(id: string): boolean;
  blocked(a: string, b: string): boolean;
  name(id: string): Promise<string>;
  report(session: Session, id: string, hostId: string, reason: string): Promise<string>;
}) {
  const url = process.env.LIVEKIT_URL?.trim();
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  const secureUrl = url && (/^wss:\/\//.test(url) ||
    (process.env.NODE_ENV !== "production" && /^ws:\/\/(localhost|127\.0\.0\.1):[0-9]+$/.test(url)));
  const enabled = !deps.disabled && process.env.LIVE_BETA_ENABLED === "true" && secureUrl && key && secret;
  if (!enabled || !url || !key || !secret) {
    app.get("/live", (_req, res) => res.set("Cache-Control", "no-store").json({ enabled: false, broadcasts: [] }));
    return async () => {};
  }
  const provider = new RoomServiceClient(url.replace(/^ws/, "http"), key, secret, { requestTimeout: 5 });
  const broadcasts = new Map<string, Broadcast>();
  let sweeping = false;
  let ready = false;
  const pendingStops = new Map<string, Promise<void>>();

  function stop(item: Broadcast) {
    const pending = pendingStops.get(item.id);
    if (pending) return pending;
    item.ending = true;
    item.live = false;
    const operation = provider.deleteRoom(item.id).then(() => { broadcasts.delete(item.id); }).catch(error => {
      item.ending = false;
      item.expiresAt = 0;
      throw error;
    }).finally(() => pendingStops.delete(item.id));
    pendingStops.set(item.id, operation);
    return operation;
  }

  async function sweep() {
    if (sweeping) return;
    sweeping = true;
    try {
      const rooms = await provider.listRooms();
      if (!ready) {
        await Promise.all(rooms.filter(room => room.name.startsWith(prefix)).map(room => provider.deleteRoom(room.name)));
        ready = true;
        return;
      }
      await Promise.allSettled([...broadcasts.values()].map(async item => {
        if (item.ending || !item.created) return;
        if (Date.now() >= item.expiresAt || !deps.eligible(item.hostId, item.sessionToken) || !deps.discoverable(item.hostId)) {
          await stop(item);
          return;
        }
        const room = rooms.find(room => room.name === item.id);
        if (!room) {
          if (Date.now() >= item.pendingUntil && !item.ending) broadcasts.delete(item.id);
          item.live = false;
          return;
        }
        const people = await provider.listParticipants(item.id);
        const host = people.find(person => person.identity === item.hostId);
        item.live = !item.ending && Boolean(host?.tracks.some(track => track.source === TrackSource.CAMERA && !track.muted));
        if (item.live) item.pendingUntil = Date.now() + connectionGraceMs;
        if (!item.live && Date.now() >= item.pendingUntil) {
          await stop(item);
          return;
        }
        const connected = new Set(people.map(person => person.identity));
        for (const [id, admission] of item.viewers) {
          if (!connected.has(id) && Date.now() >= admission.holdUntil) item.viewers.delete(id);
        }
        await Promise.allSettled(people.filter(person => {
          if (person.identity === item.hostId) return false;
          const admission = item.viewers.get(person.identity);
          return !admission || !deps.eligible(person.identity, admission.sessionToken) || deps.blocked(item.hostId, person.identity);
        }).map(person => provider.removeParticipant(item.id, person.identity)));
      }));
    } catch {
      // A temporary provider outage is retried on the next sweep.
    } finally { sweeping = false; }
  }
  void sweep();
  const timer = setInterval(() => void sweep(), 5000).unref();

  function wrap(handler: (req: Request, res: Response, session: Session & { userId: string }) => Promise<unknown>, admin = false) {
    return (req: Request, res: Response) => {
      res.set("Cache-Control", "private, no-store");
      const session = (admin ? deps.admin : deps.session)(req, res);
      if (!session?.userId) return;
      if (!ready) return res.status(503).json({ code: "LIVE_UNAVAILABLE", message: "Live is temporarily unavailable." });
      void handler(req, res, { ...session, userId: session.userId }).catch(error => {
        if (!res.headersSent) res.status(error instanceof MemberError ? error.status : 503)
          .json(error instanceof MemberError
            ? { code: error.code, message: error.message }
            : { code: "LIVE_UNAVAILABLE", message: "Live is temporarily unavailable." });
      });
    };
  }
  function visible(item: Broadcast, viewerId: string) {
    return item.live && !item.ending && item.expiresAt > Date.now() && deps.eligible(item.hostId, item.sessionToken) &&
      deps.discoverable(item.hostId) && !deps.blocked(viewerId, item.hostId);
  }
  async function credentials(item: Broadcast, userId: string, publish: boolean) {
    const token = new AccessToken(key, secret, { identity: userId, ttl: 30 });
    token.addGrant({
      roomJoin: true, room: item.id, canPublish: publish, canSubscribe: !publish, canPublishData: false,
      ...(publish ? { canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE] } : {})
    });
    const signed = await token.toJwt();
    if (item.ending || item.expiresAt <= Date.now() || !broadcasts.has(item.id)) {
      throw new MemberError("NOT_FOUND", "Broadcast unavailable.", 404);
    }
    return { id: item.id, url, token: signed, expiresAt: item.expiresAt };
  }

  app.get("/live", wrap(async (_req, res, user) => res.json({
    enabled: true,
    broadcasts: await Promise.all([...broadcasts.values()].filter(item => visible(item, user.userId) || (
      user.role === "admin" && item.created && !item.ending && item.expiresAt > Date.now()
    )).map(async item => ({ id: item.id, hostId: item.hostId, label: await deps.name(item.hostId), live: visible(item, user.userId) })))
  })));

  app.post("/live", wrap(async (_req, res, user) => {
    if (!deps.discoverable(user.userId)) throw new MemberError("PROFILE_HIDDEN", "Make your profile discoverable before broadcasting.", 403);
    if ([...broadcasts.values()].some(item => item.hostId === user.userId)) {
      throw new MemberError("ALREADY_LIVE", "End your current broadcast before starting another.", 409);
    }
    if (broadcasts.size >= 5) throw new MemberError("LIVE_CAPACITY", "Live is at capacity. Try again later.", 429);
    const now = Date.now();
    const item: Broadcast = {
      id: prefix + randomUUID(), hostId: user.userId, sessionToken: user.sessionToken,
      expiresAt: now + broadcastLimitMs, pendingUntil: now + connectionGraceMs,
      live: false, ending: false, created: false, viewers: new Map()
    };
    broadcasts.set(item.id, item);
    try {
      await provider.createRoom({ name: item.id, maxParticipants: viewerLimit + 1, emptyTimeout: 45, departureTimeout: 20 });
      item.created = true;
      return res.status(201).json(await credentials(item, user.userId, true));
    } catch {
      item.created = true;
      await stop(item).catch(() => {});
      throw new MemberError("LIVE_UNAVAILABLE", "Couldn't start a broadcast. Try again shortly.", 503);
    }
  }));
  app.post("/live/:id/watch", wrap(async (req, res, user) => {
    const item = broadcasts.get(req.params.id);
    if (!item || !visible(item, user.userId) || item.hostId === user.userId) throw new MemberError("NOT_FOUND", "Broadcast unavailable.", 404);
    if (!item.viewers.has(user.userId) && item.viewers.size >= viewerLimit) {
      throw new MemberError("LIVE_CAPACITY", "This broadcast is full. Try again shortly.", 429);
    }
    item.viewers.set(user.userId, { sessionToken: user.sessionToken, holdUntil: Date.now() + connectionGraceMs });
    return res.json(await credentials(item, user.userId, false));
  }));
  app.delete("/live/:id", wrap(async (req, res, user) => {
    const item = broadcasts.get(req.params.id);
    if (!item) return res.json({ ok: true });
    if (item.hostId !== user.userId) throw new MemberError("NOT_FOUND", "Broadcast unavailable.", 404);
    await stop(item);
    return res.json({ ok: true });
  }));
  app.delete("/admin/live/:id", wrap(async (req, res) => {
    const item = broadcasts.get(req.params.id);
    if (item) await stop(item);
    return res.json({ ok: true });
  }, true));
  app.post("/live/:id/report", wrap(async (req, res, user) => {
    const item = broadcasts.get(req.params.id);
    if (!item || !visible(item, user.userId) || item.hostId === user.userId) throw new MemberError("NOT_FOUND", "Broadcast unavailable.", 404);
    return res.status(201).json({ reportId: await deps.report(user, item.id, item.hostId, text(req.body?.reason, 500, "Report reason")) });
  }));
  return async () => {
    clearInterval(timer);
    await Promise.allSettled([...broadcasts.values()].map(stop));
  };
}
