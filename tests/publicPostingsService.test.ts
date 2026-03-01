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
    const res = svc.create(
      { userType: "guest", sessionToken: "s_1", ageVerified: true },
      { type: "event", title: "t", body: "b", eventStartAtMs: 2000, locationInstructions: "Back door", groupDetails: "Details" }
    );
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
      { type: "event", title: "Launch", body: "Tonight", eventStartAtMs: 2000, locationInstructions: "Back lot", groupDetails: "Members only." }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value).toEqual({
      postingId: "p1",
      type: "event",
      title: "Launch",
      body: "Tonight",
      eventStartAtMs: 2000,
      locationInstructions: "Back lot",
      groupDetails: "Members only.",
      authorUserId: "u_1",
      createdAtMs: 1000,
      invitedUserIds: [],
      acceptedUserIds: [],
      joinRequestUserIds: []
    });
  });

  it("Given an event host When inviting and invitee accepts Then event tracks invited and accepted users", () => {
    const svc = createPublicPostingsService({ nowMs: () => 1000, idFactory: () => "event_1" });
    const created = svc.create(
      { userType: "registered", userId: "host_1", ageVerified: true },
      { type: "event", title: "Private Event", body: "Members only.", eventStartAtMs: 2000, locationInstructions: "Use side gate", groupDetails: "Bring ID." }
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

  it("Given a non-host user When requesting to join and host approves Then user is marked attending", () => {
    const svc = createPublicPostingsService({ nowMs: () => 1000, idFactory: () => "event_2" });
    const created = svc.create(
      { userType: "registered", userId: "host_2", ageVerified: true },
      { type: "event", title: "Group", body: "Body", eventStartAtMs: 5000, locationInstructions: "Text host on arrival", groupDetails: "More details" }
    );
    expect(created.ok).toBe(true);

    const request = svc.requestToJoinEvent({ userType: "registered", userId: "user_9", ageVerified: true }, "event_2");
    expect(request.ok).toBe(true);

    const approved = svc.respondToEventJoinRequest(
      { userType: "registered", userId: "host_2", ageVerified: true },
      "event_2",
      "user_9",
      true
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("unreachable");
    expect(approved.value.joinRequestUserIds).toEqual([]);
    expect(approved.value.acceptedUserIds).toEqual(["user_9"]);
  });

  it("Given a posting with photo media id When create is called Then the media reference is persisted", () => {
    const svc = createPublicPostingsService({ nowMs: () => 1000, idFactory: () => "ad_photo_1" });
    const res = svc.create(
      { userType: "registered", userId: "u_2", ageVerified: true },
      { type: "ad", title: "With photo", body: "Details", photoMediaId: "media_123" }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.photoMediaId).toBe("media_123");
  });

  it("Given disallowed kid-variation text in an ad body When create is called Then request is rejected", () => {
    const svc = createPublicPostingsService();
    const res = svc.create(
      { userType: "registered", userId: "u_2", ageVerified: true },
      { type: "ad", title: "Open ad", body: "No ki.d content please" }
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "INVALID_INPUT", message: "Body contains disallowed language." });
  });
});
