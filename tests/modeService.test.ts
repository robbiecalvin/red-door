import { getCurrentMode, setMode, type Session } from "../backend/src/services/modeService";

describe("modeService", () => {
  it("Given a valid user session When an invalid mode transition is requested Then the service rejects the request with a deterministic, explicit error And the session’s current mode remains unchanged", () => {
    const session: Session = {
      sessionId: "s_1",
      userType: "registered",
      mode: "cruise",
      ageVerified: true
    };

    const result = setMode(session, "not_a_mode");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");

    expect(result.error).toEqual({
      code: "INVALID_MODE_TRANSITION",
      message: "Invalid mode transition.",
      context: { requestedMode: "not_a_mode" }
    });
    expect(session.mode).toBe("cruise");
  });

  it("Given an anonymous (guest) session When Date Mode is requested Then the transition is rejected And the rejection reason explicitly indicates anonymous access is forbidden", () => {
    const session: Session = {
      sessionId: "s_2",
      userType: "guest",
      mode: "cruise",
      ageVerified: true
    };

    const result = setMode(session, "date");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");

    expect(result.error).toEqual({
      code: "ANONYMOUS_FORBIDDEN",
      message: "Anonymous access is forbidden for this mode.",
      context: { requestedMode: "date" }
    });
    expect(session.mode).toBe("cruise");
  });

  it("Given a registered user session When Date Mode is requested Then the transition succeeds And the current mode is updated", () => {
    const session: Session = {
      sessionId: "s_3",
      userType: "registered",
      mode: "cruise",
      ageVerified: true
    };

    const result = setMode(session, "date");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(session.mode).toBe("cruise");
    expect(result.session.mode).toBe("date");
  });

  it("Given a registered user session without opt-in When Hybrid Mode is requested Then the transition is rejected And the session’s current mode remains unchanged", () => {
    const session: Session = {
      sessionId: "s_4",
      userType: "registered",
      mode: "cruise",
      ageVerified: true,
      hybridOptIn: false
    };

    const result = setMode(session, "hybrid");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");

    expect(result.error).toEqual({
      code: "INVALID_MODE_TRANSITION",
      message: "Hybrid Mode requires explicit opt-in.",
      context: { requestedMode: "hybrid" }
    });
    expect(session.mode).toBe("cruise");
  });

  it("Given a registered user session with opt-in When Hybrid Mode is requested Then the transition succeeds", () => {
    const session: Session = {
      sessionId: "s_5",
      userType: "registered",
      mode: "cruise",
      ageVerified: true,
      hybridOptIn: true
    };

    const result = setMode(session, "hybrid");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(getCurrentMode(result.session)).toBe("hybrid");
  });

  it("Given an invalid session When a mode transition is requested Then the service rejects with INVALID_SESSION And does not include context", () => {
    const invalidSession = {
      sessionId: "   ",
      userType: "registered",
      mode: "cruise"
    } as unknown as Session;

    const result = setMode(invalidSession, "date");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");

    expect(result.error).toEqual({
      code: "INVALID_SESSION",
      message: "Invalid session."
    });
  });

  it("Given a non-object session When a mode transition is requested Then the service rejects with INVALID_SESSION", () => {
    const result = setMode(123 as unknown as Session, "date");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("INVALID_SESSION");
  });

  it("Given a null session When a mode transition is requested Then the service rejects with INVALID_SESSION", () => {
    const result = setMode(null as unknown as Session, "date");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("INVALID_SESSION");
  });

  it("Given a session with non-string sessionId When a mode transition is requested Then the service rejects with INVALID_SESSION", () => {
    const invalidSession = {
      sessionId: 123,
      userType: "registered",
      mode: "cruise"
    } as unknown as Session;

    const result = setMode(invalidSession, "date");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("INVALID_SESSION");
  });

  it("Given a session with invalid userType When a mode transition is requested Then the service rejects with INVALID_SESSION", () => {
    const invalidSession = {
      sessionId: "s_bad_user_type",
      userType: "admin",
      mode: "cruise"
    } as unknown as Session;

    const result = setMode(invalidSession, "date");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("INVALID_SESSION");
  });

  it("Given a session with invalid current mode When a mode transition is requested Then the service rejects with INVALID_SESSION", () => {
    const invalidSession = {
      sessionId: "s_bad_mode",
      userType: "registered",
      mode: "nope"
    } as unknown as Session;

    const result = setMode(invalidSession, "date");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("INVALID_SESSION");
  });

  it("Given a valid session When the requested mode equals the current mode Then the transition is a deterministic no-op", () => {
    const session: Session = {
      sessionId: "s_6",
      userType: "registered",
      mode: "date",
      ageVerified: true
    };

    const result = setMode(session, "date");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.session).toBe(session);
  });

  it("Given a valid session without age verification When a mode transition is requested Then the service rejects with AGE_GATE_REQUIRED", () => {
    const session: Session = {
      sessionId: "s_age",
      userType: "registered",
      mode: "cruise",
      ageVerified: false
    };

    const result = setMode(session, "date");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toEqual({
      code: "AGE_GATE_REQUIRED",
      message: "You must be 18 or older to use Red Door.",
      context: { minimumAge: 18 }
    });
  });
});
