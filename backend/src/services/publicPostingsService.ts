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
}>;

export type Posting = Readonly<{
  postingId: string;
  type: PostingType;
  title: string;
  body: string;
  photoMediaId?: string;
  authorUserId: string;
  createdAtMs: number;
  invitedUserIds?: ReadonlyArray<string>;
  acceptedUserIds?: ReadonlyArray<string>;
}>;

export type PostingInput = Readonly<{
  type: unknown;
  title: unknown;
  body: unknown;
  photoMediaId?: unknown;
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

export function createPublicPostingsService(deps?: Readonly<{ nowMs?: () => number; idFactory?: () => string }>): Readonly<{
  list(type?: unknown): Result<ReadonlyArray<Posting>>;
  create(session: SessionLike, input: PostingInput): Result<Posting>;
  inviteToEvent(session: SessionLike, postingId: unknown, targetUserId: unknown): Result<EventInvite>;
  respondToEventInvite(session: SessionLike, postingId: unknown, accept: unknown): Result<Posting>;
  listEventInvites(session: SessionLike): Result<ReadonlyArray<Posting>>;
}> {
  const nowMs = deps?.nowMs ?? (() => Date.now());
  const idFactory = deps?.idFactory ?? (() => `post_${Math.random().toString(16).slice(2)}_${Date.now()}`);
  const posts: Array<Posting> = [];

  return {
    list(type?: unknown): Result<ReadonlyArray<Posting>> {
      if (type === undefined) {
        return ok([...posts].sort((a, b) => b.createdAtMs - a.createdAtMs));
      }
      const parsed = asType(type);
      if (!parsed) return err("POSTING_TYPE_NOT_ALLOWED", "Invalid posting type.");
      return ok(posts.filter((p) => p.type === parsed).sort((a, b) => b.createdAtMs - a.createdAtMs));
    },

    create(session: SessionLike, input: PostingInput): Result<Posting> {
      const type = asType(input.type);
      if (!type) return err("POSTING_TYPE_NOT_ALLOWED", "Invalid posting type.");
      const auth = type === "ad" ? authorKeyForAds(session) : requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<Posting>;

      const title = asText(input.title);
      if (!title) return err("INVALID_INPUT", "Title is required.");
      if (title.length > 120) return err("INVALID_INPUT", "Title is too long.", { max: 120 });

      const body = asText(input.body);
      if (!body) return err("INVALID_INPUT", "Body is required.");
      if (body.length > 4000) return err("INVALID_INPUT", "Body is too long.", { max: 4000 });
      const photoMediaId = asOptionalText(input.photoMediaId);
      if (photoMediaId === null) return err("INVALID_INPUT", "photoMediaId must be a string when provided.");
      if (typeof photoMediaId === "string" && photoMediaId.length > 200) {
        return err("INVALID_INPUT", "photoMediaId is too long.", { max: 200 });
      }

      const posting: Posting = {
        postingId: idFactory(),
        type,
        title,
        body,
        ...(photoMediaId ? { photoMediaId } : {}),
        authorUserId: auth.value.userId,
        createdAtMs: nowMs(),
        invitedUserIds: type === "event" ? [] : undefined,
        acceptedUserIds: type === "event" ? [] : undefined
      };
      posts.push(posting);
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
        acceptedUserIds: Array.from(accepted.values()).sort()
      };
      return ok(posts[idx]);
    },

    listEventInvites(session: SessionLike): Result<ReadonlyArray<Posting>> {
      const auth = requirePostingIdentity(session);
      if (!auth.ok) return auth as Result<ReadonlyArray<Posting>>;
      const invitedEvents = posts
        .filter((p) => p.type === "event")
        .filter((p) => (p.invitedUserIds ?? []).includes(auth.value.userId))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      return ok(invitedEvents);
    }
  };
}
