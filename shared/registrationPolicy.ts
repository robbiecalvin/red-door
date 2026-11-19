export type PolicyDocument = { url: string; version: string };
export type RegistrationPolicy =
  | { status: "disabled" | "unavailable" }
  | { status: "required"; terms: PolicyDocument; privacy: PolicyDocument };
export type PolicyAcceptance = { termsVersion: string; privacyVersion: string; accepted: true };
export type PolicyAcceptanceRecord = PolicyAcceptance & { acceptedAtMs: number; source: "registration" };
