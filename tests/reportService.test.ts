import { createReportService } from "../backend/src/services/reportService";

describe("reportService", () => {
  it("Given default dependencies When createReportService is used Then reports can be created and listed", () => {
    const svc = createReportService();
    const res = svc.reportUser(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "user:u_b",
      "spam"
    );
    expect(res.ok).toBe(true);
    const list = svc.listReports();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(1);
  });

  it("Given an age-verified session When a user report is submitted Then a report record is created and stored", () => {
    const now = 1_700_000_000_000;
    const svc = createReportService({ nowMs: () => now });

    const res = svc.reportUser(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "user:u_target",
      "spam"
    );

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.fromKey).toBe("session:s_a");
    expect(res.value.target).toEqual({ kind: "user", targetKey: "user:u_target" });
    expect(res.value.reason).toBe("spam");
    expect(res.value.createdAtMs).toBe(now);

    expect(svc.listReports()).toHaveLength(1);
  });

  it("Given an age-verified session When a message report is submitted Then a report record is created and stored", () => {
    const now = 1_700_000_000_000;
    const svc = createReportService({ nowMs: () => now });

    const res = svc.reportMessage(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "m_1",
      "abuse",
      "user:u_b"
    );

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.fromKey).toBe("user:u_a");
    expect(res.value.target).toEqual({ kind: "message", messageId: "m_1", targetKey: "user:u_b" });
  });

  it("Given an age-verified session When a message report is submitted without a targetKey Then it is accepted and stored (covers optional branch)", () => {
    const svc = createReportService({ nowMs: () => 1 });
    const res = svc.reportMessage(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "m_2",
      "abuse"
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.target).toEqual({ kind: "message", messageId: "m_2", targetKey: undefined });
  });

  it("Given a session without age verification When a report is submitted Then it rejects with AGE_GATE_REQUIRED", () => {
    const svc = createReportService({ nowMs: () => 1 });

    const res = svc.reportUser({ sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: false }, "user:u_b", "spam");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({
      code: "AGE_GATE_REQUIRED",
      message: "You must be 18 or older to use Red Door.",
      context: { minimumAge: 18 }
    });
  });

  it("Given invalid inputs When a report is submitted Then it rejects deterministically", () => {
    const svc = createReportService({ nowMs: () => 1 });

    const invalidSession = svc.reportUser(null as any, "user:u_b", "spam");
    expect(invalidSession.ok).toBe(false);
    if (invalidSession.ok) throw new Error("unreachable");
    expect(invalidSession.error).toEqual({ code: "INVALID_SESSION", message: "Invalid session." });

    const invalidUserType = svc.reportUser(
      { sessionToken: "s_a", userType: "admin" as any, mode: "cruise", ageVerified: true },
      "user:u_b",
      "spam"
    );
    expect(invalidUserType.ok).toBe(false);
    if (invalidUserType.ok) throw new Error("unreachable");
    expect(invalidUserType.error).toEqual({ code: "INVALID_SESSION", message: "Invalid session." });

    const badTarget = svc.reportUser(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      " ",
      "spam"
    );
    expect(badTarget.ok).toBe(false);
    if (badTarget.ok) throw new Error("unreachable");
    expect(badTarget.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid report target." });

    const badReasonUser = svc.reportUser(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "user:u_b",
      " "
    );
    expect(badReasonUser.ok).toBe(false);
    if (badReasonUser.ok) throw new Error("unreachable");
    expect(badReasonUser.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid report reason." });

    const badMessageId = svc.reportMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      " ",
      "abuse"
    );
    expect(badMessageId.ok).toBe(false);
    if (badMessageId.ok) throw new Error("unreachable");
    expect(badMessageId.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid report target." });

    const badReason = svc.reportMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "m_1",
      " "
    );
    expect(badReason.ok).toBe(false);
    if (badReason.ok) throw new Error("unreachable");
    expect(badReason.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid report reason." });
  });

  it("Given a very long report reason When a report is accepted Then the reason is truncated deterministically", () => {
    const svc = createReportService({ nowMs: () => 1 });
    const longReason = "x".repeat(1_000);
    const res = svc.reportUser(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "user:u_b",
      longReason
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.reason.length).toBe(500);
  });
});
