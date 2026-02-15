import { createBlockService } from "../backend/src/services/blockService";

describe("blockService", () => {
  it("Given an age-verified session When block is called Then isBlocked becomes true in both directions and listBlocked includes the target", () => {
    const now = 1_700_000_000_000;
    const svc = createBlockService({ nowMs: () => now });

    const res = svc.block(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "user:u_b"
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.blockerKey).toBe("user:u_a");
    expect(res.value.blockedKey).toBe("user:u_b");

    expect(svc.isBlocked("user:u_a", "user:u_b")).toBe(true);
    expect(svc.isBlocked("user:u_b", "user:u_a")).toBe(true);
    expect(svc.listBlocked("user:u_a")).toEqual(["user:u_b"]);
  });

  it("Given an existing block When unblock is called Then isBlocked becomes false", () => {
    const svc = createBlockService({ nowMs: () => 1 });

    const block = svc.block(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "user:u_b"
    );
    expect(block.ok).toBe(true);

    const un = svc.unblock(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "user:u_b"
    );
    expect(un.ok).toBe(true);
    expect(svc.isBlocked("user:u_a", "user:u_b")).toBe(false);
    expect(svc.listBlocked("user:u_a")).toEqual([]);
  });

  it("Given a session without age verification When block is called Then it rejects with AGE_GATE_REQUIRED", () => {
    const svc = createBlockService({ nowMs: () => 1 });

    const res = svc.block({ sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: false }, "user:u_b");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({
      code: "AGE_GATE_REQUIRED",
      message: "You must be 18 or older to use Red Door.",
      context: { minimumAge: 18 }
    });
  });

  it("Given invalid inputs When block is called Then it rejects deterministically", () => {
    const svc = createBlockService({ nowMs: () => 1 });

    const badTarget = svc.block(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      " "
    );
    expect(badTarget.ok).toBe(false);
    if (badTarget.ok) throw new Error("unreachable");
    expect(badTarget.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid target." });

    const selfTarget = svc.block(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "session:s_a"
    );
    expect(selfTarget.ok).toBe(false);
    if (selfTarget.ok) throw new Error("unreachable");
    expect(selfTarget.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid target." });
  });

  it("Given an invalid session shape When block is called Then it rejects with INVALID_SESSION", () => {
    const svc = createBlockService({ nowMs: () => 1 });

    const res = svc.block(null as any, "user:u_b");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "INVALID_SESSION", message: "Invalid session." });
  });

  it("Given a blocker already has a blocked set When blocking a second user Then listBlocked contains both (covers index update branch)", () => {
    const svc = createBlockService({ nowMs: () => 1 });
    const session = { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true } as const;

    const first = svc.block(session, "user:u_b");
    expect(first.ok).toBe(true);
    const second = svc.block(session, "user:u_c");
    expect(second.ok).toBe(true);

    expect(svc.listBlocked("user:u_a")).toEqual(["user:u_b", "user:u_c"]);
  });

  it("Given invalid inputs When unblock is called Then it rejects deterministically", () => {
    const svc = createBlockService({ nowMs: () => 1 });
    const res = svc.unblock({ sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true }, " ");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid target." });
  });

  it("Given no block exists When unblock is called Then it succeeds and does not throw (covers missing-index branch)", () => {
    const svc = createBlockService({ nowMs: () => 1 });
    const res = svc.unblock({ sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true }, "user:u_b");
    expect(res.ok).toBe(true);
    expect(svc.isBlocked("user:u_a", "user:u_b")).toBe(false);
  });

  it("Given invalid keys When isBlocked/listBlocked are called Then they return safe defaults", () => {
    const svc = createBlockService({ nowMs: () => 1 });
    expect(svc.isBlocked("", "x")).toBe(false);
    expect(svc.isBlocked("x", " ")).toBe(false);
    expect(svc.listBlocked(" ")).toEqual([]);
  });

  it("Given a session with an invalid userType When block is called Then it rejects with INVALID_SESSION", () => {
    const svc = createBlockService({ nowMs: () => 1 });
    const res = svc.block({ sessionToken: "s_a", userType: "admin" as any, mode: "cruise", ageVerified: true }, "user:u_b");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error.code).toBe("INVALID_SESSION");
  });
});
