/** Presentation only: guest identities remain distinct even though their labels match. */
export function isAnonymousIdentity(key: string): boolean {
  return /^(session:|guest:|user:guest:)/.test(key.trim());
}
export function displayNameForIdentity(key: string, displayName?: string | null): string {
  if (isAnonymousIdentity(key)) return "Anon";
  return displayName?.trim() || "Member";
}
