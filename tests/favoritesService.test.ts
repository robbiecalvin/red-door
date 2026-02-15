import { createFavoritesService } from "../backend/src/services/favoritesService";

describe("favoritesService", () => {
  it("Given a registered user When toggle is called Then favorite state flips deterministically", () => {
    const svc = createFavoritesService();
    const session = { userType: "registered" as const, userId: "u_1", ageVerified: true };

    const add = svc.toggle(session, "u_2");
    expect(add.ok).toBe(true);
    if (!add.ok) throw new Error("unreachable");
    expect(add.value.isFavorite).toBe(true);

    const remove = svc.toggle(session, "u_2");
    expect(remove.ok).toBe(true);
    if (!remove.ok) throw new Error("unreachable");
    expect(remove.value.isFavorite).toBe(false);
  });

  it("Given a guest session When toggle is attempted Then ANONYMOUS_FORBIDDEN is returned", () => {
    const svc = createFavoritesService();
    const res = svc.toggle({ userType: "guest", ageVerified: true }, "u_2");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error.code).toBe("ANONYMOUS_FORBIDDEN");
  });
});
