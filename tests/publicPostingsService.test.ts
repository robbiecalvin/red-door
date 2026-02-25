import { createPublicPostingsService } from "../backend/src/services/publicPostingsService";

describe("publicPostingsService", () => {
  it("Given a guest session When listing postings Then listing succeeds", () => {
    const svc = createPublicPostingsService();
    const res = svc.list();
    expect(res.ok).toBe(true);
  });

  it("Given a guest session When creating an ad Then creation succeeds with guest author key", () => {
    const svc = createPublicPostingsService();
    const res = svc.create({ userType: "guest", sessionToken: "s_1", ageVerified: true }, { type: "ad", title: "t", body: "b" });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.authorUserId).toBe("guest:s_1");
  });

  it("Given a guest session When creating an event Then ANONYMOUS_FORBIDDEN is returned", () => {
    const svc = createPublicPostingsService();
    const res = svc.create({ userType: "guest", sessionToken: "s_1", ageVerified: true }, { type: "event", title: "t", body: "b" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error.code).toBe("ANONYMOUS_FORBIDDEN");
  });

  it("Given a guest session without age verification When creating an ad Then creation still succeeds", () => {
    const svc = createPublicPostingsService();
    const res = svc.create({ userType: "guest", sessionToken: "s_2", ageVerified: false }, { type: "ad", title: "t2", body: "b2" });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.authorUserId).toBe("guest:s_2");
  });

  it("Given a registered session When create is called Then posting is created", () => {
    const svc = createPublicPostingsService({ nowMs: () => 1000, idFactory: () => "p1" });
    const res = svc.create(
      { userType: "registered", userId: "u_1", ageVerified: true },
      { type: "event", title: "Launch", body: "Tonight" }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value).toEqual({
      postingId: "p1",
      type: "event",
      title: "Launch",
      body: "Tonight",
      authorUserId: "u_1",
      createdAtMs: 1000,
      invitedUserIds: [],
      acceptedUserIds: []
    });
  });

  it("Given an event host When inviting and invitee accepts Then event tracks invited and accepted users", () => {
    const svc = createPublicPostingsService({ nowMs: () => 1000, idFactory: () => "event_1" });
    const created = svc.create(
      { userType: "registered", userId: "host_1", ageVerified: true },
      { type: "event", title: "Private Event", body: "Members only." }
    );
    expect(created.ok).toBe(true);

    const invite = svc.inviteToEvent(
      { userType: "registered", userId: "host_1", ageVerified: true },
      "event_1",
      "guest_2"
    );
    expect(invite.ok).toBe(true);

    const response = svc.respondToEventInvite(
      { userType: "registered", userId: "guest_2", ageVerified: true },
      "event_1",
      true
    );
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error("unreachable");
    expect(response.value.invitedUserIds).toEqual(["guest_2"]);
    expect(response.value.acceptedUserIds).toEqual(["guest_2"]);
  });
});
