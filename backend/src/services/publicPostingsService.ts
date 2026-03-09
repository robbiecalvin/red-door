import fs from "node:fs";
import path from "node:path";

import { containsDisallowedKidVariation } from "./contentPolicy";

export type PostingType = "ad" | "event";

export type ErrorCode =
  | "ANONYMOUS_FORBIDDEN"
  | "AGE_GATE_REQUIRED"
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
}>;

export type ModerationStatus = "pending" | "approved" | "rejected";

export type Posting = Readonly<{
  postingId: string;
  type: PostingType;
  title: string;
  body: string;
  photoMediaId?: string;
  lat?: number;
  lng?: number;
  eventStartAtMs?: number;
  locationInstructions?: string;
  groupDetails?: string;
  authorUserId: string;
  createdAtMs: number;
  invitedUserIds?: ReadonlyArray<string>;
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
  lat?: unknown;
  lng?: unknown;
  eventStartAtMs?: unknown;
  locationInstructions?: unknown;
  groupDetails?: unknown;
}>;

export type PublicPostingsState = Readonly<{
  posts: ReadonlyArray<Posting>;
}>;

export type EventInvite = Readonly<{
  postingId: string;
  invitedUserId: string;
  invitedByUserId: string;
  createdAtMs: number;
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
    return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
  }
  if (typeof session.userId !== "string" || session.userId.trim() === "") {
    return err("INVALID_INPUT", "Invalid user identity.");
  }
  return ok({ userId: session.userId });
}

function requireAge(session: SessionLike): Result<void> {
  if (session.ageVerified !== true) {
    return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
  }
  return ok(undefined);
}

function authorKeyForAds(session: SessionLike): Result<{ userId: string }> {
  if (session.userType === "guest") {
    const token = asText(session.sessionToken);
    return ok({ userId: token ? `guest:${token}` : "guest:anonymous" });
  }
  const userId = asText(session.userId);
  if (!userId) return err("INVALID_INPUT", "Invalid user identity.");
  return ok({ userId });
}

function asOptionalEpochMs(value: unknown): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  if (n <= 0) return null;
  return n;
}

function asViewerUserId(viewer?: SessionLike): string | null {
  if (!viewer || viewer.userType === "guest") return null;
  return asText(viewer.userId);
}

function redactPostingForViewer(posting: Posting, viewer?: SessionLike): Posting {
  if (posting.type !== "event" || typeof posting.locationInstructions !== "string") return posting;
  const viewerUserId = asViewerUserId(viewer);
  const canSeeLocation =
    viewerUserId !== null &&
    (viewerUserId === posting.authorUserId || (posting.acceptedUserIds ?? []).includes(viewerUserId));
  if (canSeeLocation) return posting;
  const redacted = { ...posting };
  delete (redacted as { locationInstructions?: string }).locationInstructions;
  return redacted;
}

