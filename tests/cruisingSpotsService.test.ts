import { createCruisingSpotsService } from "../backend/src/services/cruisingSpotsService";

describe("cruisingSpotsService", () => {
  it("Given a registered user When creating a spot Then it persists and lists", () => {
    const svc = createCruisingSpotsService({ nowMs: () => 1000, idFactory: () => "spot_1" });
    const create = svc.create(
      { userType: "registered", userId: "u_1", ageVerified: true },
      { name: "Warehouse Alley", address: "123 Main St", lat: 49.2827, lng: -123.1207, description: "After dark only." }
    );
    expect(create.ok).toBe(true);
    if (!create.ok) throw new Error("unreachable");
    expect(create.value).toEqual({
      spotId: "spot_1",
      name: "Warehouse Alley",
      address: "123 Main St",
      lat: 49.2827,
      lng: -123.1207,
      description: "After dark only.",
      creatorUserId: "user:u_1",
      createdAtMs: 1000,
      checkInCount: 0,
      actionCount: 0,
      moderationStatus: "approved",
      moderatedAtMs: 1000,
      moderatedByUserId: "system:auto"
    });

    const list = svc.listAll();
    expect(list.ok).toBe(true);
    if (!list.ok) throw new Error("unreachable");
    expect(list.value.map((spot) => spot.spotId)).toEqual(
      expect.arrayContaining(["spot_1", "spot_van_pumpjack_pub", "spot_van_fantasy_factory_davie", "spot_van_aids_memorial"])
    );
  });

  it("Given a guest When creating a spot Then it succeeds and tracks guest actor key", () => {
    const svc = createCruisingSpotsService();
    const res = svc.create({ userType: "guest", sessionToken: "guest_tok", ageVerified: true }, { name: "x", address: "a", lat: 1, lng: 2, description: "y" });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.creatorUserId).toBe("session:guest_tok");
  });

  it("Given a guest without age verification When creating a spot Then creation still succeeds", () => {
    const svc = createCruisingSpotsService();
    const res = svc.create({ userType: "guest", sessionToken: "guest_tok_2", ageVerified: false }, { name: "x2", address: "a2", lat: 1, lng: 2, description: "y2" });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.creatorUserId).toBe("session:guest_tok_2");
  });

  it("Given a created spot When checking in Then the latest check-in is listed", () => {
    let now = 1000;
    const svc = createCruisingSpotsService({ nowMs: () => now, idFactory: () => "spot_2" });
    const created = svc.create(
      { userType: "registered", userId: "host_1", ageVerified: true },
      { name: "Pier", address: "42 Dock Ave", lat: 49.2, lng: -123.1, description: "By the water." }
    );
    expect(created.ok).toBe(true);

    now = 2000;
    const checkIn = svc.checkIn({ userType: "guest", sessionToken: "s_guest", ageVerified: true }, "spot_2");
    expect(checkIn.ok).toBe(true);
    if (!checkIn.ok) throw new Error("unreachable");
    expect(checkIn.value.actorKey).toBe("session:s_guest");

    const list = svc.listCheckIns("spot_2");
    expect(list.ok).toBe(true);
    if (!list.ok) throw new Error("unreachable");
    expect(list.value).toHaveLength(1);
    expect(list.value[0].checkedInAtMs).toBe(2000);

    now = 3000;
    const action = svc.recordAction({ userType: "guest", sessionToken: "s_guest", ageVerified: true }, "spot_2");
    expect(action.ok).toBe(true);
    const spots = svc.listAll();
    expect(spots.ok).toBe(true);
    if (!spots.ok) throw new Error("unreachable");
    const createdSpot = spots.value.find((spot) => spot.spotId === "spot_2");
    expect(createdSpot?.checkInCount).toBe(1);
    expect(createdSpot?.actionCount).toBe(1);
  });

  it("Given a spot with photo media id When create is called Then the media reference is persisted", () => {
    const svc = createCruisingSpotsService({ nowMs: () => 1000, idFactory: () => "spot_photo_1" });
    const res = svc.create(
      { userType: "registered", userId: "u_3", ageVerified: true },
      { name: "Tunnel", address: "11 South", lat: 1, lng: 2, description: "Quiet", photoMediaId: "media_456" }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value.photoMediaId).toBe("media_456");
  });

  it("Given disallowed kid-variation content in spot description When create is called Then request is rejected", () => {
    const svc = createCruisingSpotsService({ nowMs: () => 1000, idFactory: () => "spot_bad_1" });
    const res = svc.create(
      { userType: "registered", userId: "u_3", ageVerified: true },
      { name: "Tunnel", address: "11 South", lat: 1, lng: 2, description: "avoid k1d terms" }
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "INVALID_INPUT", message: "Spot description contains disallowed language." });
  });

  it("Given a newly created spot When listed publicly Then it is visible immediately", () => {
    const svc = createCruisingSpotsService({ nowMs: () => 1000, idFactory: () => "spot_mod_1" });
    const created = svc.create(
      { userType: "registered", userId: "u_admin", ageVerified: true },
      { name: "Night Dock", address: "Pier 4", lat: 1, lng: 2, description: "Late nights." }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");

    const listed = svc.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error("unreachable");
    expect(listed.value.map((spot) => spot.spotId)).toEqual(
      expect.arrayContaining(["spot_mod_1", "spot_van_pumpjack_pub", "spot_van_fantasy_factory_davie", "spot_van_aids_memorial"])
    );
    expect(listed.value.find((spot) => spot.spotId === "spot_mod_1")?.moderationStatus).toBe("approved");
  });

  it("Given a new service When listing spots Then permanent seeded spots are present", () => {
    const svc = createCruisingSpotsService();
    const listed = svc.listAll();
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error("unreachable");
    expect(listed.value.map((spot) => spot.spotId)).toEqual(
      expect.arrayContaining(["spot_van_pumpjack_pub", "spot_van_fantasy_factory_davie", "spot_van_aids_memorial"])
    );
  });

  it("Given a permanent seeded spot When remove is called Then it is rejected", () => {
    const svc = createCruisingSpotsService();
    const removed = svc.remove("spot_van_pumpjack_pub");
    expect(removed.ok).toBe(false);
    if (removed.ok) throw new Error("unreachable");
    expect(removed.error).toEqual({
      code: "INVALID_INPUT",
      message: "Built-in cruising spots cannot be removed."
    });
  });
});
