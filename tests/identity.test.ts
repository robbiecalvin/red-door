import { displayNameForIdentity, isAnonymousIdentity } from "../shared/identity";
describe("identity display names", () => {
  it.each(["session:one", "session:two", "guest:one", "user:guest:one"])("always labels %s as Anon even with an old custom name", key => {
    expect(isAnonymousIdentity(key)).toBe(true);
    expect(displayNameForIdentity(key, "Old guest nickname")).toBe("Anon");
  });
  it("preserves registered names and supplies a readable fallback", () => {
    expect(displayNameForIdentity("user:123", " Alex ")).toBe("Alex");
    expect(displayNameForIdentity("user:123")).toBe("Member");
    expect(isAnonymousIdentity("user:123")).toBe(false);
  });
});
