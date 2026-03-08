import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { containsDisallowedKidVariation } from "./contentPolicy";

export type Mode = "cruise" | "date" | "hybrid";
export type UserType = "guest" | "registered" | "subscriber";

export type ChatKind = "cruise" | "date";
export type ChatMediaKind = "image" | "video" | "audio";

export type ErrorCode =
  | "INVALID_SESSION"
  | "ANONYMOUS_FORBIDDEN"
  | "UNAUTHORIZED_ACTION"
  | "USER_BLOCKED"
  | "RATE_LIMITED"
  | "CHAT_EXPIRED"
  | "AGE_GATE_REQUIRED";

export type ServiceError = Readonly<{
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
}>;

type ResultOk<T> = { ok: true; value: T };
type ResultErr = { ok: false; error: ServiceError };
export type Result<T> = ResultOk<T> | ResultErr;

export type Session = Readonly<{
  sessionToken: string;
  userType: UserType;
  mode: Mode;
  userId?: string;
  ageVerified?: boolean;
}>;

export type ChatMessage = Readonly<{
  messageId: string;
  chatId: string;
  chatKind: ChatKind;
  fromKey: string;
  toKey: string;
  text: string;
  media?: Readonly<{
    kind: ChatMediaKind;
    objectKey: string;
    mimeType: string;
    durationSeconds?: number;
  }>;
  createdAtMs: number;
  deliveredAtMs?: number;
  readAtMs?: number;
  expiresAtMs?: number;
}>;

export type ChatThread = Readonly<{
  chatId: string;
  chatKind: ChatKind;
  aKey: string;
  bKey: string;
}>;

export type SendMessageInput = Readonly<{
  chatKind: ChatKind;
  toKey: string;
  text?: string;
  media?: Readonly<{
    kind: ChatMediaKind;
    objectKey: string;
    mimeType: string;
    durationSeconds?: number;
  }>;
}>;

export type ChatServiceDeps = Readonly<{
  nowMs?: () => number;
  cruiseRetentionHours?: number;
  rateLimitPerMinute?: number;
  maxHistoryDays?: number;
  persistenceFilePath?: string;
  initialState?: ChatPersistenceState;
  onStateChanged?: (state: ChatPersistenceState) => void;
  blockChecker?: Readonly<{
    isBlocked(fromKey: string, toKey: string): boolean;
  }>;
  matchChecker?: Readonly<{
    // For Date chat: must be mutually matched before messaging.
    isMatched(userA: string, userB: string): boolean;
  }>;
}>;

export type ChatService = Readonly<{
  sendMessage(session: Session, input: SendMessageInput): Result<ChatMessage>;
  listMessages(session: Session, chatKind: ChatKind, otherKey: string): Result<ReadonlyArray<ChatMessage>>;
  listThreads(session: Session, chatKind: ChatKind): Result<ReadonlyArray<Readonly<{ otherKey: string; lastMessage: ChatMessage }>>>;
  markRead(session: Session, chatKind: ChatKind, otherKey: string): Result<{ readAtMs: number }>;
  getThread(chatKind: ChatKind, aKey: string, bKey: string): ChatThread;
  snapshotState(): ChatPersistenceState;
}>;

export type ChatPersistenceState = Readonly<{
  threads: ReadonlyArray<Readonly<{ threadId: string; messages: ReadonlyArray<ChatMessage> }>>;
  readCursors: ReadonlyArray<Readonly<{ threadUserKey: string; readAtMs: number }>>;
}>;

const DEFAULT_CRUISE_RETENTION_HOURS = 72;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 20;
const DEFAULT_MAX_HISTORY_DAYS = 365;

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  const error: ServiceError = context ? { code, message, context } : { code, message };
  return { ok: false, error };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function normalizeKey(value: string): string {
  return value.trim();
}

function isCruiseSpotThreadKey(key: string): boolean {
  if (!key.startsWith("spot:")) return false;
  return key.slice("spot:".length).trim().length > 0;
}

