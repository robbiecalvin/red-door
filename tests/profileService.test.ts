import { createInMemoryProfileRepository } from "../backend/src/repositories/inMemoryProfileRepository";
import { createProfileService } from "../backend/src/services/profileService";

describe("profileService", () => {
  it("Given an age-verified guest session When upsertMe is called Then profile is saved under a session-scoped key and can be read back", async () => {
    const repo = createInMemoryProfileRepository();
    const svc = createProfileService({ repo, nowMs: () => 1_700_000_000_000 });

    const session = { userType: "guest" as const, sessionToken: "guest_session_1", ageVerified: true };

    const upsert = await svc.upsertMe(session, {
      displayName: "Guest One",
      age: 28,
      bio: "Hello from guest",
      stats: { race: "Latino", heightInches: 70 }
    });

    expect(upsert.ok).toBe(true);
    if (!upsert.ok) throw new Error("unreachable");
    expect(upsert.value.userId).toBe("guest:guest_session_1");

    const read = await svc.getMe(session);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("unreachable");
    expect(read.value.displayName).toBe("Guest One");
  });

  it("Given guest sessions with different session tokens When each saves a profile Then data is isolated by session token", async () => {
    const repo = createInMemoryProfileRepository();
    const svc = createProfileService({ repo });

    const guestA = { userType: "guest" as const, sessionToken: "guest_a", ageVerified: true };
    const guestB = { userType: "guest" as const, sessionToken: "guest_b", ageVerified: true };

    const a = await svc.upsertMe(guestA, { displayName: "Guest A", age: 22, bio: "A", stats: {} });
    const b = await svc.upsertMe(guestB, { displayName: "Guest B", age: 24, bio: "B", stats: {} });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const readA = await svc.getMe(guestA);
    const readB = await svc.getMe(guestB);
    expect(readA.ok).toBe(true);
    expect(readB.ok).toBe(true);
    if (!readA.ok || !readB.ok) throw new Error("unreachable");
    expect(readA.value.displayName).toBe("Guest A");
    expect(readB.value.displayName).toBe("Guest B");
  });

  it("Given a guest session missing sessionToken When upsertMe is called Then it rejects with INVALID_INPUT", async () => {
    const repo = createInMemoryProfileRepository();
    const svc = createProfileService({ repo });

    const res = await svc.upsertMe({ userType: "guest", ageVerified: true }, { displayName: "A", age: 22, bio: "A", stats: {} });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "INVALID_INPUT", message: "Invalid session." });
  });

  it("Given a non-age-verified guest session When upsertMe is called Then it rejects with AGE_GATE_REQUIRED", async () => {
    const repo = createInMemoryProfileRepository();
    const svc = createProfileService({ repo });

    const res = await svc.upsertMe(
      { userType: "guest", sessionToken: "guest_session_1", ageVerified: false },
      { displayName: "A", age: 22, bio: "A", stats: {} }
    );

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({
      code: "AGE_GATE_REQUIRED",
      message: "You must be 18 or older to use Red Door.",
      context: { minimumAge: 18 }
    });
  });

  it("Given an age-verified registered session with valid input When upsertMe is called Then a subsequent getMe returns updated fields", async () => {
    const repo = createInMemoryProfileRepository();
    const svc = createProfileService({ repo, nowMs: () => 1_700_000_000_001 });

    const session = { userType: "registered" as const, userId: "user_1", ageVerified: true };

    const upsert = await svc.upsertMe(session, {
      displayName: "Registered User",
      age: 32,
      bio: "Bio",
      stats: { cutStatus: "cut", position: "top", weightLbs: 180 }
    });
    expect(upsert.ok).toBe(true);

    const read = await svc.getMe(session);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("unreachable");
    expect(read.value.displayName).toBe("Registered User");
    expect(read.value.stats.position).toBe("top");
  });

  it("Given a registered session with invalid profile fields When upsertMe is called Then it rejects deterministically and does not mutate stored profile", async () => {
    const repo = createInMemoryProfileRepository();
    const svc = createProfileService({ repo });

    const session = { userType: "registered" as const, userId: "user_1", ageVerified: true };

    const initial = await svc.upsertMe(session, { displayName: "Valid Name", age: 30, bio: "Valid", stats: {} });
    expect(initial.ok).toBe(true);

    const invalid = await svc.upsertMe(session, { displayName: "", age: 15, bio: "Invalid", stats: {} });
    expect(invalid.ok).toBe(false);
    if (invalid.ok) throw new Error("unreachable");
    expect(invalid.error.code).toBe("INVALID_INPUT");

    const read = await svc.getMe(session);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("unreachable");
    expect(read.value.displayName).toBe("Valid Name");
    expect(read.value.age).toBe(30);
  });

  it("Given existing gallery/media refs When updateMediaReferences is called Then gallery remove and set-main succeed", async () => {
    const repo = createInMemoryProfileRepository();
    const svc = createProfileService({ repo, nowMs: () => 1_700_000_000_222 });
    const session = { userType: "registered" as const, userId: "user_1", ageVerified: true };

    const seeded = await svc.upsertMe(session, {
      displayName: "User",
      age: 30,
      bio: "Bio",
      stats: {}
    });
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) throw new Error("unreachable");
    await repo.upsert({
      ...seeded.value,
      mainPhotoMediaId: "m1",
      galleryMediaIds: ["g1", "g2", "g3"]
    });

    const updated = await svc.updateMediaReferences(session, {
      galleryMediaIds: ["g1", "g3"],
      mainPhotoMediaId: "g1"
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error("unreachable");
    expect(updated.value.galleryMediaIds).toEqual(["g1", "g3"]);
    expect(updated.value.mainPhotoMediaId).toBe("g1");
  });

  it("Given a media id not already attached to the profile When updateMediaReferences is called Then request is rejected", async () => {
    const repo = createInMemoryProfileRepository();
    const svc = createProfileService({ repo });
    const session = { userType: "registered" as const, userId: "user_1", ageVerified: true };

    const seeded = await svc.upsertMe(session, {
      displayName: "User",
      age: 30,
      bio: "Bio",
      stats: {}
    });
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) throw new Error("unreachable");
    await repo.upsert({
      ...seeded.value,
      mainPhotoMediaId: "m1",
      galleryMediaIds: ["g1", "g2"]
    });

    const bad = await svc.updateMediaReferences(session, {
      galleryMediaIds: ["g1", "x999"]
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("unreachable");
    expect(bad.error.code).toBe("INVALID_INPUT");
  });

  it("Given disallowed kid-variation content in profile text When upsertMe is called Then it rejects with INVALID_INPUT", async () => {
    const repo = createInMemoryProfileRepository();
    const svc = createProfileService({ repo });

    const res = await svc.upsertMe(
      { userType: "registered", userId: "user_2", ageVerified: true },
      { displayName: "Normal", age: 29, bio: "contains ki1d language", stats: {} }
    );

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "INVALID_INPUT", message: "Bio contains disallowed language." });
  });
});
