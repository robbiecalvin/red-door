import { createDatingFeedService } from "../backend/src/services/datingFeedService";

describe("datingFeedService", () => {
  it("Given a registered age-verified session in Date Mode When getFeed is called Then it returns profiles excluding the current user", async () => {
    const svc = createDatingFeedService({
      userDirectory: {
        listRegisteredUserIds(): ReadonlyArray<string> {
          return ["u_me", "u_other"];
        }
      }
    });

    const res = await svc.getFeed(
      { sessionToken: "s_1", userType: "registered", mode: "date", userId: "u_me", ageVerified: true },
      50
    );

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value).toEqual([{ id: "u_other", displayName: "User u_other" }]);
  });

  it("Given a guest session When getFeed is called Then it rejects with ANONYMOUS_FORBIDDEN", async () => {
    const svc = createDatingFeedService({
      userDirectory: {
        listRegisteredUserIds(): ReadonlyArray<string> {
          return ["u_other"];
        }
      }
    });

    const res = await svc.getFeed({ sessionToken: "s_1", userType: "guest", mode: "cruise", ageVerified: true }, 50);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "ANONYMOUS_FORBIDDEN", message: "Anonymous users cannot access Date discovery." });
  });

  it("Given a non-Date mode session When getFeed is called Then it rejects deterministically", async () => {
    const svc = createDatingFeedService({
      userDirectory: {
        listRegisteredUserIds(): ReadonlyArray<string> {
          return ["u_other"];
        }
      }
    });

    const res = await svc.getFeed(
      { sessionToken: "s_1", userType: "registered", mode: "cruise", userId: "u_me", ageVerified: true },
      50
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({
      code: "UNAUTHORIZED_ACTION",
      message: "Date discovery is not allowed in the current mode.",
      context: { mode: "cruise" }
    });
  });

  it("Given an unverified session When getFeed is called Then it rejects with AGE_GATE_REQUIRED", async () => {
    const svc = createDatingFeedService({
      userDirectory: {
        listRegisteredUserIds(): ReadonlyArray<string> {
          return ["u_other"];
        }
      }
    });

    const res = await svc.getFeed(
      { sessionToken: "s_1", userType: "registered", mode: "date", userId: "u_me", ageVerified: false },
      50
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({
      code: "AGE_GATE_REQUIRED",
      message: "You must be 18 or older to use Red Door.",
      context: { minimumAge: 18 }
    });
  });

  it("Given an invalid limit When getFeed is called Then it rejects with UNAUTHORIZED_ACTION", async () => {
    const svc = createDatingFeedService({
      userDirectory: {
        listRegisteredUserIds(): ReadonlyArray<string> {
          return ["u_other"];
        }
      }
    });

    const res = await svc.getFeed(
      { sessionToken: "s_1", userType: "registered", mode: "date", userId: "u_me", ageVerified: true },
      0
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid feed limit." });
  });

  it("Given invalid deps When createDatingFeedService is called Then it throws deterministically", () => {
    expect(() => createDatingFeedService(null as any)).toThrow("datingFeedService requires deps.");
    expect(() => createDatingFeedService({ userDirectory: null } as any)).toThrow(
      "datingFeedService requires userDirectory.listRegisteredUserIds."
    );
  });

  it("Given profile data with discreet mode and stats When getFeed is called Then discreet profiles are excluded and public fields are mapped", async () => {
    const svc = createDatingFeedService({
      userDirectory: {
        listRegisteredUserIds(): ReadonlyArray<string> {
          return ["u_me", "u_hidden", "u_visible"];
        }
      },
      profileDirectory: {
        async getByUserId(userId: string) {
          if (userId === "u_hidden") {
            return {
              displayName: "Hidden User",
              age: 31,
              discreetMode: true,
              stats: { race: "Latino", heightInches: 70, weightLbs: 170, cockSizeInches: 6, cutStatus: "cut" as const }
            };
          }
          if (userId === "u_visible") {
            return {
              displayName: "Visible User",
              age: 29,
              discreetMode: false,
              stats: { race: "Black", heightInches: 72, weightLbs: 180, cockSizeInches: 7, cutStatus: "uncut" as const }
            };
          }
          return null;
        }
      }
    });

    const res = await svc.getFeed(
      { sessionToken: "s_1", userType: "registered", mode: "date", userId: "u_me", ageVerified: true },
      50
    );

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value).toEqual([
      {
        id: "u_visible",
        displayName: "Visible User",
        age: 29,
        race: "Black",
        heightInches: 72,
        weightLbs: 180,
        cockSizeInches: 7,
        cutStatus: "uncut"
      }
    ]);
  });
});
