import crypto from "node:crypto";

export type Mode = "cruise" | "date" | "hybrid";
export type UserType = "guest" | "registered" | "subscriber";

export type SwipeDirection = "like" | "pass";

export type ErrorCode =
  | "INVALID_SESSION"
  | "ANONYMOUS_FORBIDDEN"
  | "MATCHING_NOT_ALLOWED"
  | "UNAUTHORIZED_ACTION"
  | "USER_BLOCKED"
  | "AGE_GATE_REQUIRED";

export type ServiceError = {
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
};

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

export type SwipeRecord = Readonly<{
  fromUserId: string;
  toUserId: string;
  direction: SwipeDirection;
  createdAtMs: number;
}>;

export type MatchRecord = Readonly<{
  matchId: string;
  userA: string;
  userB: string;
  createdAtMs: number;
}>;

export type RecordSwipeResult = Readonly<{
  swipe: SwipeRecord;
  matchCreated: boolean;
  match?: MatchRecord;
}>;

export type MatchingService = Readonly<{
  recordSwipe(session: Session, toUserId: string, direction: SwipeDirection): Result<RecordSwipeResult>;
  listMatches(userId: string): Result<ReadonlyArray<MatchRecord>>;
  getSwipe(fromUserId: string, toUserId: string): SwipeRecord | null;
  isMatched(userA: string, userB: string): boolean;
}>;

export type MatchingServiceDeps = Readonly<{
  nowMs?: () => number;
  blockChecker?: Readonly<{
    isBlocked(fromKey: string, toKey: string): boolean;
  }>;
}>;

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  const error: ServiceError = context ? { code, message, context } : { code, message };
  return { ok: false, error };
}

function isValidUserId(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function makePairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function isValidDirection(value: unknown): value is SwipeDirection {
  return value === "like" || value === "pass";
}

export function createMatchingService(deps: MatchingServiceDeps = {}): MatchingService {
  const nowMs = deps.nowMs ?? (() => Date.now());
  const blockChecker = deps.blockChecker;

  const swipeByPair = new Map<string, SwipeRecord>();
  const likeByPair = new Set<string>();

  // One match per user-pair.
  const matchByPair = new Map<string, MatchRecord>();
  const matchesByUser = new Map<string, Set<string>>(); // userId -> pairKey

  function addMatchIndex(userId: string, pairKey: string): void {
    const existing = matchesByUser.get(userId);
    if (existing) {
      existing.add(pairKey);
      return;
    }
    matchesByUser.set(userId, new Set([pairKey]));
  }

  return {
    recordSwipe(session: Session, toUserId: string, direction: SwipeDirection): Result<RecordSwipeResult> {
      if (
        typeof session !== "object" ||
        session === null ||
        typeof session.sessionToken !== "string" ||
        session.sessionToken.trim() === "" ||
        (session.userType !== "guest" && session.userType !== "registered" && session.userType !== "subscriber") ||
        (session.mode !== "cruise" && session.mode !== "date" && session.mode !== "hybrid")
      ) {
        return err("INVALID_SESSION", "Invalid session.");
      }

      if (session.userType === "guest") {
        return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot swipe or match.");
      }

      if (session.ageVerified !== true) {
        return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
      }

      if (session.mode === "cruise") {
        return err("MATCHING_NOT_ALLOWED", "Matching is not allowed in Cruise Mode.", { mode: session.mode });
      }

      if (!isValidUserId(session.userId)) {
        return err("INVALID_SESSION", "Invalid session.");
      }

      if (!isValidUserId(toUserId) || toUserId.trim() === session.userId.trim()) {
        return err("UNAUTHORIZED_ACTION", "Invalid swipe target.");
      }

      if (!isValidDirection(direction)) {
        return err("UNAUTHORIZED_ACTION", "Invalid swipe direction.");
      }

      const now = nowMs();
      if (blockChecker) {
        const fromKey = `user:${session.userId}`;
        const toKey = `user:${toUserId.trim()}`;
        if (blockChecker.isBlocked(fromKey, toKey)) {
          return err("USER_BLOCKED", "You cannot interact with this user.");
        }
      }
      const swipe: SwipeRecord = {
        fromUserId: session.userId,
        toUserId: toUserId.trim(),
        direction,
        createdAtMs: now
      };

      const pairKey = `${swipe.fromUserId}=>${swipe.toUserId}`;
      swipeByPair.set(pairKey, swipe);

      if (direction === "like") {
        likeByPair.add(pairKey);
      } else {
        likeByPair.delete(pairKey);
      }

      const reverseLikeKey = `${swipe.toUserId}=>${swipe.fromUserId}`;
      const mutualLike = direction === "like" && likeByPair.has(reverseLikeKey);

      if (!mutualLike) {
        return ok({ swipe, matchCreated: false });
      }

      const matchPairKey = makePairKey(swipe.fromUserId, swipe.toUserId);
      const existingMatch = matchByPair.get(matchPairKey);
      if (existingMatch) {
        return ok({ swipe, matchCreated: false, match: existingMatch });
      }

      const match: MatchRecord = {
        matchId: crypto.randomUUID(),
        userA: swipe.fromUserId < swipe.toUserId ? swipe.fromUserId : swipe.toUserId,
        userB: swipe.fromUserId < swipe.toUserId ? swipe.toUserId : swipe.fromUserId,
        createdAtMs: now
      };

      matchByPair.set(matchPairKey, match);
      addMatchIndex(match.userA, matchPairKey);
      addMatchIndex(match.userB, matchPairKey);

      return ok({ swipe, matchCreated: true, match });
    },

    listMatches(userId: string): Result<ReadonlyArray<MatchRecord>> {
      if (!isValidUserId(userId)) {
        return err("UNAUTHORIZED_ACTION", "Invalid user.");
      }

      const keys = matchesByUser.get(userId.trim());
      if (!keys) return ok([]);

      const matches: MatchRecord[] = [];
      for (const key of keys) {
        const match = matchByPair.get(key);
        if (match) matches.push(match);
      }

      matches.sort((a, b) => b.createdAtMs - a.createdAtMs);
      return ok(matches);
    },

    getSwipe(fromUserId: string, toUserId: string): SwipeRecord | null {
      if (!isValidUserId(fromUserId) || !isValidUserId(toUserId)) return null;
      return swipeByPair.get(`${fromUserId.trim()}=>${toUserId.trim()}`) ?? null;
    },

    isMatched(userA: string, userB: string): boolean {
      if (!isValidUserId(userA) || !isValidUserId(userB)) return false;
      return matchByPair.has(makePairKey(userA.trim(), userB.trim()));
    }
  };
}