export function createPublicPostingsService(
  deps?: Readonly<{
    nowMs?: () => number;
    idFactory?: () => string;
    persistenceFilePath?: string;
    initialState?: PublicPostingsState;
    onStateChanged?: (state: PublicPostingsState) => void;
  }>
): Readonly<{
  list(type?: unknown, viewer?: SessionLike): Result<ReadonlyArray<Posting>>;
  listAll(type?: unknown): Result<ReadonlyArray<Posting>>;
  create(session: SessionLike, input: PostingInput): Result<Posting>;
  inviteToEvent(session: SessionLike, postingId: unknown, targetUserId: unknown): Result<EventInvite>;
  respondToEventInvite(session: SessionLike, postingId: unknown, accept: unknown): Result<Posting>;
  requestToJoinEvent(session: SessionLike, postingId: unknown): Result<Posting>;
  respondToEventJoinRequest(session: SessionLike, postingId: unknown, targetUserId: unknown, accept: unknown): Result<Posting>;
  listEventInvites(session: SessionLike): Result<ReadonlyArray<Posting>>;
  approve(adminSession: SessionLike, postingId: unknown, reason?: unknown): Result<Posting>;
  reject(adminSession: SessionLike, postingId: unknown, reason?: unknown): Result<Posting>;
  remove(postingId: unknown): Result<{ postingId: string }>;
}> {
  const nowMs = deps?.nowMs ?? (() => Date.now());
  const idFactory = deps?.idFactory ?? (() => `post_${Math.random().toString(16).slice(2)}_${Date.now()}`);
  const posts: Array<Posting> = [];

  const persistenceFilePath = deps?.persistenceFilePath;
  const onStateChanged = deps?.onStateChanged;

  function snapshotStateInternal(): PublicPostingsState {
    return { posts: [...posts] };
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
    fs.writeFileSync(
      persistenceFilePath,
      JSON.stringify({ version: 1, posts: [...posts] }),
      "utf8"
    );
    notifyStateChanged();
  }

  function loadState(): void {
    const initial = deps?.initialState;
    if (initial && Array.isArray(initial.posts)) {
      posts.splice(0, posts.length, ...initial.posts);
      return;
    }
    if (!persistenceFilePath) return;
    if (!fs.existsSync(persistenceFilePath)) return;
    const raw = fs.readFileSync(persistenceFilePath, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as { version?: unknown; posts?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.posts)) return;
    posts.splice(0, posts.length, ...(parsed.posts as Posting[]));
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
      if (isEventExpired(posts[i]) || isAdExpired(posts[i])) posts.splice(i, 1);
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

  loadState();

  return {
    list(type?: unknown, viewer?: SessionLike): Result<ReadonlyArray<Posting>> {
      pruneExpiredEvents();
      const includeAll = viewer?.role === "admin";
      if (type === undefined) {
        const visible = includeAll ? posts : posts.filter((p) => p.moderationStatus === "approved");
        return ok([...visible].sort((a, b) => b.createdAtMs - a.createdAtMs).map((p) => redactPostingForViewer(p, viewer)));
      }
      const parsed = asType(type);
      if (!parsed) return err("POSTING_TYPE_NOT_ALLOWED", "Invalid posting type.");
      const filtered = posts.filter((p) => p.type === parsed);
      const visible = includeAll ? filtered : filtered.filter((p) => p.moderationStatus === "approved");
      return ok(visible.sort((a, b) => b.createdAtMs - a.createdAtMs).map((p) => redactPostingForViewer(p, viewer)));
    },

    listAll(type?: unknown): Result<ReadonlyArray<Posting>> {
      pruneExpiredEvents();
      if (type === undefined) {
        return ok([...posts].sort((a, b) => b.createdAtMs - a.createdAtMs));
      }
      const parsed = asType(type);
      if (!parsed) return err("POSTING_TYPE_NOT_ALLOWED", "Invalid posting type.");
      return ok(posts.filter((p) => p.type === parsed).sort((a, b) => b.createdAtMs - a.createdAtMs));
    },

    create(session: SessionLike, input: PostingInput): Result<Posting> {
      pruneExpiredEvents();
      const type = asType(input.type);
      if (!type) return err("POSTING_TYPE_NOT_ALLOWED", "Invalid posting type.");
      const auth = type === "ad" ? authorKeyForAds(session) : requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<Posting>;

      const title = asText(input.title);
      if (!title) return err("INVALID_INPUT", "Title is required.");
      if (title.length > 120) return err("INVALID_INPUT", "Title is too long.", { max: 120 });
      if (containsDisallowedKidVariation(title)) {
        return err("INVALID_INPUT", "Title contains disallowed language.");
      }

      const body = asText(input.body);
      if (!body) return err("INVALID_INPUT", "Body is required.");
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
      if (type === "event") {
        if (eventStartAtMs === undefined) return err("INVALID_INPUT", "Group end date and time are required.");
        if (typeof lat !== "number" || typeof lng !== "number") return err("INVALID_INPUT", "Group coordinates are required.");
        if (!locationInstructions) return err("INVALID_INPUT", "Location instructions are required for groups.");
        if (!groupDetails) return err("INVALID_INPUT", "Group details are required.");
      }

      const posting: Posting = {
        postingId: idFactory(),
        type,
        title,
        body,
        ...(photoMediaId ? { photoMediaId } : {}),
        ...(type === "event" && typeof lat === "number" ? { lat } : {}),
        ...(type === "event" && typeof lng === "number" ? { lng } : {}),
        ...(type === "event" && typeof eventStartAtMs === "number" ? { eventStartAtMs } : {}),
        ...(type === "event" && locationInstructions ? { locationInstructions } : {}),
        ...(type === "event" && groupDetails ? { groupDetails } : {}),
        authorUserId: auth.value.userId,
        createdAtMs: nowMs(),
        invitedUserIds: type === "event" ? [] : undefined,
        acceptedUserIds: type === "event" ? [] : undefined,
        joinRequestUserIds: type === "event" ? [] : undefined,
        moderationStatus: "approved",
        moderatedAtMs: nowMs(),
        moderatedByUserId: "system:auto"
      };
      posts.push(posting);
      persistState();
      return ok(posting);
    },

    inviteToEvent(session: SessionLike, postingId: unknown, targetUserId: unknown): Result<EventInvite> {
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<EventInvite>;
      const eventId = asText(postingId);
      const invitedUserId = asText(targetUserId);
      if (!eventId || !invitedUserId) {
        return err("INVALID_INPUT", "Event and target user are required.");
      }
      const idx = posts.findIndex((p) => p.postingId === eventId && p.type === "event");
      if (idx < 0) return err("POSTING_NOT_FOUND", "Event not found.");
      const existing = posts[idx];
      if (existing.authorUserId !== auth.value.userId) {
        return err("UNAUTHORIZED_ACTION", "Only the event host can invite users.");
      }
      if (invitedUserId === existing.authorUserId) {
        return err("INVALID_INPUT", "Host cannot invite self.");
      }
      const invited = new Set(existing.invitedUserIds ?? []);
      invited.add(invitedUserId);
      posts[idx] = {
        ...existing,
        invitedUserIds: Array.from(invited.values()).sort(),
        acceptedUserIds: [...(existing.acceptedUserIds ?? [])]
      };
      persistState();
      return ok({
        postingId: existing.postingId,
        invitedUserId,
        invitedByUserId: existing.authorUserId,
        createdAtMs: nowMs()
      });
    },

    respondToEventInvite(session: SessionLike, postingId: unknown, accept: unknown): Result<Posting> {
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<Posting>;
      const eventId = asText(postingId);
      if (!eventId || typeof accept !== "boolean") {
        return err("INVALID_INPUT", "Invalid event response.");
      }
      const idx = posts.findIndex((p) => p.postingId === eventId && p.type === "event");
      if (idx < 0) return err("POSTING_NOT_FOUND", "Event not found.");
      const existing = posts[idx];
      const invited = new Set(existing.invitedUserIds ?? []);
      if (!invited.has(auth.value.userId)) {
        return err("UNAUTHORIZED_ACTION", "You are not invited to this event.");
      }
      const accepted = new Set(existing.acceptedUserIds ?? []);
      if (accept) {
        accepted.add(auth.value.userId);
      } else {
        accepted.delete(auth.value.userId);
      }
      posts[idx] = {
        ...existing,
        invitedUserIds: Array.from(invited.values()).sort(),
        acceptedUserIds: Array.from(accepted.values()).sort(),
        joinRequestUserIds: [...(existing.joinRequestUserIds ?? [])]
      };
      persistState();
      return ok(posts[idx]);
    },

    requestToJoinEvent(session: SessionLike, postingId: unknown): Result<Posting> {
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<Posting>;
      const eventId = asText(postingId);
      if (!eventId) return err("INVALID_INPUT", "Event is required.");
      const idx = posts.findIndex((p) => p.postingId === eventId && p.type === "event");
      if (idx < 0) return err("POSTING_NOT_FOUND", "Event not found.");
      const existing = posts[idx];
      if (existing.authorUserId === auth.value.userId) {
        return err("INVALID_INPUT", "Host is already attending.");
      }
      const accepted = new Set(existing.acceptedUserIds ?? []);
      if (accepted.has(auth.value.userId)) {
        return err("INVALID_INPUT", "You are already marked attending.");
      }
      const requests = new Set(existing.joinRequestUserIds ?? []);
      if (requests.has(auth.value.userId)) {
        return err("INVALID_INPUT", "Join request already sent.");
      }
      requests.add(auth.value.userId);
      posts[idx] = {
        ...existing,
        joinRequestUserIds: Array.from(requests.values()).sort(),
        invitedUserIds: [...(existing.invitedUserIds ?? [])],
        acceptedUserIds: [...(existing.acceptedUserIds ?? [])]
      };
      persistState();
      return ok(posts[idx]);
    },

    respondToEventJoinRequest(session: SessionLike, postingId: unknown, targetUserId: unknown, accept: unknown): Result<Posting> {
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<Posting>;
      const eventId = asText(postingId);
      const candidateUserId = asText(targetUserId);
      if (!eventId || !candidateUserId || typeof accept !== "boolean") {
        return err("INVALID_INPUT", "Invalid join request response.");
      }
      const idx = posts.findIndex((p) => p.postingId === eventId && p.type === "event");
      if (idx < 0) return err("POSTING_NOT_FOUND", "Event not found.");
      const existing = posts[idx];
      if (existing.authorUserId !== auth.value.userId) {
        return err("UNAUTHORIZED_ACTION", "Only the event host can respond to join requests.");
      }
      const requests = new Set(existing.joinRequestUserIds ?? []);
      if (!requests.has(candidateUserId)) {
        return err("INVALID_INPUT", "No pending join request for this user.");
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
      posts[idx] = {
        ...existing,
        joinRequestUserIds: Array.from(requests.values()).sort(),
        invitedUserIds: Array.from(invited.values()).sort(),
        acceptedUserIds: Array.from(accepted.values()).sort()
      };
      persistState();
      return ok(posts[idx]);
    },

    listEventInvites(session: SessionLike): Result<ReadonlyArray<Posting>> {
      pruneExpiredEvents();
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<ReadonlyArray<Posting>>;
      const invitedEvents = posts
        .filter((p) => p.type === "event")
        .filter((p) => p.moderationStatus === "approved")
        .filter((p) => (p.invitedUserIds ?? []).includes(auth.value.userId))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      return ok(invitedEvents);
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
      return ok(posts[idx]);
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
      return ok(posts[idx]);
    },

    remove(postingId: unknown): Result<{ postingId: string }> {
      const id = asText(postingId);
      if (!id) return err("INVALID_INPUT", "Posting id is required.");
      const idx = posts.findIndex((p) => p.postingId === id);
      if (idx < 0) return err("POSTING_NOT_FOUND", "Posting not found.");
      posts.splice(idx, 1);
      persistState();
      return ok({ postingId: id });
    }
  };
}
