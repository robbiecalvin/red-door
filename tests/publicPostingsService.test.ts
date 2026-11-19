import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicPostingsService } from "../backend/src/services/publicPostingsService";

describe("publicPostingsService", () => {
  it("Given a guest session When listing postings Then listing succeeds", () => {
    const svc = createPublicPostingsService();
    const res = svc.list();
    expect(res.ok).toBe(true);
  });

  it("Given a guest session When creating a posting Then publishing is denied", () => {
    const svc = createPublicPostingsService();
    const res = svc.create({ userType: "guest", sessionToken: "s_1", ageVerified: true }, { type: "ad", title: "t", body: "b" });
    expect(res).toMatchObject({ok: false, error: {code: "ANONYMOUS_FORBIDDEN"}});
  });

  it("Given a guest session When creating an event Then ANONYMOUS_FORBIDDEN is returned", () => {
    const svc = createPublicPostingsService();
    const res = svc.create(
      { userType: "guest", sessionToken: "s_1", ageVerified: true },
      { type: "event", title: "t", body: "b", lat: 1, lng: 2, eventStartAtMs: 2000, locationInstructions: "Back door", groupDetails: "Details" }
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error.code).toBe("ANONYMOUS_FORBIDDEN");
  });

  it("requires verified adult age and current Plus to publish, while keeping the listing readable", () => {
    const service = createPublicPostingsService({ nowMs: () => 1000 });
    const member = { userType: "registered", userId: "member", ageVerified: true } as const;
    const draft = { type: "ad", title: "Weekend plan", body: "Meet downtown", availability: "travelling" };
    expect(service.create(member, draft)).toMatchObject({ ok: false, error: { code: "PLUS_REQUIRED" } });
    expect(service.create({...member, tier: "premium", plusExpiresAtMs: 1000}, draft)).toMatchObject({ ok: false, error: { code: "PLUS_REQUIRED" } });
    expect(service.create({...member, tier: "premium", ageVerified: false}, draft)).toMatchObject({ ok: false, error: { code: "AGE_GATE_REQUIRED" } });
    expect(service.create({...member, tier: "premium"}, {...draft, availability: "invalid"})).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(service.create({...member, tier: "premium"}, draft)).toMatchObject({ ok: true, value: { availability: "travelling" } });
    expect(service.list("ad", member)).toMatchObject({ ok: true, value: [{ title: draft.title, availability: "travelling" }] });
  });

  it("Given a registered session When create is called Then posting is created", () => {
    const svc = createPublicPostingsService({ nowMs: () => 1000, idFactory: () => "p1" });
    const res = svc.create(
      { userType: "registered", userId: "u_1", ageVerified: true },
      { type: "event", title: "Launch", body: "Tonight", lat: 37.7749, lng: -122.4194, eventStartAtMs: 2000, locationInstructions: "Back lot", groupDetails: "Members only." }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value).toEqual({
      postingId: "p1",
      type: "event",
      title: "Launch",
      body: "Tonight",
      lat: 37.7749,
      lng: -122.4194,
      eventStartAtMs: 2000,
      locationInstructions: "Back lot",
      groupDetails: "Members only.",
      authorUserId: "u_1",
      createdAtMs: 1000,
      invitedUserIds: [],
      acceptedUserIds: [],
      joinRequestUserIds: [],
      moderationStatus: "approved",
      moderatedAtMs: 1000,
      moderatedByUserId: "system:auto"
    });
  });

  it("Given an event host When inviting and invitee accepts Then event tracks invited and accepted users", () => {
    const svc = createPublicPostingsService({ nowMs: () => 1000, idFactory: () => "event_1" });
    const created = svc.create(
      { userType: "registered", userId: "host_1", ageVerified: true },
      { type: "event", title: "Private Event", body: "Members only.", lat: 40.7128, lng: -74.006, eventStartAtMs: 2000, locationInstructions: "Use side gate", groupDetails: "Bring ID." }
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
      { type: "event", title: "Group", body: "Body", lat: 34.0522, lng: -118.2437, eventStartAtMs: 5000, locationInstructions: "Text host on arrival", groupDetails: "More details" }
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

  it("expires an invitation at the deadline without revoking an earlier acceptance", () => {
    let now = 1000;
    const service = createPublicPostingsService({ nowMs: () => now, idFactory: () => "event" });
    const host = { userType: "registered", userId: "host", ageVerified: true } as const;
    const accepted = { ...host, userId: "accepted" };
    const waiting = { ...host, userId: "waiting" };
    expect(service.create(host, {
      type: "event", title: "Group", body: "Summary", lat: 1, lng: 2, eventStartAtMs: 5000,
      locationInstructions: "Private address", groupDetails: "Details"
    }).ok).toBe(true);
    expect(service.inviteToEvent(host, "event", waiting.userId, 1000).ok).toBe(false);
    expect(service.inviteToEvent(host, "event", waiting.userId, 5001).ok).toBe(false);
    expect(service.inviteToEvent(host, "event", waiting.userId, 2000)).toMatchObject({ok: true, value: {expiresAtMs: 2000}});
    expect(service.inviteToEvent(host, "event", accepted.userId, 2000).ok).toBe(true);
    expect(service.listEventInvites(waiting)).toMatchObject({
      ok: true, value: [{ invitedUserIds: ["waiting"], inviteExpiresAtByUserId: { waiting: 2000 } }]
    });
    expect(service.list("event")).toMatchObject({ ok: true, value: [{ inviteExpiresAtByUserId: {} }] });
    now = 1999;
    expect(service.respondToEventInvite(accepted, "event", true).ok).toBe(true);
    now = 2000;
    expect(service.listEventInvites(waiting)).toEqual({ok: true, value: []});
    expect(service.respondToEventInvite(waiting, "event", true).ok).toBe(false);
    expect(service.list("event", accepted)).toMatchObject({ok: true, value: [{locationInstructions: "Private address"}]});
    expect(service.respondToEventInvite(accepted, "event", false).ok).toBe(true);
    expect(service.inviteToEvent(host, "event", waiting.userId)).toMatchObject({ok: true, value: {expiresAtMs: 5000}});
    expect(service.respondToEventInvite(waiting, "event", true).ok).toBe(true);
  });

  it("creates weekly occurrences atomically with independent dates and attendance", () => {
    let now = 1000;
    let id = 0;
    const service = createPublicPostingsService({ nowMs: () => now, idFactory: () => `event-${++id}` });
    const host = { userType: "registered", userId: "host", ageVerified: true } as const;
    const attendee = { ...host, userId: "attendee" };
    const week = 7 * 86400000;
    const dates = [{ startsAtMs: 4000, endsAtMs: 5000 }, { startsAtMs: 4000 + week, endsAtMs: 5000 + week }];
    const draft = {type: "event", title: "Weekly private group", body: "Summary", lat: 1, lng: 2, eventStartAtMs: 5000, locationInstructions: "Private address", groupDetails: "Details"};

    expect(service.create(host, { ...draft, groupSchedule: [dates[0], { startsAtMs: 4200, endsAtMs: 5300 }] }).ok).toBe(false);
    expect(service.create(host, { ...draft, groupSchedule: Array.from({length: 13}, () => dates[0]) }).ok).toBe(false);
    expect(service.list("event", host)).toEqual({ ok: true, value: [] });
    expect(service.create(host, { ...draft, groupSchedule: dates })).toMatchObject({
      ok: true, value: { postingId: "event-1", groupOccurrence: 1, groupOccurrenceCount: 2, groupStartsAtMs: 4000 }
    });
    expect(service.inviteToEvent(host, "event-1", attendee.userId).ok).toBe(true);
    expect(service.respondToEventInvite(attendee, "event-1", true).ok).toBe(true);
    expect(service.respondToEventInvite(attendee, "event-2", true).ok).toBe(false);
    const feed = service.list("event", attendee);
    if (!feed.ok) throw new Error("Group listing failed");
    expect(feed.value[0]).toMatchObject({ locationInstructions: "Private address" });
    expect(feed.value[1]).toMatchObject({
      postingId: "event-2", groupSeriesId: "event-1", groupOccurrence: 2, groupStartsAtMs: 4000 + week, acceptedUserIds: []
    });
    expect(feed.value[1]).not.toHaveProperty("locationInstructions");
    now = 5000;
    expect(service.list("event", host)).toMatchObject({ ok: true, value: [{ postingId: "event-2" }] });
  });

  it("restores private group messages without leaking them in postings and expires the discussion", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reddoor-group-discussion-"));
    try {
      let now = 1000;
      const deps = { nowMs: () => now, idFactory: () => "event", persistenceFilePath: path.join(directory, "postings.json") };
      const first = createPublicPostingsService(deps);
      const host = { userType: "registered", userId: "host", ageVerified: true } as const;
      const viewer = { ...host, userId: "viewer" };
      expect(first.create(host, {
        type: "event", title: "Group", body: "Summary", lat: 1, lng: 2, eventStartAtMs: 5000,
        locationInstructions: "Address", groupDetails: "Details"
      }).ok).toBe(true);
      expect(first.sendGroupMessage(host, "event", "Fixture private group message").ok).toBe(true);
      const restored = createPublicPostingsService(deps);
      expect(restored.listGroupDiscussion(host, "event")).toMatchObject({
        ok: true, value: [{ authorUserId: "host", text: "Fixture private group message" }]
      });
      expect(restored.listGroupDiscussion(viewer, "event").ok).toBe(false);
      expect(JSON.stringify(restored.list("event", host))).not.toContain("Fixture private group message");
      now = 5000;
      expect(restored.listGroupDiscussion(host, "event").ok).toBe(false);
      expect(restored.list("event", host)).toEqual({ ok: true, value: [] });
      expect(fs.readFileSync(deps.persistenceFilePath, "utf8")).not.toContain("Fixture private group message");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([0, -1, 1.5, "2", Number.MAX_SAFE_INTEGER + 1])("rejects invalid group guest limit %s", guestLimit => {
    const service = createPublicPostingsService({ nowMs: () => 1000 });
    const result = service.create(
      { userType: "registered", userId: "host", ageVerified: true },
      { type: "event", title: "Group", body: "Summary", lat: 1, lng: 2, eventStartAtMs: 2000, locationInstructions: "Door", groupDetails: "Details", guestLimit }
    );
    expect(result.ok).toBe(false);
  });

  it("Given a posting with photo media id When create is called Then the media reference is persisted", () => {
    const svc = createPublicPostingsService({ nowMs: () => 1000, idFactory: () => "ad_photo_1" });
    const res = svc.create(
      { userType: "registered", userId: "u_2", ageVerified: true, tier: "premium" },
      { type: "ad", title: "With photo", body: "Details", photoMediaId: "media_123" }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.photoMediaId).toBe("media_123");
  });

  it("Given disallowed kid-variation text in an ad body When create is called Then request is rejected", () => {
    const svc = createPublicPostingsService();
    const res = svc.create(
      { userType: "registered", userId: "u_2", ageVerified: true, tier: "premium" },
      { type: "ad", title: "Open ad", body: "No ki.d content please" }
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "INVALID_INPUT", message: "Body contains disallowed language." });
  });

  it("Given a newly created posting When listing publicly Then it is visible immediately", () => {
    const svc = createPublicPostingsService({ nowMs: () => 1000, idFactory: () => "ad_mod_1" });
    const created = svc.create(
      { userType: "registered", userId: "u_9", ageVerified: true, tier: "premium" },
      { type: "ad", title: "Pending ad", body: "Waiting review." }
    );
    expect(created.ok).toBe(true);

    const listed = svc.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error("unreachable");
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0].moderationStatus).toBe("approved");
  });

  it("Given an event end time in the past When listing postings Then the event is pruned", () => {
    let now = 5_000;
    const svc = createPublicPostingsService({ nowMs: () => now, idFactory: () => "event_expired_1" });
    const created = svc.create(
      { userType: "registered", userId: "host_3", ageVerified: true },
      { type: "event", title: "Short Group", body: "Body", lat: 1, lng: 2, eventStartAtMs: 5_100, locationInstructions: "Door", groupDetails: "Details" }
    );
    expect(created.ok).toBe(true);

    now = 5_200;
    const listed = svc.list("event");
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error("unreachable");
    expect(listed.value).toHaveLength(0);
  });
});
