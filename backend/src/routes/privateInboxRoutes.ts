import { containsDisallowedKidVariation } from "../services/contentPolicy";
import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { CommunityRepository } from "../repositories/communityRepository";
import type { Session } from "../services/authService";
import { CHAT_RETENTION_MS } from "../../../shared/chatRetention";

type Message = { id: string; sender: string; body: string; at: number; requestId: string };
type Thread = { id: string; sender: string; recipient: string; subject: string; status: "pending" | "accepted" | "closed"; messages: Message[]; archived: string[]; hidden: string[]; read: Record<string, number> };
type Draft = { id: string; owner: string; recipient: string; subject: string; body: string; revision: number; updatedAt: number };
type Preference = "requests" | "connections" | "nobody";
type Inbox = { threads: Thread[]; drafts: Draft[]; preferences?: Record<string, Preference> };
const key = "privateInbox";
const day = 86400000;
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
const clean = (value: unknown, max: number) => typeof value === "string" && value.length <= max && !containsDisallowedKidVariation(value) ? value.trim() : "";
const empty = (): Inbox => ({ threads: [], drafts: [] });

function prune(state: Inbox, now: number): Inbox {
  return { ...state, threads: state.threads.flatMap(thread => {
    const messages = thread.messages.filter(message => now - message.at < CHAT_RETENTION_MS);
    return messages.length ? [{ ...thread, messages }] : [];
  }), drafts: state.drafts.filter(draft => now - draft.updatedAt < CHAT_RETENTION_MS) };
}

export function erasePrivateInboxUser(state: Record<string, unknown>, userId: string) {
  const inbox = state[key] as Inbox | undefined;
  if (!inbox) return;
  inbox.threads = inbox.threads.filter(thread => thread.sender !== userId && thread.recipient !== userId);
  inbox.drafts = inbox.drafts.filter(draft => draft.owner !== userId && draft.recipient !== userId);
  if (inbox.preferences) delete inbox.preferences[userId];
}

