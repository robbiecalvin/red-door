import { createPresenceService } from "../backend/src/services/presenceService";

describe("presenceService", () => {
  it("Given invalid presence service dependencies When createPresenceService is called Then it throws deterministically", () => {
    expect(() => createPresenceService({ randomizationMeters: -1 })).toThrow(
      "presenceService requires randomizationMeters to be >= 0."
    );
    expect(() => createPresenceService({ presenceExpiryMs: 0 })).toThrow("presenceService requires a positive presenceExpiryMs.");
  });

  it("Given a session currently in Cruise Mode When a presence update is submitted with client-provided coordinates Then coordinates are randomized server-side And raw client coordinates are never stored or broadcast", () => {
    const now = 1_700_000_000_000;
    const broadcasts: Array<{ type: string; payload: any }> = [];

    // Deterministic RNG: u=1 -> r=radius, v=0 -> theta=0 => dx=+radius, dy=0.
    const rngValues = [1, 0];
    let i = 0;
    const random = () => rngValues[i++ % rngValues.length];

    const svc = createPresenceService({
      nowMs: () => now,
      random,
      randomizationMeters: 100,
      presenceExpiryMs: 45_000,
      broadcaster: {
        broadcast(type: string, payload: unknown) {
          broadcasts.push({ type, payload });
        }
      }
    });

    const inputLat = 40.0;
    const inputLng = -74.0;

    const result = svc.updatePresence(
      { sessionToken: "s_1", userType: "guest", mode: "cruise", ageVerified: true },
      { lat: inputLat, lng: inputLng, status: "online" }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    // Stored coordinates are randomized (in this deterministic case, lng changes).
    expect(result.value.lat).toBe(inputLat);
    expect(result.value.lng).not.toBe(inputLng);

    // Active presence never contains raw client coordinates.
    const active = svc.listActivePresence();
    expect(active).toHaveLength(1);
    expect(active[0]!.lat).toBe(inputLat);
    expect(active[0]!.lng).not.toBe(inputLng);

    // Broadcast contains only randomized coords (never the raw input).
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]!.type).toBe("presence_update");
    expect(broadcasts[0]!.payload.lat).toBe(inputLat);
    expect(broadcasts[0]!.payload.lng).not.toBe(inputLng);
  });

  it("Given a session currently in Date Mode When a presence update is attempted Then the update is rejected And no presence data is stored, cached, or broadcast", () => {
    const broadcasts: Array<{ type: string; payload: any }> = [];
    const svc = createPresenceService({
      broadcaster: {
        broadcast(type: string, payload: unknown) {
          broadcasts.push({ type, payload });
        }
      }
    });

    const result = svc.updatePresence(
      { sessionToken: "s_2", userType: "registered", mode: "date", userId: "u_1", ageVerified: true },
      { lat: 40.0, lng: -74.0 }
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toEqual({
      code: "PRESENCE_NOT_ALLOWED",
      message: "Presence updates are not allowed in Date Mode.",
      context: { mode: "date" }
    });
    expect(svc.listActivePresence()).toEqual([]);
    expect(broadcasts).toEqual([]);
  });

  it("Given a session currently in Hybrid Mode When a presence update is attempted Then the update is accepted", () => {
    const svc = createPresenceService({
      randomizationMeters: 0,
      nowMs: () => 1
    });

    const result = svc.updatePresence(
      { sessionToken: "s_3", userType: "registered", mode: "hybrid", userId: "u_1", ageVerified: true },
      { lat: 10, lng: 20 }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.key).toBe("user:u_1");
  });

  it("Given invalid coordinates When a presence update is attempted Then the update is rejected with UNAUTHORIZED_ACTION And nothing is stored", () => {
    const svc = createPresenceService();

    const result = svc.updatePresence(
      { sessionToken: "s_4", userType: "guest", mode: "cruise", ageVerified: true },
      { lat: 999, lng: 0 }
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid coordinates." });
    expect(svc.listActivePresence()).toEqual([]);
  });

  it("Given an invalid session When a presence update is attempted Then the update is rejected with INVALID_SESSION", () => {
    const svc = createPresenceService();

    const result = svc.updatePresence({ sessionToken: " ", userType: "guest", mode: "cruise" } as any, {
      lat: 0,
      lng: 0
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toEqual({ code: "INVALID_SESSION", message: "Invalid session." });
  });

  it("Given invalid session shapes When a presence update is attempted Then the update is rejected with INVALID_SESSION", () => {
    const svc = createPresenceService();

    const nullSession = svc.updatePresence(null as any, { lat: 0, lng: 0 });
    expect(nullSession.ok).toBe(false);
    if (nullSession.ok) throw new Error("unreachable");
    expect(nullSession.error.code).toBe("INVALID_SESSION");

    const badTokenType = svc.updatePresence({ sessionToken: 123, userType: "guest", mode: "cruise" } as any, { lat: 0, lng: 0 });
    expect(badTokenType.ok).toBe(false);
    if (badTokenType.ok) throw new Error("unreachable");
    expect(badTokenType.error.code).toBe("INVALID_SESSION");

    const badUserType = svc.updatePresence({ sessionToken: "s_bad", userType: "admin", mode: "cruise" } as any, { lat: 0, lng: 0 });
    expect(badUserType.ok).toBe(false);
    if (badUserType.ok) throw new Error("unreachable");
    expect(badUserType.error.code).toBe("INVALID_SESSION");

    const badMode = svc.updatePresence({ sessionToken: "s_bad", userType: "guest", mode: "stealth" } as any, { lat: 0, lng: 0 });
    expect(badMode.ok).toBe(false);
    if (badMode.ok) throw new Error("unreachable");
    expect(badMode.error.code).toBe("INVALID_SESSION");
  });

  it("Given a presence record older than expiry When listActivePresence is called Then expired records are removed", () => {
    let now = 1_000;
    const svc = createPresenceService({
      nowMs: () => now,
      randomizationMeters: 0,
      presenceExpiryMs: 45_000
    });

    const created = svc.updatePresence({ sessionToken: "s_5", userType: "guest", mode: "cruise", ageVerified: true }, { lat: 1, lng: 2 });
    expect(created.ok).toBe(true);

    now += 45_000;
    expect(svc.listActivePresence()).toEqual([]);
  });

  it("Given an overly long status When a presence update is accepted Then status is truncated deterministically", () => {
    const svc = createPresenceService({
      randomizationMeters: 0,
      nowMs: () => 1
    });

    const status = "x".repeat(200);
    const result = svc.updatePresence({ sessionToken: "s_6", userType: "guest", mode: "cruise", ageVerified: true }, { lat: 1, lng: 2, status });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.status).toBe("x".repeat(64));
  });

  it("Given a blank or non-string status When a presence update is accepted Then status is omitted", () => {
    const svc = createPresenceService({
      randomizationMeters: 0,
      nowMs: () => 1
    });

    const blank = svc.updatePresence({ sessionToken: "s_7", userType: "guest", mode: "cruise", ageVerified: true }, { lat: 1, lng: 2, status: "   " });
    expect(blank.ok).toBe(true);
    if (!blank.ok) throw new Error("unreachable");
    expect(blank.value.status).toBeUndefined();

    const nonString = svc.updatePresence({ sessionToken: "s_8", userType: "guest", mode: "cruise", ageVerified: true }, { lat: 1, lng: 2, status: 123 as any });
    expect(nonString.ok).toBe(true);
    if (!nonString.ok) throw new Error("unreachable");
    expect(nonString.value.status).toBeUndefined();
  });

  it("Given a presence record older than expiry When sweepExpired is called Then it returns the number of removed records", () => {
    let now = 1_000;
    const svc = createPresenceService({
      nowMs: () => now,
      randomizationMeters: 0,
      presenceExpiryMs: 10
    });

    const created = svc.updatePresence({ sessionToken: "s_9", userType: "guest", mode: "cruise", ageVerified: true }, { lat: 1, lng: 2 });
    expect(created.ok).toBe(true);

    now += 10;
    expect(svc.sweepExpired()).toBe(1);
    expect(svc.listActivePresence()).toEqual([]);
  });

  it("Given malformed input payload When updatePresence is called Then it rejects with UNAUTHORIZED_ACTION", () => {
    const svc = createPresenceService();

    const nullInput = svc.updatePresence({ sessionToken: "s_10", userType: "guest", mode: "cruise", ageVerified: true }, null as any);
    expect(nullInput.ok).toBe(false);
    if (nullInput.ok) throw new Error("unreachable");
    expect(nullInput.error.code).toBe("UNAUTHORIZED_ACTION");

    const nanInput = svc.updatePresence({ sessionToken: "s_11", userType: "guest", mode: "cruise", ageVerified: true }, { lat: Number.NaN, lng: 0 });
    expect(nanInput.ok).toBe(false);
    if (nanInput.ok) throw new Error("unreachable");
    expect(nanInput.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid coordinates." });
  });

  it("Given random values outside [0,1) When randomization is applied Then the service clamps safely and returns finite coordinates", () => {
    let call = 0;
    const random = () => (call++ === 0 ? 2 : -1);
    const svc = createPresenceService({
      random,
      randomizationMeters: 100,
      nowMs: () => 1
    });

    const result = svc.updatePresence({ sessionToken: "s_12", userType: "guest", mode: "cruise", ageVerified: true }, { lat: 90, lng: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(Number.isFinite(result.value.lat)).toBe(true);
    expect(Number.isFinite(result.value.lng)).toBe(true);
  });

  it("Given a session without age verification When a presence update is attempted Then it is rejected with AGE_GATE_REQUIRED And nothing is stored", () => {
    const svc = createPresenceService({ randomizationMeters: 0, nowMs: () => 1 });

    const result = svc.updatePresence({ sessionToken: "s_age", userType: "guest", mode: "cruise", ageVerified: false }, { lat: 1, lng: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toEqual({
      code: "AGE_GATE_REQUIRED",
      message: "You must be 18 or older to use Red Door.",
      context: { minimumAge: 18 }
    });
    expect(svc.listActivePresence()).toEqual([]);
  });
});
