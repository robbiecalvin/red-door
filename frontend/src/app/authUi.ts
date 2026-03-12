import type { ServiceError } from "./api";

export function isVerificationRequiredError(error: unknown): boolean {
  const candidate = error as Partial<ServiceError> | null | undefined;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  if (code === "EMAIL_VERIFICATION_REQUIRED" || code === "NOT_VERIFIED") {
    return true;
  }
  const message = typeof candidate?.message === "string" ? candidate.message.trim().toLowerCase() : "";
  if (!message) return false;
  return (
    message.includes("verification required") ||
    message.includes("verify your email") ||
    message.includes("verify your phone")
  );
}