class InboxError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function installPrivateInboxRoutes(app: Express, deps: {
  repository: CommunityRepository;
  session(req: Request, res: Response): Session | null;
  canContact(left: string, right: string): boolean;
  findName(id: string): Promise<string | undefined>;
  restricted(messageId: string): boolean;
  report(session: Session, threadId: string, message: Message, reason: unknown): Promise<string>;
}) {
  const prefix = "/private-inbox";
  const read = async () => prune(await deps.repository.readSetting<Inbox>(key) ?? empty(), Date.now());
  const write = <T>(change: (state: Inbox, now: number) => T) => deps.repository.update(({ settings }) => {
    const now = Date.now();
    const state = prune((settings[key] as Inbox | undefined) ?? empty(), now);
    const result = change(state, now);
    settings[key] = state;
    return result;
  });
  function route(handler: (req: Request, res: Response, session: Session & { userId: string }) => Promise<unknown>) {
    return (req: Request, res: Response) => {
      res.setHeader("Cache-Control", "private, no-store");
      const actor = deps.session(req, res);
      if (!actor?.userId) return;
      void handler(req, res, { ...actor, userId: actor.userId }).catch(error => {
        if (!res.headersSent) res.status(error instanceof InboxError ? error.status : 503)
          .json({ message: error instanceof InboxError ? error.message : "Private inbox is temporarily unavailable." });
      });
    };
  }
  const peer = (thread: Thread, user: string) => thread.sender === user ? thread.recipient : thread.sender;
  const visible = (thread: Thread, user: string) => (thread.sender === user || thread.recipient === user) &&
    !thread.hidden.includes(user) && deps.canContact(user, peer(thread, user));
  function requireThread(state: Inbox, id: string, user: string) {
    const thread = state.threads.find(item => item.id === id && visible(item, user));
    if (!thread) throw new InboxError(404, "Conversation unavailable.");
    return thread;
  }
  const safeMessage = (message: Message) => ({
    id: message.id, sender: message.sender, at: message.at,
    body: deps.restricted(message.id) ? "This message is unavailable." : message.body
  });
  async function summary(thread: Thread, user: string) {
    const last = thread.messages[thread.messages.length - 1];
    const peerId = peer(thread, user);
    return { id: thread.id, subject: thread.subject, status: thread.status, peerId,
      peerName: await deps.findName(peerId) ?? "Member", incoming: thread.recipient === user,
      unread: thread.messages.some(message => message.sender !== user && message.at > (thread.read[user] ?? 0)),
      updatedAt: last.at, archived: thread.archived.includes(user) };
  }

  app.get(prefix + "/preferences", route(async (_req, res, actor) => {
    const state = await read();
    return res.json({ incoming: state.preferences?.[actor.userId] ?? "requests" });
  }));

  app.put(prefix + "/preferences", route(async (req, res, actor) => {
    const { incoming } = req.body ?? {};
    if (incoming !== "requests" && incoming !== "connections" && incoming !== "nobody") {
      throw new InboxError(400, "Choose who can start a private conversation.");
    }
    await write(state => { state.preferences = { ...state.preferences, [actor.userId]: incoming }; });
    return res.json({ incoming });
  }));

  app.get(prefix + "/threads", route(async (req, res, actor) => {
    const { folder = "inbox" } = req.query;
    const offset = req.query.offset ?? "0";
    if (typeof offset !== "string" || !/^\d{1,6}$/.test(offset) ||
        typeof folder !== "string" || !["inbox", "sent", "requests", "archive"].includes(folder)) {
      throw new InboxError(400, "Invalid folder or page.");
    }
    const state = await read();
    const user = actor.userId;
    const rows = state.threads.filter(thread => visible(thread, user)).filter(thread => {
      const archived = thread.archived.includes(user);
      if (folder === "archive") return archived;
      if (archived) return false;
      if (folder === "requests") return thread.status === "pending" && thread.recipient === user;
      if (folder === "sent") return thread.messages.some(message => message.sender === user);
      return thread.status === "accepted" && thread.messages.some(message => message.sender !== user);
    }).sort((a, b) => b.messages[b.messages.length - 1].at - a.messages[a.messages.length - 1].at);
    const start = Number(offset);
    return res.json({ threads: await Promise.all(rows.slice(start, start + 40).map(thread => summary(thread, user))),
      next: rows.length > start + 40 ? start + 40 : null });
  }));

  app.get(prefix + "/threads/:id", route(async (req, res, actor) => {
    const thread = requireThread(await read(), req.params.id, actor.userId);
    const offset = req.query.offset ?? "0";
    if (typeof offset !== "string" || !/^\d{1,6}$/.test(offset)) throw new InboxError(400, "Invalid page.");
    const end = Math.max(0, thread.messages.length - Number(offset));
    return res.json({ thread: await summary(thread, actor.userId),
      messages: thread.messages.slice(Math.max(0, end - 40), end).map(safeMessage),
      next: end > 40 ? Number(offset) + 40 : null });
  }));

  app.post(prefix + "/threads", route(async (req, res, actor) => {
    const { recipient, requestId } = req.body ?? {};
    const subject = clean(req.body?.subject, 120), body = clean(req.body?.body, 3000);
    if (typeof recipient !== "string" || !validId(requestId) || !subject || !body || recipient === actor.userId) {
      throw new InboxError(400, "Choose a recipient and enter a subject and message.");
    }
    const id = await write((state, now) => {
      const user = actor.userId;
      if (!deps.canContact(user, recipient)) throw new InboxError(404, "Recipient unavailable.");
      const repeated = state.threads.find(thread => thread.sender === user &&
        thread.messages.some(message => message.sender === user && message.requestId === requestId));
      if (repeated) return repeated.id;
      const related = state.threads.filter(thread =>
        (thread.sender === user && thread.recipient === recipient) || (thread.sender === recipient && thread.recipient === user));
      const connected = related.some(item => item.status === "accepted");
      const preference = state.preferences?.[recipient] ?? "requests";
      if (preference === "nobody" || (preference === "connections" && !connected)) {
        throw new InboxError(403, "This member is not accepting new private conversations.");
      }
      if (related.some(thread => thread.status === "pending")) throw new InboxError(409, "There is already a pending request with this member.");
      if (state.threads.filter(thread => thread.sender === user && thread.messages[0].at > now - day).length >= 5) {
        throw new InboxError(429, "You’ve reached the daily limit for new conversations.");
      }
      const thread: Thread = { id: randomUUID(), sender: user, recipient, subject,
        status: connected ? "accepted" : "pending",
        messages: [{ id: randomUUID(), sender: user, body, at: now, requestId }],
        archived: [], hidden: [], read: { [user]: now } };
      state.threads.push(thread);
      state.drafts = state.drafts.filter(draft => draft.owner !== user || draft.id !== requestId);
      return thread.id;
    });
    return res.json({ id });
  }));

  app.post(prefix + "/threads/:id/messages", route(async (req, res, actor) => {
    const body = clean(req.body?.body, 3000), { requestId } = req.body ?? {};
    if (!body || !validId(requestId)) throw new InboxError(400, "Enter a message.");
    const message = await write((state, now) => {
      const thread = requireThread(state, req.params.id, actor.userId);
      const repeated = thread.messages.find(message => message.sender === actor.userId && message.requestId === requestId);
      if (repeated) return repeated;
      if (thread.status !== "accepted") throw new InboxError(409, "The recipient must accept before you can reply.");
      if (thread.messages.filter(message => message.sender === actor.userId && message.at > now - 60_000).length >= 10) {
        throw new InboxError(429, "Wait a moment before sending another message.");
      }
      const message = { id: randomUUID(), sender: actor.userId, body, at: now, requestId };
      thread.messages.push(message);
      thread.read[actor.userId] = now;
      return message;
    });
    return res.json({ message: safeMessage(message) });
  }));

  app.patch(prefix + "/threads/:id", route(async (req, res, actor) => {
    const { action } = req.body ?? {};
    await write((state, now) => {
      const user = actor.userId;
      const thread = requireThread(state, req.params.id, user);
      if (action === "accept" && thread.status === "pending" && thread.recipient === user) thread.status = "accepted";
      else if (action === "decline" && thread.status === "pending" && thread.recipient === user ||
               action === "withdraw" && thread.status === "pending" && thread.sender === user) {
        // Keep the record until retention expiry so withdrawing does not reset request limits.
        thread.hidden = [thread.sender, thread.recipient];
        thread.status = "closed";
      } else if (action === "read") {
        const through = req.body?.through;
        if (!Number.isFinite(through)) throw new InboxError(400, "Choose a valid read position.");
        thread.read[user] = Math.max(thread.read[user] ?? 0, Math.min(through, now));
      }
      else if (action === "archive" && !thread.archived.includes(user)) thread.archived.push(user);
      else if (action === "unarchive") thread.archived = thread.archived.filter(id => id !== user);
      else if (action === "hide" && thread.status === "accepted") thread.hidden.push(user);
      else throw new InboxError(400, "This action is unavailable.");
    });
    return res.json({ ok: true });
  }));

  app.post(prefix + "/threads/:id/report", route(async (req, res, actor) => {
    const thread = requireThread(await read(), req.params.id, actor.userId);
    const message = thread.messages.find(item => item.id === req.body?.messageId && item.sender !== actor.userId);
    if (!message) throw new InboxError(404, "Message unavailable.");
    const reason = clean(req.body?.reason, 500);
    if (!reason) throw new InboxError(400, "Enter a reason for the report.");
    return res.json({ reportId: await deps.report(actor, thread.id, message, reason) });
  }));

  app.get(prefix + "/drafts", route(async (_req, res, actor) => {
    const drafts = (await read()).drafts.filter(draft => draft.owner === actor.userId).sort((a, b) => b.updatedAt - a.updatedAt);
    return res.json({ drafts });
  }));

  app.put(prefix + "/drafts/:id", route(async (req, res, actor) => {
    const { recipient, subject, body, revision } = req.body ?? {};
    if (!validId(req.params.id) || typeof recipient !== "string" || recipient.length > 100 ||
        typeof subject !== "string" || subject.length > 120 || typeof body !== "string" || body.length > 3000 ||
        !Number.isInteger(revision) || revision < 0) throw new InboxError(400, "Invalid draft.");
    const draft = await write((state, now) => {
      const index = state.drafts.findIndex(item => item.id === req.params.id && item.owner === actor.userId);
      const old = state.drafts[index];
      if ((old?.revision ?? 0) !== revision) throw new InboxError(409, "This draft changed elsewhere. Reload to see the latest copy.");
      if (index < 0 && state.drafts.filter(item => item.owner === actor.userId).length >= 20) throw new InboxError(409, "Delete an old draft first.");
      const next = { id: req.params.id, owner: actor.userId, recipient, subject, body, revision: revision + 1, updatedAt: now };
      if (index < 0) state.drafts.push(next);
      else state.drafts[index] = next;
      return next;
    });
    return res.json({ draft });
  }));

  app.delete(prefix + "/drafts/:id", route(async (req, res, actor) => {
    await write(state => { state.drafts = state.drafts.filter(item => item.id !== req.params.id || item.owner !== actor.userId); });
    return res.json({ ok: true });
  }));

  return () => write(() => undefined);
}
