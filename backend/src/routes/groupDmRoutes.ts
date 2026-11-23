import { CHAT_RETENTION_MS } from "../../../shared/chatRetention";
import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { CommunityRepository } from "../repositories/communityRepository";
import type { Session } from "../services/authService";
import { MemberError, text } from "../services/memberService";
import { hasPlus } from "../../../shared/plus";

type Message = { id: string; authorId: string; text: string; createdAtMs: number };
type Conversation = { id: string; creatorId: string; members: string[]; accepted: string[]; messages: Message[]; read: Record<string, number>; createdAtMs: number };
const KEY = "groupConversations";


export function installGroupDmRoutes(app: Express, deps: {
  repository: CommunityRepository;
  session(req: Request, res: Response): Session | null;
  eligible(userId: string): boolean;
  blocked(left: string, right: string): boolean;
  restrictedMessage?(messageId: string): boolean;
  hasHistory(left: string, right: string): boolean;
  report(session: Session, groupId: string, message: Message, reason: unknown): Promise<string>;
}) {
  const route = "/group-conversations";
  function visible(group: Conversation, userId: string): boolean {
    return group.members.includes(userId) && group.members.every((left, index) =>
      deps.eligible(left) && group.members.slice(index + 1).every(right => !deps.blocked(left, right)));
  }
  function access(groups: Conversation[], id: string, userId: string): Conversation {
    const group = groups.find(row => row.id === id && visible(row, userId));
    if (!group) throw new MemberError("NOT_FOUND", "Group conversation unavailable.", 404);
    return group;
  }
  function active(group: Conversation): void {
    if (group.accepted.length !== group.members.length) {
      throw new MemberError("INVITATION_PENDING", "Everyone needs to accept before the conversation starts.", 403);
    }
  }
  function wrap(handler: (req: Request, res: Response, user: Session & { userId: string }) => Promise<unknown>) {
    return (req: Request, res: Response) => {
      res.setHeader("Cache-Control", "private, no-store");
      const session = deps.session(req, res);
      if (!session?.userId) return;
      void handler(req, res, { ...session, userId: session.userId }).catch(error => {
        if (!res.headersSent) res.status(error instanceof MemberError ? error.status : 503)
          .json({ message: error instanceof MemberError ? error.message : "Group messaging is temporarily unavailable." });
      });
    };
  }
  const read = async () => await deps.repository.readSetting<Conversation[]>(KEY) ?? [];
  function write<T>(change: (groups: Conversation[]) => T): Promise<T> {
    return deps.repository.update(state => {
      const groups = (state.settings[KEY] ?? []) as Conversation[];
      const result = change(groups);
      state.settings[KEY] = groups;
      return result;
    });
  }
  const recent = (group: Conversation) => group.messages.filter(message => message.createdAtMs > Date.now() - CHAT_RETENTION_MS);

  app.get(route, wrap(async (_req, res, user) => {
    const groups = (await read()).filter(group => visible(group, user.userId)).map(group => ({
      id: group.id, members: group.members, accepted: group.accepted, creatorId: group.creatorId,
      unread: recent(group).filter(message => message.authorId !== user.userId && message.createdAtMs > (group.read[user.userId] ?? 0)).length
    }));
    return res.json({ groups });
  }));

  app.post(route, wrap(async (req, res, user) => {
    if (!hasPlus(user)) throw new MemberError("PLUS_REQUIRED", "Starting group conversations requires Plus.", 402);
    const peer = text(req.body?.peerId, 128, "Existing conversation partner");
    const invitee = text(req.body?.inviteeId, 128, "Additional member");
    const members = [user.userId, peer, invitee];
    if (new Set(members).size !== 3 || !deps.hasHistory(user.userId, peer)) {
      throw new MemberError("INVALID_INPUT", "Choose two different members, including an existing conversation partner.");
    }
    const group: Conversation = { id: randomUUID(), creatorId: user.userId, members, accepted: [user.userId], messages: [], read: {}, createdAtMs: Date.now() };
    if (!visible(group, user.userId)) throw new MemberError("UNAVAILABLE", "One or more members are unavailable.", 403);
    const id = await write(groups => {
      const existing = groups.find(row => row.members.length === members.length && members.every(id => row.members.includes(id)));
      if (existing) return existing.id;
      groups.push(group);
      return group.id;
    });
    return res.status(201).json({ id });
  }));

  app.post(`${route}/:id/respond`, wrap(async (req, res, user) => {
    const accept = req.body?.accept;
    if (typeof accept !== "boolean") throw new MemberError("INVALID_INPUT", "Choose whether to join.");
    await write(groups => {
      const group = access(groups, String(req.params.id), user.userId);
      if (accept) group.accepted = [...new Set([...group.accepted, user.userId])];
      else {
        if (group.accepted.length === group.members.length) {
          throw new MemberError("ALREADY_ACTIVE", "This group conversation already started.", 409);
        }
        groups.splice(groups.indexOf(group), 1);
      }
    });
    return res.json({ ok: true });
  }));

  app.get(`${route}/:id/messages`, wrap(async (req, res, user) => {
    const group = access(await read(), String(req.params.id), user.userId);
    active(group);
    return res.json({ messages: recent(group).map(message => deps.restrictedMessage?.(message.id)
      ? { ...message, text: "Message unavailable while under safety review." } : message) });
  }));

  app.post(`${route}/:id/read`, wrap(async (req, res, user) => {
    const through = req.body?.through;
    if (!Number.isSafeInteger(through)) throw new MemberError("INVALID_INPUT", "Choose a valid read position.");
    await write(groups => {
      const group = access(groups, String(req.params.id), user.userId);
      active(group);
      group.read[user.userId] = Math.max(group.read[user.userId] ?? 0, Math.min(through, Date.now()));
    });
    return res.json({ ok: true });
  }));

  app.post(`${route}/:id/messages/:messageId/report`, wrap(async (req, res, user) => {
    const group = access(await read(), String(req.params.id), user.userId);
    active(group);
    const message = recent(group).find(item => item.id === req.params.messageId && item.authorId !== user.userId);
    if (!message) throw new MemberError("NOT_FOUND", "Message not found.", 404);
    const reportId = await deps.report(user, group.id, message, req.body?.reason);
    return res.status(201).json({ reportId });
  }));

  app.post(`${route}/:id/messages`, wrap(async (req, res, user) => {
    const content = text(req.body?.text, 1000, "Message");
    const message = await write(groups => {
      const group = access(groups, String(req.params.id), user.userId);
      active(group);
      const createdAtMs = Date.now();
      const messages = recent(group);
      if (messages.filter(item => item.authorId === user.userId && createdAtMs - item.createdAtMs < 60_000).length >= 20) {
        throw new MemberError("RATE_LIMITED", "Wait before sending another message.", 429);
      }
      const message = { id: randomUUID(), authorId: user.userId, text: content, createdAtMs };
      group.messages = [...messages, message].slice(-200);
      return message;
    });
    return res.status(201).json({ message });
  }));
}