function threadKey(chatKind: ChatKind, aKey: string, bKey: string): string {
  const a = normalizeKey(aKey);
  const b = normalizeKey(bKey);
  if (chatKind === "cruise" && isCruiseSpotThreadKey(a)) return `${chatKind}::${a}`;
  if (chatKind === "cruise" && isCruiseSpotThreadKey(b)) return `${chatKind}::${b}`;
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${chatKind}::${x}::${y}`;
}

function deriveFromKey(session: Session): string {
  // Guests may not have a userId; use session token as an ephemeral identity key.
  return session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
}

function isChatKind(value: unknown): value is ChatKind {
  return value === "cruise" || value === "date";
}

function canUseChatKind(sessionMode: Mode, chatKind: ChatKind): boolean {
  if (chatKind === "cruise") return sessionMode === "cruise" || sessionMode === "hybrid";
  return sessionMode === "date" || sessionMode === "hybrid";
}

function sanitizeText(text: string): string {
  const trimmed = text.trim();
  // Keep payloads small; exact limit is not defined, but WebSocket payload budget is <2kb.
  if (trimmed.length > 500) return trimmed.slice(0, 500);
  return trimmed;
}

function validateMediaAttachment(
  media: SendMessageInput["media"]
): Result<Readonly<{ kind: ChatMediaKind; objectKey: string; mimeType: string; durationSeconds?: number }> | null> {
  if (!media) return ok(null);
  if (media.kind !== "image" && media.kind !== "video" && media.kind !== "audio") {
    return err("UNAUTHORIZED_ACTION", "Invalid media attachment.");
  }
  if (!isNonEmptyString(media.objectKey)) {
    return err("UNAUTHORIZED_ACTION", "Invalid media attachment.");
  }
  if (!isNonEmptyString(media.mimeType)) {
    return err("UNAUTHORIZED_ACTION", "Invalid media attachment.");
  }
  const mimeType = media.mimeType.trim().toLowerCase();
  const kindMatchesMime =
    (media.kind === "image" && mimeType.startsWith("image/")) ||
    (media.kind === "video" && mimeType.startsWith("video/")) ||
    (media.kind === "audio" && mimeType.startsWith("audio/"));
  if (!kindMatchesMime) {
    return err("UNAUTHORIZED_ACTION", "Invalid media attachment.");
  }
  if (mimeType.length > 100 || media.objectKey.trim().length > 300) {
    return err("UNAUTHORIZED_ACTION", "Invalid media attachment.");
  }
  const durationSeconds = media.durationSeconds;
  if (durationSeconds !== undefined && (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 60 * 60 * 4)) {
    return err("UNAUTHORIZED_ACTION", "Invalid media attachment.");
  }
  return ok({
    kind: media.kind,
    objectKey: media.objectKey.trim(),
    mimeType,
    durationSeconds
  });
}

export function createChatService(deps: ChatServiceDeps = {}): ChatService {
  const nowMs = deps.nowMs ?? (() => Date.now());
  const cruiseRetentionHours = deps.cruiseRetentionHours ?? DEFAULT_CRUISE_RETENTION_HOURS;
  const rateLimitPerMinute = deps.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE;
  const maxHistoryDays = deps.maxHistoryDays ?? DEFAULT_MAX_HISTORY_DAYS;
  const persistenceFilePath = deps.persistenceFilePath;
  const onStateChanged = deps.onStateChanged;
  const blockChecker = deps.blockChecker;
  const matchChecker = deps.matchChecker;

  if (!Number.isFinite(cruiseRetentionHours) || cruiseRetentionHours <= 0) {
    throw new Error("chatService requires a positive cruiseRetentionHours.");
  }
  if (!Number.isFinite(rateLimitPerMinute) || rateLimitPerMinute <= 0) {
    throw new Error("chatService requires a positive rateLimitPerMinute.");
  }
  if (!Number.isFinite(maxHistoryDays) || maxHistoryDays <= 0) {
    throw new Error("chatService requires a positive maxHistoryDays.");
  }

  const messagesByThread = new Map<string, ChatMessage[]>();
  const readCursorByThreadUser = new Map<string, number>();
  const rateByFromKey = new Map<string, number[]>(); // fromKey -> timestamps (ms) in last minute
  const historyWindowMs = maxHistoryDays * 24 * 60 * 60 * 1000;

  function snapshotStateInternal(): ChatPersistenceState {
    return {
      threads: Array.from(messagesByThread.entries()).map(([threadId, messages]) => ({
        threadId,
        messages: [...messages]
      })),
      readCursors: Array.from(readCursorByThreadUser.entries()).map(([threadUserKey, readAtMs]) => ({
        threadUserKey,
        readAtMs
      }))
    };
  }

  function notifyStateChanged(): void {
    if (!onStateChanged) return;
    try {
      onStateChanged(snapshotStateInternal());
    } catch {
      // Persistence hooks are best-effort and must not break chat delivery.
    }
  }

  function persistMessages(): void {
    if (!persistenceFilePath) return;
    const dir = path.dirname(persistenceFilePath);
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      version: 1,
      threads: Array.from(messagesByThread.entries()).map(([threadId, messages]) => ({ threadId, messages })),
      readCursors: Array.from(readCursorByThreadUser.entries()).map(([threadUserKey, readAtMs]) => ({ threadUserKey, readAtMs }))
    };
    fs.writeFileSync(persistenceFilePath, JSON.stringify(payload), "utf8");
    notifyStateChanged();
  }

  function loadMessages(): void {
    if (!persistenceFilePath) return;
    if (!fs.existsSync(persistenceFilePath)) return;
    const raw = fs.readFileSync(persistenceFilePath, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as { version?: unknown; threads?: unknown; readCursors?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.threads)) return;
    for (const threadRow of parsed.threads) {
      if (typeof threadRow !== "object" || threadRow === null) continue;
      const row = threadRow as { threadId?: unknown; messages?: unknown };
      if (typeof row.threadId !== "string" || !Array.isArray(row.messages)) continue;
      const list = row.messages.filter((m) => {
        if (typeof m !== "object" || m === null) return false;
        const msg = m as Record<string, unknown>;
        const media = msg.media;
        const validMedia =
          media === undefined ||
          (typeof media === "object" &&
            media !== null &&
            ((media as Record<string, unknown>).kind === "image" ||
              (media as Record<string, unknown>).kind === "video" ||
              (media as Record<string, unknown>).kind === "audio") &&
            typeof (media as Record<string, unknown>).objectKey === "string" &&
            typeof (media as Record<string, unknown>).mimeType === "string" &&
            ((media as Record<string, unknown>).durationSeconds === undefined ||
              typeof (media as Record<string, unknown>).durationSeconds === "number"));
        return (
          typeof msg.messageId === "string" &&
          typeof msg.chatId === "string" &&
          (msg.chatKind === "cruise" || msg.chatKind === "date") &&
          typeof msg.fromKey === "string" &&
          typeof msg.toKey === "string" &&
          typeof msg.text === "string" &&
          typeof msg.createdAtMs === "number" &&
          validMedia
        );
      }) as ChatMessage[];
      if (list.length === 0) continue;
      messagesByThread.set(row.threadId, list.sort((a, b) => a.createdAtMs - b.createdAtMs));
    }
    if (Array.isArray(parsed.readCursors)) {
      for (const cursorRow of parsed.readCursors) {
        if (typeof cursorRow !== "object" || cursorRow === null) continue;
        const row = cursorRow as { threadUserKey?: unknown; readAtMs?: unknown };
        if (typeof row.threadUserKey !== "string") continue;
        if (typeof row.readAtMs !== "number" || !Number.isFinite(row.readAtMs)) continue;
        readCursorByThreadUser.set(row.threadUserKey, row.readAtMs);
      }
    }
  }

  function loadInitialState(state: ChatPersistenceState): void {
    for (const thread of state.threads) {
      if (!thread || typeof thread !== "object") continue;
      if (typeof thread.threadId !== "string" || !Array.isArray(thread.messages)) continue;
      const normalized = thread.messages
        .filter((m) => {
          return (
            typeof m === "object" &&
            m !== null &&
            typeof m.messageId === "string" &&
            typeof m.chatId === "string" &&
            (m.chatKind === "cruise" || m.chatKind === "date") &&
            typeof m.fromKey === "string" &&
            typeof m.toKey === "string" &&
            typeof m.text === "string" &&
            typeof m.createdAtMs === "number"
          );
        })
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      if (normalized.length > 0) {
        messagesByThread.set(thread.threadId, normalized);
      }
    }
    for (const cursor of state.readCursors) {
      if (!cursor || typeof cursor !== "object") continue;
      if (typeof cursor.threadUserKey !== "string") continue;
      if (typeof cursor.readAtMs !== "number" || !Number.isFinite(cursor.readAtMs)) continue;
      readCursorByThreadUser.set(cursor.threadUserKey, cursor.readAtMs);
    }
  }

  function enforceRateLimit(fromKey: string, now: number): Result<void> {
    const windowStart = now - 60_000;
    const list = rateByFromKey.get(fromKey) ?? [];
    const filtered = list.filter((t) => t > windowStart);
    if (filtered.length >= rateLimitPerMinute) {
      rateByFromKey.set(fromKey, filtered);
      return err("RATE_LIMITED", "Rate limit exceeded.", { limitPerMinute: rateLimitPerMinute });
    }
    filtered.push(now);
    rateByFromKey.set(fromKey, filtered);
    return ok(undefined);
  }

  function purgeExpiredInThread(chatKind: ChatKind, threadId: string, now: number): boolean {
    const list = messagesByThread.get(threadId);
    if (!list || list.length === 0) return false;
    const before = list.length;
    const minCreatedAtMs = now - historyWindowMs;
    const remaining = list.filter((m) => m.createdAtMs >= minCreatedAtMs && (typeof m.expiresAtMs !== "number" || now < m.expiresAtMs));
    if (remaining.length === 0) {
      messagesByThread.delete(threadId);
    } else if (remaining.length !== before) {
      messagesByThread.set(threadId, remaining);
    }
    if (remaining.length !== before) {
      persistMessages();
    }
    return remaining.length !== before;
  }

  if (deps.initialState) {
    loadInitialState(deps.initialState);
  } else {
    loadMessages();
  }

  function validateSession(session: Session): Result<void> {
    if (
      typeof session !== "object" ||
      session === null ||
      !isNonEmptyString(session.sessionToken) ||
      (session.userType !== "guest" && session.userType !== "registered" && session.userType !== "subscriber") ||
      (session.mode !== "cruise" && session.mode !== "date" && session.mode !== "hybrid")
    ) {
      return err("INVALID_SESSION", "Invalid session.");
    }
    return ok(undefined);
  }

  return {
    sendMessage(session: Session, input: SendMessageInput): Result<ChatMessage> {
      const sessionValid = validateSession(session);
      if (!sessionValid.ok) return sessionValid;

      if (session.ageVerified !== true) {
        return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
      }

      if (typeof input !== "object" || input === null || !isChatKind(input.chatKind)) {
        return err("UNAUTHORIZED_ACTION", "Invalid chat kind.");
      }

      if (!canUseChatKind(session.mode, input.chatKind)) {
        return err("UNAUTHORIZED_ACTION", "Chat kind is not allowed in the current mode.", {
          mode: session.mode,
          chatKind: input.chatKind
        });
      }

      if (input.chatKind === "date" && session.userType === "guest") {
        return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot use Date chat.");
      }

      const fromKey = deriveFromKey(session);
      if (!isNonEmptyString(input.toKey)) {
        return err("UNAUTHORIZED_ACTION", "Invalid recipient.");
      }
      const toKey = normalizeKey(input.toKey);
      if (toKey === fromKey) {
        return err("UNAUTHORIZED_ACTION", "Invalid recipient.");
      }

      if (input.chatKind === "date") {
        // Date Mode requires mutual matching before interaction.
        if (!session.userId || typeof session.userId !== "string" || session.userId.trim() === "") {
          return err("INVALID_SESSION", "Invalid session.");
        }
        if (!toKey.startsWith("user:")) {
          return err("UNAUTHORIZED_ACTION", "Invalid recipient.");
        }
        const toUserId = toKey.slice("user:".length);
        if (!matchChecker || !matchChecker.isMatched(session.userId, toUserId)) {
          return err("UNAUTHORIZED_ACTION", "Match required before Date chat.");
        }
      }

      const text = typeof input.text === "string" ? sanitizeText(input.text) : "";
      if (containsDisallowedKidVariation(text)) {
        return err("UNAUTHORIZED_ACTION", "Message rejected.");
      }
      const mediaResult = validateMediaAttachment(input.media);
      if (!mediaResult.ok) return mediaResult as Result<ChatMessage>;
      const media = mediaResult.value;
      if (text.length === 0 && media === null) {
        return err("UNAUTHORIZED_ACTION", "Invalid message.");
      }

      if (blockChecker && blockChecker.isBlocked(fromKey, toKey)) {
        if (!(input.chatKind === "cruise" && isCruiseSpotThreadKey(toKey))) {
          return err("USER_BLOCKED", "You cannot message this user.");
        }
      }

      const now = nowMs();
      const rate = enforceRateLimit(fromKey, now);
      if (!rate.ok) return rate as Result<ChatMessage>;

      const threadId = threadKey(input.chatKind, fromKey, toKey);
      purgeExpiredInThread(input.chatKind, threadId, now);

      const expiresAtMs =
        input.chatKind === "cruise" ? now + cruiseRetentionHours * 60 * 60 * 1000 : undefined;

      const message: ChatMessage = {
        messageId: crypto.randomUUID(),
        chatId: threadId,
        chatKind: input.chatKind,
        fromKey,
        toKey,
        text,
        ...(media ? { media } : {}),
        createdAtMs: now,
        deliveredAtMs: now,
        expiresAtMs
      };

      const list = messagesByThread.get(threadId) ?? [];
      list.push(message);
      messagesByThread.set(threadId, list);
      persistMessages();
      if (!persistenceFilePath) notifyStateChanged();

      return ok(message);
    },

    listMessages(session: Session, chatKind: ChatKind, otherKey: string): Result<ReadonlyArray<ChatMessage>> {
      const sessionValid = validateSession(session);
      if (!sessionValid.ok) return sessionValid;

      if (session.ageVerified !== true) {
        return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
      }

      if (!isChatKind(chatKind)) {
        return err("UNAUTHORIZED_ACTION", "Invalid chat kind.");
      }

      if (!canUseChatKind(session.mode, chatKind)) {
        return err("UNAUTHORIZED_ACTION", "Chat kind is not allowed in the current mode.", {
          mode: session.mode,
          chatKind
        });
      }

      if (chatKind === "date" && session.userType === "guest") {
        return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot use Date chat.");
      }

      const fromKey = deriveFromKey(session);
      if (!isNonEmptyString(otherKey)) {
        return err("UNAUTHORIZED_ACTION", "Invalid recipient.");
      }
      const toKey = normalizeKey(otherKey);

      const now = nowMs();
      const threadId = threadKey(chatKind, fromKey, toKey);

      const expiredWerePurged = purgeExpiredInThread(chatKind, threadId, now);
      const list = messagesByThread.get(threadId) ?? [];

      if (chatKind === "cruise" && list.length === 0 && expiredWerePurged) {
        return err("CHAT_EXPIRED", "Chat messages have expired.");
      }

      if (chatKind === "cruise" && isCruiseSpotThreadKey(toKey)) {
        return ok(list);
      }

      const otherReadAtMs = readCursorByThreadUser.get(`${threadId}::${toKey}`) ?? 0;
      return ok(
        list.map((m) => {
          if (m.fromKey !== fromKey) return m;
          const readAtMs = otherReadAtMs >= m.createdAtMs ? otherReadAtMs : undefined;
          return { ...m, deliveredAtMs: m.deliveredAtMs ?? m.createdAtMs, readAtMs };
        })
      );
    },

    listThreads(session: Session, chatKind: ChatKind): Result<ReadonlyArray<Readonly<{ otherKey: string; lastMessage: ChatMessage }>>> {
      const sessionValid = validateSession(session);
      if (!sessionValid.ok) return sessionValid;
      if (session.ageVerified !== true) {
        return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
      }
      if (!isChatKind(chatKind)) {
        return err("UNAUTHORIZED_ACTION", "Invalid chat kind.");
      }
      if (!canUseChatKind(session.mode, chatKind)) {
        return err("UNAUTHORIZED_ACTION", "Chat kind is not allowed in the current mode.", {
          mode: session.mode,
          chatKind
        });
      }
      if (chatKind === "date" && session.userType === "guest") {
        return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot use Date chat.");
      }

      const fromKey = deriveFromKey(session);
      const now = nowMs();
      const latestByOtherKey = new Map<string, ChatMessage>();
      let changed = false;

      for (const [threadId, list] of messagesByThread.entries()) {
        if (!threadId.startsWith(`${chatKind}::`)) continue;
        const purged = purgeExpiredInThread(chatKind, threadId, now);
        if (purged) changed = true;
        const activeList = messagesByThread.get(threadId) ?? [];
        if (activeList.length === 0) continue;
        if (chatKind === "cruise" && threadId.startsWith("cruise::spot:")) continue;

        let otherKey = "";
        for (let i = activeList.length - 1; i >= 0; i -= 1) {
          const message = activeList[i];
          if (message.fromKey === fromKey && message.toKey !== fromKey) {
            otherKey = message.toKey;
            break;
          }
          if (message.toKey === fromKey && message.fromKey !== fromKey) {
            otherKey = message.fromKey;
            break;
          }
        }
        if (!isNonEmptyString(otherKey)) continue;

        const lastMessage = activeList[activeList.length - 1];
        const current = latestByOtherKey.get(otherKey);
        if (!current || lastMessage.createdAtMs > current.createdAtMs) {
          latestByOtherKey.set(otherKey, lastMessage);
        }
      }

      if (changed && !persistenceFilePath) notifyStateChanged();

      const rows = Array.from(latestByOtherKey.entries())
        .map(([otherKey, lastMessage]) => ({ otherKey, lastMessage }))
        .sort((a, b) => b.lastMessage.createdAtMs - a.lastMessage.createdAtMs);

      return ok(rows);
    },

    markRead(session: Session, chatKind: ChatKind, otherKey: string): Result<{ readAtMs: number }> {
      const sessionValid = validateSession(session);
      if (!sessionValid.ok) return sessionValid;
      if (session.ageVerified !== true) {
        return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
      }
      if (!isChatKind(chatKind)) {
        return err("UNAUTHORIZED_ACTION", "Invalid chat kind.");
      }
      if (!canUseChatKind(session.mode, chatKind)) {
        return err("UNAUTHORIZED_ACTION", "Chat kind is not allowed in the current mode.", {
          mode: session.mode,
          chatKind
        });
      }
      if (chatKind === "date" && session.userType === "guest") {
        return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot use Date chat.");
      }
      const fromKey = deriveFromKey(session);
      if (!isNonEmptyString(otherKey)) {
        return err("UNAUTHORIZED_ACTION", "Invalid recipient.");
      }
      const toKey = normalizeKey(otherKey);
      const now = nowMs();
      const threadId = threadKey(chatKind, fromKey, toKey);
      readCursorByThreadUser.set(`${threadId}::${fromKey}`, now);
      persistMessages();
      if (!persistenceFilePath) notifyStateChanged();
      return ok({ readAtMs: now });
    },

    getThread(chatKind: ChatKind, aKey: string, bKey: string): ChatThread {
      if (!isChatKind(chatKind)) {
        throw new Error("Invalid chat kind.");
      }
      if (!isNonEmptyString(aKey) || !isNonEmptyString(bKey)) {
        throw new Error("Invalid thread keys.");
      }

      const id = threadKey(chatKind, aKey, bKey);
      const a = normalizeKey(aKey);
      const b = normalizeKey(bKey);
      const [x, y] = a < b ? [a, b] : [b, a];
      return { chatId: id, chatKind, aKey: x, bKey: y };
    },

    snapshotState(): ChatPersistenceState {
      return snapshotStateInternal();
    }
  };
}
