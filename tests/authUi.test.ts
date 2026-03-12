import { isVerificationRequiredError } from "../frontend/src/app/authUi";

describe("authUi", () => {
  it("recognizes backend phone verification errors", () => {
    expect(
      isVerificationRequiredError({
        code: "EMAIL_VERIFICATION_REQUIRED",
        message: "Phone verification required before login."
      })
    ).toBe(true);
  });

  it("recognizes fallback verification wording without relying on exact code", () => {
    expect(
      isVerificationRequiredError({
        code: "UNAUTHORIZED_ACTION",
        message: "Verify your email first."
      })
    ).toBe(true);
  });

  it("does not treat unrelated auth failures as verification errors", () => {
    expect(
      isVerificationRequiredError({
        code: "UNAUTHORIZED_ACTION",
        message: "Invalid credentials."
      })
    ).toBe(false);
  });
});
