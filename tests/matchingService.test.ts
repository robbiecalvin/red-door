import { createMatchingService } from "../backend/src/services/matchingService";

describe("matchingService", () => {
  it("Given default dependencies When createMatchingService is called Then it can create matches without explicit deps", () => {
    const svc = createMatchingService();

    const bLikesA = svc.recordSwipe(
      { sessionToken: "s_b", userType: "registered", mode: "date", userId: "u_b", ageVerified: true },
      "u_a",
      "like"
    );
    expect(bLikesA.ok).toBe(true);

    const aLikesB = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_b",
      "like"
    );
    expect(aLikesB.ok).toBe(true);
  });

  it("Given two registered users And both users submit positive swipe actions toward each other When the second positive swipe is recorded Then a match record is created And the match is persisted according to current storage rules", () => {
    const now = 1_700_000_000_000;
    const svc = createMatchingService({ nowMs: () => now });

    const first = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_b",
      "like"
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    expect(first.value.matchCreated).toBe(false);

    const second = svc.recordSwipe(
      { sessionToken: "s_b", userType: "registered", mode: "date", userId: "u_b", ageVerified: true },
      "u_a",
      "like"
    );
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    expect(second.value.matchCreated).toBe(true);
    expect(second.value.match).toBeDefined();

    const match = second.value.match!;
    expect(match.userA).toBe("u_a");
    expect(match.userB).toBe("u_b");
    expect(typeof match.matchId).toBe("string");

    const aMatches = svc.listMatches("u_a");
    expect(aMatches.ok).toBe(true);
    if (!aMatches.ok) throw new Error("unreachable");
    expect(aMatches.value).toEqual([match]);

    const bMatches = svc.listMatches("u_b");
    expect(bMatches.ok).toBe(true);
    if (!bMatches.ok) throw new Error("unreachable");
    expect(bMatches.value).toEqual([match]);
  });

  it("Given a guest (anonymous) user When any swipe action is attempted Then the request is rejected And no swipe or match data is stored", () => {
    const svc = createMatchingService({ nowMs: () => 1 });

    const attempt = svc.recordSwipe({ sessionToken: "s_guest", userType: "guest", mode: "cruise" }, "u_x", "like");
    expect(attempt.ok).toBe(false);
    if (attempt.ok) throw new Error("unreachable");
    expect(attempt.error).toEqual({
      code: "ANONYMOUS_FORBIDDEN",
      message: "Anonymous users cannot swipe or match."
    });

    // Ensure no swipe was stored by verifying getSwipe is empty.
    expect(svc.getSwipe("u_guest", "u_x")).toBeNull();

    // And no match was created.
    const matches = svc.listMatches("u_x");
    expect(matches.ok).toBe(true);
    if (!matches.ok) throw new Error("unreachable");
    expect(matches.value).toEqual([]);
  });

  it("Given a registered user without age verification When a swipe action is attempted Then it is rejected with AGE_GATE_REQUIRED", () => {
    const svc = createMatchingService({ nowMs: () => 1 });

    const attempt = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: false },
      "u_b",
      "like"
    );
    expect(attempt.ok).toBe(false);
    if (attempt.ok) throw new Error("unreachable");
    expect(attempt.error).toEqual({
      code: "AGE_GATE_REQUIRED",
      message: "You must be 18 or older to use Red Door.",
      context: { minimumAge: 18 }
    });
  });

  it("Given a block exists between two users When a swipe is attempted Then it is rejected with USER_BLOCKED", () => {
    const svc = createMatchingService({
      nowMs: () => 1,
      blockChecker: {
        isBlocked(fromKey: string, toKey: string): boolean {
          return fromKey === "user:u_a" && toKey === "user:u_b";
        }
      }
    });

    const attempt = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_b",
      "like"
    );
    expect(attempt.ok).toBe(false);
    if (attempt.ok) throw new Error("unreachable");
    expect(attempt.error).toEqual({ code: "USER_BLOCKED", message: "You cannot interact with this user." });
  });

  it("Given a non-object session When a swipe is attempted Then it rejects with INVALID_SESSION", () => {
    const svc = createMatchingService({ nowMs: () => 1 });

    const result = svc.recordSwipe(123 as any, "u_b", "like");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("INVALID_SESSION");
  });

  it("Given various invalid session shapes When a swipe is attempted Then it rejects with INVALID_SESSION", () => {
    const svc = createMatchingService({ nowMs: () => 1 });

    const nullSession = svc.recordSwipe(null as any, "u_b", "like");
    expect(nullSession.ok).toBe(false);
    if (nullSession.ok) throw new Error("unreachable");
    expect(nullSession.error.code).toBe("INVALID_SESSION");

    const tokenNotString = svc.recordSwipe(
      { sessionToken: 123, userType: "registered", mode: "date", userId: "u_a" } as any,
      "u_b",
      "like"
    );
    expect(tokenNotString.ok).toBe(false);
    if (tokenNotString.ok) throw new Error("unreachable");
    expect(tokenNotString.error.code).toBe("INVALID_SESSION");

    const badUserType = svc.recordSwipe(
      { sessionToken: "s_a", userType: "admin", mode: "date", userId: "u_a" } as any,
      "u_b",
      "like"
    );
    expect(badUserType.ok).toBe(false);
    if (badUserType.ok) throw new Error("unreachable");
    expect(badUserType.error.code).toBe("INVALID_SESSION");

    const badMode = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "stealth", userId: "u_a" } as any,
      "u_b",
      "like"
    );
    expect(badMode.ok).toBe(false);
    if (badMode.ok) throw new Error("unreachable");
    expect(badMode.error.code).toBe("INVALID_SESSION");
  });

  it("Given a registered user in Cruise Mode When a swipe action is attempted Then the request is rejected with MATCHING_NOT_ALLOWED", () => {
    const svc = createMatchingService({ nowMs: () => 1 });

    const attempt = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "cruise", userId: "u_a", ageVerified: true },
      "u_b",
      "like"
    );

    expect(attempt.ok).toBe(false);
    if (attempt.ok) throw new Error("unreachable");
    expect(attempt.error).toEqual({
      code: "MATCHING_NOT_ALLOWED",
      message: "Matching is not allowed in Cruise Mode.",
      context: { mode: "cruise" }
    });
  });

  it("Given an invalid swipe target When a swipe is attempted Then the request is rejected with UNAUTHORIZED_ACTION", () => {
    const svc = createMatchingService({ nowMs: () => 1 });

    const selfSwipe = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_a",
      "like"
    );

    expect(selfSwipe.ok).toBe(false);
    if (selfSwipe.ok) throw new Error("unreachable");
    expect(selfSwipe.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid swipe target." });
  });

  it("Given an existing mutual match When additional likes are recorded Then the match is not duplicated", () => {
    const now = 1_700_000_000_000;
    const svc = createMatchingService({ nowMs: () => now });

    const aLikesB = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_b",
      "like"
    );
    expect(aLikesB.ok).toBe(true);

    const bLikesA = svc.recordSwipe(
      { sessionToken: "s_b", userType: "registered", mode: "date", userId: "u_b", ageVerified: true },
      "u_a",
      "like"
    );
    expect(bLikesA.ok).toBe(true);
    if (!bLikesA.ok) throw new Error("unreachable");
    expect(bLikesA.value.matchCreated).toBe(true);
    const matchId = bLikesA.value.match!.matchId;

    const bLikesAAgain = svc.recordSwipe(
      { sessionToken: "s_b", userType: "registered", mode: "date", userId: "u_b", ageVerified: true },
      "u_a",
      "like"
    );
    expect(bLikesAAgain.ok).toBe(true);
    if (!bLikesAAgain.ok) throw new Error("unreachable");
    expect(bLikesAAgain.value.matchCreated).toBe(false);
    expect(bLikesAAgain.value.match!.matchId).toBe(matchId);
  });

  it("Given a mutual match where the second swiper has a lexicographically smaller userId When the match is created Then the match ordering is stable", () => {
    const now = 1_700_000_000_000;
    const svc = createMatchingService({ nowMs: () => now });

    const first = svc.recordSwipe(
      { sessionToken: "s_b", userType: "registered", mode: "date", userId: "u_b", ageVerified: true },
      "u_a",
      "like"
    );
    expect(first.ok).toBe(true);

    const second = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_b",
      "like"
    );
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    expect(second.value.matchCreated).toBe(true);
    expect(second.value.match!.userA).toBe("u_a");
    expect(second.value.match!.userB).toBe("u_b");
  });

  it("Given a match where the first argument to makePairKey is lexicographically larger When a match is created Then it still indexes correctly", () => {
    const now = 1_700_000_000_000;
    const svc = createMatchingService({ nowMs: () => now });

    const zLikesY = svc.recordSwipe(
      { sessionToken: "s_z", userType: "registered", mode: "date", userId: "u_z", ageVerified: true },
      "u_y",
      "like"
    );
    expect(zLikesY.ok).toBe(true);

    const yLikesZ = svc.recordSwipe(
      { sessionToken: "s_y", userType: "registered", mode: "date", userId: "u_y", ageVerified: true },
      "u_z",
      "like"
    );
    expect(yLikesZ.ok).toBe(true);
    if (!yLikesZ.ok) throw new Error("unreachable");
    expect(yLikesZ.value.matchCreated).toBe(true);

    const yMatches = svc.listMatches("u_y");
    expect(yMatches.ok).toBe(true);
    if (!yMatches.ok) throw new Error("unreachable");
    expect(yMatches.value).toHaveLength(1);
  });

  it("Given a registered session missing userId When a swipe action is attempted Then the request is rejected with INVALID_SESSION", () => {
    const svc = createMatchingService({ nowMs: () => 1 });

    const attempt = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", ageVerified: true } as any,
      "u_b",
      "like"
    );
    expect(attempt.ok).toBe(false);
    if (attempt.ok) throw new Error("unreachable");
    expect(attempt.error).toEqual({ code: "INVALID_SESSION", message: "Invalid session." });
  });

  it("Given a like followed by a pass When the other user likes back Then no match is created (like is removed)", () => {
    const svc = createMatchingService({ nowMs: () => 1 });

    const like = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_b",
      "like"
    );
    expect(like.ok).toBe(true);

    const pass = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_b",
      "pass"
    );
    expect(pass.ok).toBe(true);
    if (!pass.ok) throw new Error("unreachable");
    expect(pass.value.matchCreated).toBe(false);

    const bLikesA = svc.recordSwipe(
      { sessionToken: "s_b", userType: "registered", mode: "date", userId: "u_b", ageVerified: true },
      "u_a",
      "like"
    );
    expect(bLikesA.ok).toBe(true);
    if (!bLikesA.ok) throw new Error("unreachable");
    expect(bLikesA.value.matchCreated).toBe(false);
    expect(svc.listMatches("u_a").ok).toBe(true);
    const aMatches = svc.listMatches("u_a");
    if (!aMatches.ok) throw new Error("unreachable");
    expect(aMatches.value).toEqual([]);
  });

  it("Given one user has multiple distinct matches When the second match is created Then the match index is updated without overwriting the first", () => {
    const svc = createMatchingService({ nowMs: () => 1 });

    // u_a <-> u_b
    const aLikesB = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_b",
      "like"
    );
    expect(aLikesB.ok).toBe(true);
    const bLikesA = svc.recordSwipe(
      { sessionToken: "s_b", userType: "registered", mode: "date", userId: "u_b", ageVerified: true },
      "u_a",
      "like"
    );
    expect(bLikesA.ok).toBe(true);
    if (!bLikesA.ok) throw new Error("unreachable");
    expect(bLikesA.value.matchCreated).toBe(true);

    // u_a <-> u_c (forces addMatchIndex existing-branch for u_a)
    const aLikesC = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_c",
      "like"
    );
    expect(aLikesC.ok).toBe(true);
    const cLikesA = svc.recordSwipe(
      { sessionToken: "s_c", userType: "registered", mode: "date", userId: "u_c", ageVerified: true },
      "u_a",
      "like"
    );
    expect(cLikesA.ok).toBe(true);
    if (!cLikesA.ok) throw new Error("unreachable");
    expect(cLikesA.value.matchCreated).toBe(true);

    const matches = svc.listMatches("u_a");
    expect(matches.ok).toBe(true);
    if (!matches.ok) throw new Error("unreachable");
    expect(matches.value).toHaveLength(2);
  });

  it("Given invalid inputs When recordSwipe is called Then it rejects deterministically", () => {
    const svc = createMatchingService({ nowMs: () => 1 });

    const badSession = svc.recordSwipe({ sessionToken: " ", userType: "registered", mode: "date", userId: "u_a" } as any, "u_b", "like");
    expect(badSession.ok).toBe(false);
    if (badSession.ok) throw new Error("unreachable");
    expect(badSession.error.code).toBe("INVALID_SESSION");

    const badDirection = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_b",
      "up" as any
    );
    expect(badDirection.ok).toBe(false);
    if (badDirection.ok) throw new Error("unreachable");
    expect(badDirection.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid swipe direction." });

    const badList = svc.listMatches(" ");
    expect(badList.ok).toBe(false);
    if (badList.ok) throw new Error("unreachable");
    expect(badList.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid user." });
  });

  it("Given invalid inputs When getSwipe is called Then it returns null", () => {
    const svc = createMatchingService({ nowMs: () => 1 });
    expect(svc.getSwipe("", "u_b")).toBeNull();
    expect(svc.getSwipe("u_a", " ")).toBeNull();
  });

  it("Given a created match When isMatched is called Then it returns true for that pair and false for others", () => {
    const svc = createMatchingService({ nowMs: () => 1 });

    const aLikesB = svc.recordSwipe(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "u_b",
      "like"
    );
    expect(aLikesB.ok).toBe(true);

    const bLikesA = svc.recordSwipe(
      { sessionToken: "s_b", userType: "registered", mode: "date", userId: "u_b", ageVerified: true },
      "u_a",
      "like"
    );
    expect(bLikesA.ok).toBe(true);

    expect(svc.isMatched("u_a", "u_b")).toBe(true);
    expect(svc.isMatched("u_b", "u_a")).toBe(true);
    expect(svc.isMatched("u_a", "u_c")).toBe(false);
    expect(svc.isMatched("", "u_b")).toBe(false);
  });
});
