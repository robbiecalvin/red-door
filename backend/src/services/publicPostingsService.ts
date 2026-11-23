import { isPostingBoard, type PostingBoard } from "../../../shared/postingBoard";
import { randomUUID } from "node:crypto";
import { GROUP_MESSAGE_MAX_LENGTH, type GroupDiscussionMessage } from "../../../shared/groupDiscussion";
import { isGroupFormat, validGroupSchedule, type GroupFormat } from "../../../shared/groupSchedule";
import { hasPlus } from "../../../shared/plus";
import { isPostingAvailability, type PostingAvailability } from "../../../shared/postingStatus";
import { hasActiveGroupInvitation, resolveGroupInvitationDeadline } from "../../../shared/groupInvitation";
import { groupIsFull, validGuestLimit } from "../../../shared/groupCapacity";
import fs from "node:fs";
import path from "node:path";

import { groupPostingForViewer } from "../../../shared/groupPrivacy";
import { containsDisallowedKidVariation } from "./contentPolicy";

export type PostingType = "ad" | "event";

export type ErrorCode =
  | "ANONYMOUS_FORBIDDEN"
  | "AGE_GATE_REQUIRED"
  | "PLUS_REQUIRED"
  | "RATE_LIMITED"
  | "INVALID_INPUT"
  | "POSTING_TYPE_NOT_ALLOWED"
  | "POSTING_NOT_FOUND"
  | "UNAUTHORIZED_ACTION";

export type ServiceError = Readonly<{
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
}>;

type ResultOk<T> = Readonly<{ ok: true; value: T }>;
type ResultErr = Readonly<{ ok: false; error: ServiceError }>;
export type Result<T> = ResultOk<T> | ResultErr;

export type SessionLike = Readonly<{
  userType: "guest" | "registered" | "subscriber";
  userId?: string;
  sessionToken?: string;
  ageVerified: boolean;
  role?: "user" | "admin";
  tier?: string;
  plusExpiresAtMs?: number;
}>;

export type ModerationStatus = "pending" | "approved" | "rejected";

export type Posting = Readonly<{
  postingId: string;
  type: PostingType;
  title: string;
  body: string;
  photoMediaId?: string;
  availability?: PostingAvailability;
  board?: PostingBoard;
  lat?: number;
  lng?: number;
  eventStartAtMs?: number;
  groupStartsAtMs?: number;
  groupFormat?: GroupFormat;
  groupSeriesId?: string;
  groupOccurrence?: number;
  groupOccurrenceCount?: number;
  guestLimit?: number;
  attendeeCount?: number;
  locationInstructions?: string;
  groupDetails?: string;
  authorUserId: string;
  createdAtMs: number;
  invitedUserIds?: ReadonlyArray<string>;
  inviteExpiresAtByUserId?: Readonly<Record<string, number>>;
  acceptedUserIds?: ReadonlyArray<string>;
  joinRequestUserIds?: ReadonlyArray<string>;
  moderationStatus: ModerationStatus;
  moderatedAtMs?: number;
  moderatedByUserId?: string;
  moderationReason?: string;
}>;

export type PostingInput = Readonly<{
  type: unknown;
  title: unknown;
  body: unknown;
  photoMediaId?: unknown;
  availability?: unknown;
  board?: unknown;
  lat?: unknown;
  lng?: unknown;
  eventStartAtMs?: unknown;
  groupSchedule?: unknown;
  groupFormat?: unknown;
  guestLimit?: unknown;
  locationInstructions?: unknown;
  groupDetails?: unknown;
}>;

export type PublicPostingsState = Readonly<{
  posts: ReadonlyArray<Posting>;
  groupDiscussions?: Readonly<Record<string, readonly GroupDiscussionMessage[]>>;
}>;

export type EventInvite = Readonly<{
  postingId: string;
  invitedUserId: string;
  invitedByUserId: string;
  createdAtMs: number;
  expiresAtMs: number;
}>;

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  return { ok: false, error: context ? { code, message, context } : { code, message } };
}

