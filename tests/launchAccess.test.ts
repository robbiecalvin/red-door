import { LAUNCH_TARGET_MS, getCountdownParts, normalizeMembershipCode, validateEarlyAccessSignup } from "../frontend/src/app/launchAccess";

describe("launchAccess", () => {
  it("computes countdown parts deterministically", () => {
    const now = LAUNCH_TARGET_MS - (((2 * 24 + 3) * 60 + 4) * 60 + 5) * 1000;

    expect(getCountdownParts(LAUNCH_TARGET_MS, now)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      expired: false
    });
  });

  it("normalizes membership codes for lookup", () => {
    expect(normalizeMembershipCode(" red-1234abcd ")).toBe("RED-1234ABCD");
  });

  it("validates early access signup fields", () => {
    expect(validateEarlyAccessSignup("R", "invalid")).toBe("Enter your name using 2-80 characters.");
    expect(validateEarlyAccessSignup("Robert Mitchell", "invalid")).toBe("Enter a valid email address.");
    expect(validateEarlyAccessSignup("Robert Mitchell", "robert@example.com")).toBeNull();
  });
});
