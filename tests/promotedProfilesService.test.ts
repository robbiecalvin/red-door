import { createPromotedProfilesService } from "../backend/src/services/promotedProfilesService";

describe("promotedProfilesService", () => {
  it("Given paid registered user When publishing Then listing is created", () => {
    let now = 1_700_000_000_000;
    const svc = createPromotedProfilesService({
      nowMs: () => now,
      idFactory: () => "abc",
      feeCents: 2000
    });
    const session = {
      sessionToken: "s_1",
      userType: "registered" as const,
      userId: "u_1",
      ageVerified: true
    };

    const start = svc.startPayment(session);
    expect(start.ok).toBe(true);
    if (!start.ok) throw new Error("unreachable");
    expect(start.value.amountCents).toBe(2000);

    const confirm = svc.confirmPayment(session, start.value.paymentToken);
    expect(confirm.ok).toBe(true);

    now += 1000;
    const create = svc.createListing(session, {
      paymentToken: start.value.paymentToken,
      title: "Featured Profile",
      body: "Available for networking.",
      displayName: "Robert"
    });
    expect(create.ok).toBe(true);
    if (!create.ok) throw new Error("unreachable");
    expect(create.value).toEqual({
      listingId: "promo_abc",
      userId: "u_1",
      title: "Featured Profile",
      body: "Available for networking.",
      displayName: "Robert",
      createdAtMs: now
    });
  });

  it("Given unpaid flow When creating listing Then PAYMENT_REQUIRED is returned", () => {
    const svc = createPromotedProfilesService({ idFactory: () => "x" });
    const session = {
      sessionToken: "s_1",
      userType: "registered" as const,
      userId: "u_1",
      ageVerified: true
    };
    const start = svc.startPayment(session);
    expect(start.ok).toBe(true);
    if (!start.ok) throw new Error("unreachable");

    const create = svc.createListing(session, {
      paymentToken: start.value.paymentToken,
      title: "Featured Profile",
      body: "Body",
      displayName: "Name"
    });
    expect(create.ok).toBe(false);
    if (create.ok) throw new Error("unreachable");
    expect(create.error.code).toBe("PAYMENT_REQUIRED");
  });

  it("Given guest user When starting payment Then ANONYMOUS_FORBIDDEN is returned", () => {
    const svc = createPromotedProfilesService();
    const res = svc.startPayment({
      sessionToken: "s_guest",
      userType: "guest",
      ageVerified: true
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error.code).toBe("ANONYMOUS_FORBIDDEN");
  });

  it("Given disallowed kid-variation content in listing fields When createListing is called Then INVALID_INPUT is returned", () => {
    const svc = createPromotedProfilesService({ idFactory: () => "x" });
    const session = {
      sessionToken: "s_1",
      userType: "registered" as const,
      userId: "u_1",
      ageVerified: true
    };
    const start = svc.startPayment(session);
    expect(start.ok).toBe(true);
    if (!start.ok) throw new Error("unreachable");
    const confirm = svc.confirmPayment(session, start.value.paymentToken);
    expect(confirm.ok).toBe(true);

    const create = svc.createListing(session, {
      paymentToken: start.value.paymentToken,
      title: "Featured",
      body: "normal body",
      displayName: "k.i.d user"
    });
    expect(create.ok).toBe(false);
    if (create.ok) throw new Error("unreachable");
    expect(create.error).toEqual({ code: "INVALID_INPUT", message: "Display name contains disallowed language." });
  });
});