function asType(value: unknown): PostingType | null {
  return value === "ad" || value === "event" ? value : null;
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function asOptionalText(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function requirePostingIdentity(session: SessionLike): Result<{ userId: string }> {
  if (session.userType === "guest") {
    return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot create public postings.");
  }
  if (session.ageVerified !== true) {
    return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Badehaus X.", { minimumAge: 18 });
  }
  if (typeof session.userId !== "string" || session.userId.trim() === "") {
    return err("INVALID_INPUT", "Invalid user identity.");
  }
  return ok({ userId: session.userId });
}

function asOptionalEpochMs(value: unknown): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  if (n <= 0) return null;
  return n;
}

function redactPostingForViewer(posting: Posting, viewer: SessionLike | undefined, now: number): Posting {
  const id = viewer?.ageVerified && viewer.userType !== "guest" ? asText(viewer.userId) : null;
  return groupPostingForViewer(posting, id ?? undefined, now);
}

export function createPublicPostingsService(
  deps?: Readonly<{
    nowMs?: () => number;
    blocked?: (hostId: string, viewerId: string) => boolean;
    hasDirectHistory?: (hostId: string, viewerId: string) => boolean;
    idFactory?: () => string;
    persistenceFilePath?: string;
    initialState?: PublicPostingsState;
    onStateChanged?: (state: PublicPostingsState) => void;
  }>
): Readonly<{
  list(type?: unknown, viewer?: SessionLike): Result<ReadonlyArray<Posting>>;
  eraseUser(userId: string): void;
  listAll(type?: unknown): Result<ReadonlyArray<Posting>>;
  create(session: SessionLike, input: PostingInput): Result<Posting>;
  inviteToEvent(session: SessionLike, postingId: unknown, targetUserId: unknown, expiresAtMs?: unknown): Result<EventInvite>;
  respondToEventInvite(session: SessionLike, postingId: unknown, accept: unknown): Result<Posting>;
  requestToJoinEvent(session: SessionLike, postingId: unknown): Result<Posting>;
  respondToEventJoinRequest(session: SessionLike, postingId: unknown, targetUserId: unknown, accept: unknown): Result<Posting>;
  removeGroupAttendee(session: SessionLike, postingId: unknown, userId: unknown): Result<{ ok: true }>;
  cancelGroup(session: SessionLike, postingId: unknown): Result<{ postingId: string }>;
  listGroupDiscussion(session: SessionLike, postingId: unknown): Result<readonly GroupDiscussionMessage[]>;
  sendGroupMessage(session: SessionLike, postingId: unknown, input: unknown): Result<GroupDiscussionMessage>;
  listEventInvites(session: SessionLike): Result<ReadonlyArray<Posting>>;
  approve(adminSession: SessionLike, postingId: unknown, reason?: unknown): Result<Posting>;
  reject(adminSession: SessionLike, postingId: unknown, reason?: unknown): Result<Posting>;
  remove(postingId: unknown): Result<{ postingId: string }>;
}> {
  const nowMs = deps?.nowMs ?? (() => Date.now());
  const idFactory = deps?.idFactory ?? (() => `post_${Math.random().toString(16).slice(2)}_${Date.now()}`);
  const posts: Array<Posting> = [];
  const groupDiscussions = new Map<string, readonly GroupDiscussionMessage[]>();

  const persistenceFilePath = deps?.persistenceFilePath;
  const onStateChanged = deps?.onStateChanged;

  function snapshotStateInternal(): PublicPostingsState {
    return { posts: [...posts], groupDiscussions: Object.fromEntries(groupDiscussions) };
  }

  function notifyStateChanged(): void {
    if (!onStateChanged) return;
    try {
      onStateChanged(snapshotStateInternal());
    } catch {
      // hooks are best effort
    }
  }

  function persistState(): void {
    if (!persistenceFilePath) {
      notifyStateChanged();
      return;
    }
    const dir = path.dirname(persistenceFilePath);
    fs.mkdirSync(dir, { recursive: true });
    const temporaryPath = `${persistenceFilePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 1, ...snapshotStateInternal() }), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, persistenceFilePath);
    notifyStateChanged();
  }

  function saveAttendance(index: number, updated: Posting): Posting {
    const previous = posts[index];
    posts[index] = updated;
    try {
      persistState();
    } catch (error) {
      posts[index] = previous;
      throw error;
    }
    return updated;
  }

  function loadState(): void {
    const initial = deps?.initialState;
    if (initial && Array.isArray(initial.posts)) {
      posts.splice(0, posts.length, ...initial.posts);
      loadDiscussions(initial.groupDiscussions);
      return;
    }
    if (!persistenceFilePath) return;
    if (!fs.existsSync(persistenceFilePath)) return;
    const raw = fs.readFileSync(persistenceFilePath, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as { version?: unknown; posts?: unknown; groupDiscussions?: PublicPostingsState["groupDiscussions"] };
    if (parsed.version !== 1 || !Array.isArray(parsed.posts)) return;
    posts.splice(0, posts.length, ...(parsed.posts as Posting[]));
    loadDiscussions(parsed.groupDiscussions);
  }

  function loadDiscussions(stored?: PublicPostingsState["groupDiscussions"]): void {
    for (const posting of posts) {
      const messages = stored?.[posting.postingId];
      if (posting.type === "event" && Array.isArray(messages)) groupDiscussions.set(posting.postingId, messages);
    }
  }

  function isEventExpired(posting: Posting): boolean {
    return posting.type === "event" && typeof posting.eventStartAtMs === "number" && posting.eventStartAtMs <= nowMs();
  }

  function isAdExpired(posting: Posting): boolean {
    if (posting.type !== "ad") return false;
    const maxAgeMs = 12 * 60 * 60 * 1000;
    return nowMs() - posting.createdAtMs >= maxAgeMs;
  }

  function pruneExpiredEvents(): void {
    const before = posts.length;
    for (let i = posts.length - 1; i >= 0; i -= 1) {
      if (isEventExpired(posts[i]) || isAdExpired(posts[i])) {
        groupDiscussions.delete(posts[i].postingId);
        posts.splice(i, 1);
      }
    }
    if (posts.length !== before) persistState();
  }

  function asOptionalCoordinate(value: unknown, min: number, max: number): number | undefined | null {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const n = Number(value.toFixed(6));
    if (n < min || n > max) return null;
    return n;
  }

  function canInteractWithEvent(posting: Posting, viewerId?: string): boolean {
    return posting.type !== "event" || !viewerId || deps?.blocked?.(posting.authorUserId, viewerId) !== true;
  }

  function authorizeGroupDiscussion(session: SessionLike, postingId: unknown): Result<{ posting: Posting; userId: string }> {
    const auth = requirePostingIdentity(session);
    if (!auth.ok) return auth;
    const id = asText(postingId);
    const { userId } = auth.value;
    const posting = posts.find(p => p.postingId === id && p.type === "event" &&
      p.moderationStatus === "approved" && !isEventExpired(p));
    if (!posting || !canInteractWithEvent(posting, userId) ||
        (posting.authorUserId !== userId && !posting.acceptedUserIds?.includes(userId))) {
      return err("POSTING_NOT_FOUND", "Group discussion is unavailable.");
    }
    return ok({ posting, userId });
  }

  function hostedGroupIndex(session: SessionLike, postingId: unknown): Result<number> {
    const auth = requirePostingIdentity(session);
    if (!auth.ok) return auth;
    const id = asText(postingId);
    const index = posts.findIndex(posting => posting.postingId === id && posting.type === "event" &&
      !isEventExpired(posting) && posting.authorUserId === auth.value.userId);
    return index < 0 ? err("POSTING_NOT_FOUND", "Group not found.") : ok(index);
  }

  function removePosting(index: number): { postingId: string } {
    const [posting] = posts.splice(index, 1);
    const messages = groupDiscussions.get(posting.postingId);
    groupDiscussions.delete(posting.postingId);
    try {
      persistState();
    } catch (error) {
      posts.splice(index, 0, posting);
      if (messages) groupDiscussions.set(posting.postingId, messages);
      throw error;
    }
    return { postingId: posting.postingId };
  }

  loadState();

  return {
    list(type?: unknown, viewer?: SessionLike): Result<ReadonlyArray<Posting>> {
      pruneExpiredEvents();
      const includeAll = viewer?.role === "admin";
      if (type === undefined) {
        const visible = posts.filter(p => (includeAll || p.moderationStatus === "approved") && canInteractWithEvent(p, viewer?.userId));
        return ok([...visible].sort((a, b) => b.createdAtMs - a.createdAtMs).map((p) => redactPostingForViewer(p, viewer, nowMs())));
      }
      const parsed = asType(type);
      if (!parsed) return err("POSTING_TYPE_NOT_ALLOWED", "Invalid posting type.");
      const filtered = posts.filter(p => p.type === parsed && canInteractWithEvent(p, viewer?.userId));
      const visible = includeAll ? filtered : filtered.filter((p) => p.moderationStatus === "approved");
      return ok(visible.sort((a, b) => b.createdAtMs - a.createdAtMs).map((p) => redactPostingForViewer(p, viewer, nowMs())));
    },

    eraseUser(userId) {
      const removed = new Set(posts.filter(post => post.authorUserId === userId).map(post => post.postingId));
      const remaining = posts.filter(post => !removed.has(post.postingId)).map(post => {
        const { [userId]: discarded, ...invites } = post.inviteExpiresAtByUserId ?? {};
        return { ...post, inviteExpiresAtByUserId: invites,
          invitedUserIds: post.invitedUserIds?.filter(id => id !== userId),
          acceptedUserIds: post.acceptedUserIds?.filter(id => id !== userId),
          joinRequestUserIds: post.joinRequestUserIds?.filter(id => id !== userId) };
      });
      posts.splice(0, posts.length, ...remaining);
      for (const [id, messages] of groupDiscussions) {
        if (removed.has(id)) groupDiscussions.delete(id);
        else groupDiscussions.set(id, messages.filter(message => message.authorUserId !== userId));
      }
      persistState();
    },

    listAll(type?: unknown): Result<ReadonlyArray<Posting>> {
      pruneExpiredEvents();
      if (type === undefined) {
        return ok([...posts].sort((a, b) => b.createdAtMs - a.createdAtMs).map(p => redactPostingForViewer(p, undefined, nowMs())));
      }
      const parsed = asType(type);
      if (!parsed) return err("POSTING_TYPE_NOT_ALLOWED", "Invalid posting type.");
      return ok(posts.filter((p) => p.type === parsed).sort((a, b) => b.createdAtMs - a.createdAtMs).map(p => redactPostingForViewer(p, undefined, nowMs())));
    },

    create(session: SessionLike, input: PostingInput): Result<Posting> {
      pruneExpiredEvents();
      const type = asType(input.type);
      if (!type) return err("POSTING_TYPE_NOT_ALLOWED", "Invalid posting type.");
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<Posting>;
      if (type === "ad" && !hasPlus(session, nowMs())) {
        return err("PLUS_REQUIRED", "Publishing postings requires Plus.");
      }
      const availability = input.availability;
      if (type === "ad" && availability !== undefined && !isPostingAvailability(availability)) {
        return err("INVALID_INPUT", "Choose Hosting or Travelling.");
      }

      const title = asText(input.title);
      if (!title) return err("INVALID_INPUT", "Title is required.");
      if (title.length > 120) return err("INVALID_INPUT", "Title is too long.", { max: 120 });
      if (containsDisallowedKidVariation(title)) {
        return err("INVALID_INPUT", "Title contains disallowed language.");
      }

      const board = input.board;
      if (board !== undefined && (type !== "ad" || !isPostingBoard(board))) {
        return err("INVALID_INPUT", "Choose a valid message board.");
      }
      const body = asText(input.body) ?? "";
      if (!body && board === undefined) return err("INVALID_INPUT", "Body is required.");
      if (body.length > 4000) return err("INVALID_INPUT", "Body is too long.", { max: 4000 });
      if (containsDisallowedKidVariation(body)) {
        return err("INVALID_INPUT", "Body contains disallowed language.");
      }
      const photoMediaId = asOptionalText(input.photoMediaId);
      if (photoMediaId === null) return err("INVALID_INPUT", "photoMediaId must be a string when provided.");
      if (typeof photoMediaId === "string" && photoMediaId.length > 200) {
        return err("INVALID_INPUT", "photoMediaId is too long.", { max: 200 });
      }
      const lat = asOptionalCoordinate(input.lat, -90, 90);
      const lng = asOptionalCoordinate(input.lng, -180, 180);
      if (lat === null) return err("INVALID_INPUT", "lat must be a valid latitude.");
      if (lng === null) return err("INVALID_INPUT", "lng must be a valid longitude.");
      const eventStartAtMs = asOptionalEpochMs(input.eventStartAtMs);
      if (eventStartAtMs === null) return err("INVALID_INPUT", "eventStartAtMs must be a positive epoch milliseconds number.");
      const locationInstructions = asOptionalText(input.locationInstructions);
      if (locationInstructions === null) return err("INVALID_INPUT", "locationInstructions must be a string when provided.");
      const groupDetails = asOptionalText(input.groupDetails);
      if (groupDetails === null) return err("INVALID_INPUT", "groupDetails must be a string when provided.");
      const guestLimit = input.guestLimit;
      const now = nowMs();
      const schedule = input.groupSchedule;
      const groupFormat = input.groupFormat;
      if (groupFormat !== undefined && (type !== "event" || !isGroupFormat(groupFormat) ||
          (groupFormat === "open-house" && schedule === undefined))) {
        return err("INVALID_INPUT", "Choose a valid group format and provide start and end times for Open House.");
      }
      if (schedule !== undefined && (type !== "event" || !validGroupSchedule(schedule, eventStartAtMs ?? undefined, now))) {
        return err("INVALID_INPUT", "Choose valid future dates for the weekly group schedule.");
      }
      if (type === "event") {
        if (guestLimit !== undefined && !validGuestLimit(guestLimit)) return err("INVALID_INPUT", "Guest limit must be a positive whole number.");
        if (eventStartAtMs === undefined || eventStartAtMs <= now) return err("INVALID_INPUT", "A future group end time is required.");
        if (typeof lat !== "number" || typeof lng !== "number") return err("INVALID_INPUT", "Group coordinates are required.");
        if (!locationInstructions) return err("INVALID_INPUT", "Location instructions are required for groups.");
        if (!groupDetails) return err("INVALID_INPUT", "Group details are required.");
      }

      const posting: Posting = {
        postingId: idFactory(),
        type,
        title,
        body,
        ...(isPostingBoard(board) ? { board } : {}),
        ...(photoMediaId ? { photoMediaId } : {}),
        ...(type === "ad" && isPostingAvailability(availability) ? { availability } : {}),
        ...(type === "event" && typeof lat === "number" ? { lat } : {}),
        ...(type === "event" && typeof lng === "number" ? { lng } : {}),
        ...(type === "event" && typeof eventStartAtMs === "number" ? { eventStartAtMs } : {}),
        ...(type === "event" && isGroupFormat(groupFormat) ? { groupFormat } : {}),
        ...(type === "event" && validGuestLimit(guestLimit) ? { guestLimit } : {}),
        ...(type === "event" && locationInstructions ? { locationInstructions } : {}),
        ...(type === "event" && groupDetails ? { groupDetails } : {}),
        authorUserId: auth.value.userId,
        createdAtMs: now,
        invitedUserIds: type === "event" ? [] : undefined,
        acceptedUserIds: type === "event" ? [] : undefined,
        joinRequestUserIds: type === "event" ? [] : undefined,
        moderationStatus: "approved",
        moderatedAtMs: now,
        moderatedByUserId: "system:auto"
      };
      const occurrences = Array.isArray(schedule) ? schedule.map((date, index): Posting => ({
        ...posting,
        postingId: index === 0 ? posting.postingId : idFactory(),
        eventStartAtMs: date.endsAtMs,
        groupStartsAtMs: date.startsAtMs,
        ...(schedule.length > 1 ? {
          groupSeriesId: posting.postingId,
          groupOccurrence: index + 1,
          groupOccurrenceCount: schedule.length
        } : {})
      })) : [posting];
      const previousLength = posts.length;
      posts.push(...occurrences);
      try {
        persistState();
      } catch (error) {
        posts.length = previousLength;
        throw error;
      }
      return ok(occurrences[0]);
    },

    inviteToEvent(session: SessionLike, postingId: unknown, targetUserId: unknown, expiresAtMs?: unknown): Result<EventInvite> {
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<EventInvite>;
      const eventId = asText(postingId);
      const invitedUserId = asText(targetUserId);
      if (!eventId || !invitedUserId) {
        return err("INVALID_INPUT", "Event and target user are required.");
      }
      const idx = posts.findIndex((p) => p.postingId === eventId && p.type === "event" && p.moderationStatus === "approved" && !isEventExpired(p));
      if (idx < 0) return err("POSTING_NOT_FOUND", "Event not found.");
      const existing = posts[idx];
      if (existing.authorUserId !== auth.value.userId) {
        return err("UNAUTHORIZED_ACTION", "Only the event host can invite users.");
      }
      if (invitedUserId === existing.authorUserId) {
        return err("INVALID_INPUT", "Host cannot invite self.");
      }
      if (!canInteractWithEvent(existing, invitedUserId)) return err("UNAUTHORIZED_ACTION", "This invitation is unavailable.");
      const now = nowMs();
      const deadline = resolveGroupInvitationDeadline(existing, expiresAtMs, now);
      if (deadline === undefined) return err("INVALID_INPUT", "Choose an invitation deadline in the future, before or at the group end.");
      const invited = new Set(existing.invitedUserIds ?? []);
      invited.add(invitedUserId);
      saveAttendance(idx, {
        ...existing,
        invitedUserIds: [...invited].sort(),
        inviteExpiresAtByUserId: { ...existing.inviteExpiresAtByUserId, [invitedUserId]: deadline }
      });
      return ok({
        postingId: existing.postingId,
        invitedUserId,
        invitedByUserId: existing.authorUserId,
        createdAtMs: now,
        expiresAtMs: deadline
      });
    },

    respondToEventInvite(session: SessionLike, postingId: unknown, accept: unknown): Result<Posting> {
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<Posting>;
      const eventId = asText(postingId);
      if (!eventId || typeof accept !== "boolean") {
        return err("INVALID_INPUT", "Invalid event response.");
      }
      const idx = posts.findIndex((p) => p.postingId === eventId && p.type === "event" && p.moderationStatus === "approved" && !isEventExpired(p));
      if (idx < 0) return err("POSTING_NOT_FOUND", "Event not found.");
      const existing = posts[idx];
      if (!canInteractWithEvent(existing, auth.value.userId)) return err("POSTING_NOT_FOUND", "Event not found.");
      const invited = new Set(existing.invitedUserIds ?? []);
      const accepted = new Set(existing.acceptedUserIds ?? []);
      const requests = new Set(existing.joinRequestUserIds ?? []);
      if (accept && !accepted.has(auth.value.userId) && !hasActiveGroupInvitation(existing, auth.value.userId, nowMs())) {
        return err("UNAUTHORIZED_ACTION", "This invitation is unavailable or has expired.");
      }
      if (!accept && !invited.has(auth.value.userId) && !accepted.has(auth.value.userId) && !requests.has(auth.value.userId)) {
        return err("UNAUTHORIZED_ACTION", "You are not invited to this event.");
      }
      const deadlines = { ...existing.inviteExpiresAtByUserId };
      if (!accept) {
        delete deadlines[auth.value.userId];
        accepted.delete(auth.value.userId);
        invited.delete(auth.value.userId);
        requests.delete(auth.value.userId);
      } else if (!accepted.has(auth.value.userId) && (groupIsFull(existing) || requests.has(auth.value.userId))) {
        requests.add(auth.value.userId);
      } else {
        accepted.add(auth.value.userId);
      }
      const updated = saveAttendance(idx, {
        ...existing,
        invitedUserIds: Array.from(invited.values()).sort(),
        acceptedUserIds: Array.from(accepted.values()).sort(),
        inviteExpiresAtByUserId: deadlines,
        joinRequestUserIds: [...requests]
      });
      return ok(redactPostingForViewer(updated, session, nowMs()));
    },

    requestToJoinEvent(session: SessionLike, postingId: unknown): Result<Posting> {
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<Posting>;
      const eventId = asText(postingId);
      if (!eventId) return err("INVALID_INPUT", "Event is required.");
      const idx = posts.findIndex((p) => p.postingId === eventId && p.type === "event" && p.moderationStatus === "approved" && !isEventExpired(p));
      if (idx < 0) return err("POSTING_NOT_FOUND", "Event not found.");
      const existing = posts[idx];
      if (!canInteractWithEvent(existing, auth.value.userId)) return err("POSTING_NOT_FOUND", "Event not found.");
      if (existing.authorUserId === auth.value.userId) {
        return err("INVALID_INPUT", "Host is already attending.");
      }
      const accepted = new Set(existing.acceptedUserIds ?? []);
      if (accepted.has(auth.value.userId)) {
        return err("INVALID_INPUT", "You are already marked attending.");
      }
      if (deps?.hasDirectHistory && !deps.hasDirectHistory(existing.authorUserId, auth.value.userId)) {
        return err("UNAUTHORIZED_ACTION", "Chat with the host before requesting to join.");
      }
      const requests = new Set(existing.joinRequestUserIds ?? []);
      if (requests.has(auth.value.userId)) {
        return err("INVALID_INPUT", "Join request already sent.");
      }
      requests.add(auth.value.userId);
      const updated = saveAttendance(idx, {
        ...existing,
        joinRequestUserIds: Array.from(requests.values()).sort(),
        invitedUserIds: [...(existing.invitedUserIds ?? [])],
        acceptedUserIds: [...(existing.acceptedUserIds ?? [])]
      });
      return ok(redactPostingForViewer(updated, session, nowMs()));
    },

    respondToEventJoinRequest(session: SessionLike, postingId: unknown, targetUserId: unknown, accept: unknown): Result<Posting> {
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<Posting>;
      const eventId = asText(postingId);
      const candidateUserId = asText(targetUserId);
      if (!eventId || !candidateUserId || typeof accept !== "boolean") {
        return err("INVALID_INPUT", "Invalid join request response.");
      }
      const idx = posts.findIndex((p) => p.postingId === eventId && p.type === "event" && p.moderationStatus === "approved" && !isEventExpired(p));
      if (idx < 0) return err("POSTING_NOT_FOUND", "Event not found.");
      const existing = posts[idx];
      if (existing.authorUserId !== auth.value.userId) {
        return err("UNAUTHORIZED_ACTION", "Only the event host can respond to join requests.");
      }
      if (accept && !canInteractWithEvent(existing, candidateUserId)) return err("UNAUTHORIZED_ACTION", "This request is unavailable.");
      const requests = new Set(existing.joinRequestUserIds ?? []);
      if (!requests.has(candidateUserId)) {
        return err("INVALID_INPUT", "No pending join request for this user.");
      }
      if (accept && groupIsFull(existing)) {
        return err("INVALID_INPUT", "This group is full. The request will stay on the waitlist.");
      }
      requests.delete(candidateUserId);
      const invited = new Set(existing.invitedUserIds ?? []);
      const accepted = new Set(existing.acceptedUserIds ?? []);
      if (accept) {
        invited.add(candidateUserId);
        accepted.add(candidateUserId);
      } else {
        invited.delete(candidateUserId);
        accepted.delete(candidateUserId);
      }
      const updated = saveAttendance(idx, {
        ...existing,
        joinRequestUserIds: Array.from(requests.values()).sort(),
        invitedUserIds: Array.from(invited.values()).sort(),
        acceptedUserIds: Array.from(accepted.values()).sort()
      });
      return ok(redactPostingForViewer(updated, session, nowMs()));
    },

    removeGroupAttendee(session, postingId, targetUserId) {
      const auth = hostedGroupIndex(session, postingId);
      if (!auth.ok) return auth;
      const group = posts[auth.value];
      const userId = asText(targetUserId);
      if (!userId || !group.acceptedUserIds?.includes(userId)) {
        return err("INVALID_INPUT", "Choose an approved attendee.");
      }
      const deadlines = { ...group.inviteExpiresAtByUserId };
      delete deadlines[userId];
      saveAttendance(auth.value, {
        ...group,
        acceptedUserIds: group.acceptedUserIds.filter(id => id !== userId),
        invitedUserIds: group.invitedUserIds?.filter(id => id !== userId),
        joinRequestUserIds: group.joinRequestUserIds?.filter(id => id !== userId),
        inviteExpiresAtByUserId: deadlines
      });
      return ok({ ok: true });
    },

    cancelGroup(session, postingId) {
      const auth = hostedGroupIndex(session, postingId);
      return auth.ok ? ok(removePosting(auth.value)) : auth;
    },

    listGroupDiscussion(session, postingId) {
      const auth = authorizeGroupDiscussion(session, postingId);
      if (!auth.ok) return auth;
      const { posting, userId } = auth.value;
      return ok((groupDiscussions.get(posting.postingId) ?? []).filter(message =>
        !deps?.blocked?.(message.authorUserId, userId)));
    },

    sendGroupMessage(session, postingId, input) {
      const auth = authorizeGroupDiscussion(session, postingId);
      if (!auth.ok) return auth;
      const { posting, userId } = auth.value;
      const text = asText(input);
      if (!text || text.length > GROUP_MESSAGE_MAX_LENGTH || containsDisallowedKidVariation(text)) {
        return err("INVALID_INPUT", `Enter a valid message of up to ${GROUP_MESSAGE_MAX_LENGTH} characters.`);
      }
      const previous = groupDiscussions.get(posting.postingId);
      const messages = previous ?? [];
      const now = nowMs();
      if (messages.filter(message => message.authorUserId === userId && now - message.createdAtMs < 60_000).length >= 20) {
        return err("RATE_LIMITED", "Wait before sending another message.");
      }
      const message = { messageId: randomUUID(), authorUserId: userId, text, createdAtMs: now };
      groupDiscussions.set(posting.postingId, [...messages, message].slice(-100));
      try {
        persistState();
      } catch (error) {
        if (previous) groupDiscussions.set(posting.postingId, previous);
        else groupDiscussions.delete(posting.postingId);
        throw error;
      }
      return ok(message);
    },

    listEventInvites(session: SessionLike): Result<ReadonlyArray<Posting>> {
      pruneExpiredEvents();
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<ReadonlyArray<Posting>>;
      const invitedEvents = posts
        .filter((p) => p.type === "event")
        .filter((p) => p.moderationStatus === "approved")
        .filter(p => canInteractWithEvent(p, auth.value.userId) && hasActiveGroupInvitation(p, auth.value.userId, nowMs()))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      return ok(invitedEvents.map(p => redactPostingForViewer(p, session, nowMs())));
    },

    approve(adminSession: SessionLike, postingId: unknown, reason?: unknown): Result<Posting> {
      const id = asText(postingId);
      if (!id) return err("INVALID_INPUT", "Posting id is required.");
      const idx = posts.findIndex((p) => p.postingId === id);
      if (idx < 0) return err("POSTING_NOT_FOUND", "Posting not found.");
      const adminUserId = typeof adminSession.userId === "string" && adminSession.userId.trim() ? adminSession.userId : "system";
      const reasonText = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : undefined;
      posts[idx] = {
        ...posts[idx],
        moderationStatus: "approved",
        moderatedAtMs: nowMs(),
        moderatedByUserId: adminUserId,
        ...(reasonText ? { moderationReason: reasonText } : {})
      };
      persistState();
      return ok(redactPostingForViewer(posts[idx], adminSession, nowMs()));
    },

    reject(adminSession: SessionLike, postingId: unknown, reason?: unknown): Result<Posting> {
      const id = asText(postingId);
      if (!id) return err("INVALID_INPUT", "Posting id is required.");
      const idx = posts.findIndex((p) => p.postingId === id);
      if (idx < 0) return err("POSTING_NOT_FOUND", "Posting not found.");
      const adminUserId = typeof adminSession.userId === "string" && adminSession.userId.trim() ? adminSession.userId : "system";
      const reasonText = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : undefined;
      posts[idx] = {
        ...posts[idx],
        moderationStatus: "rejected",
        moderatedAtMs: nowMs(),
        moderatedByUserId: adminUserId,
        ...(reasonText ? { moderationReason: reasonText } : {})
      };
      persistState();
      return ok(redactPostingForViewer(posts[idx], adminSession, nowMs()));
    },

    remove(postingId: unknown): Result<{ postingId: string }> {
      const id = asText(postingId);
      if (!id) return err("INVALID_INPUT", "Posting id is required.");
      const idx = posts.findIndex((p) => p.postingId === id);
      if (idx < 0) return err("POSTING_NOT_FOUND", "Posting not found.");
      return ok(removePosting(idx));
    }
  };
}
