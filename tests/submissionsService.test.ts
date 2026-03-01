import { createSubmissionsService } from "../backend/src/services/submissionsService";

describe("submissionsService", () => {
  it("Given a submission When view is recorded Then view count increments", () => {
    const svc = createSubmissionsService({ nowMs: () => 100, idFactory: () => "s1" });
    const created = svc.create({ userType: "registered", userId: "u_1", ageVerified: true }, "Story", "Body");
    if (!created.ok) throw new Error("setup failed");

    const viewed = svc.recordView("s1");
    expect(viewed.ok).toBe(true);
    if (!viewed.ok) throw new Error("unreachable");
    expect(viewed.value.viewCount).toBe(1);
  });

  it("Given a submission When valid rating is recorded Then aggregates update", () => {
    const svc = createSubmissionsService({ nowMs: () => 100, idFactory: () => "s1" });
    const created = svc.create({ userType: "registered", userId: "u_1", ageVerified: true }, "Story", "Body");
    if (!created.ok) throw new Error("setup failed");

    const rated = svc.rate("s1", 4);
    expect(rated.ok).toBe(true);
    if (!rated.ok) throw new Error("unreachable");
    expect(rated.value.ratingCount).toBe(1);
    expect(rated.value.ratingSum).toBe(4);
  });

  it("Given invalid rating When rate is called Then RATING_OUT_OF_RANGE is returned", () => {
    const svc = createSubmissionsService({ nowMs: () => 100, idFactory: () => "s1" });
    const created = svc.create({ userType: "registered", userId: "u_1", ageVerified: true }, "Story", "Body");
    if (!created.ok) throw new Error("setup failed");

    const rated = svc.rate("s1", 8);
    expect(rated.ok).toBe(false);
    if (rated.ok) throw new Error("unreachable");
    expect(rated.error.code).toBe("RATING_OUT_OF_RANGE");
  });

  it("Given disallowed kid-variation text in title/body When create is called Then INVALID_INPUT is returned", () => {
    const svc = createSubmissionsService({ nowMs: () => 100, idFactory: () => "s1" });
    const created = svc.create({ userType: "registered", userId: "u_1", ageVerified: true }, "K!D story", "Body");
    expect(created.ok).toBe(false);
    if (created.ok) throw new Error("unreachable");
    expect(created.error).toEqual({ code: "INVALID_INPUT", message: "Title contains disallowed language." });
  });
});
