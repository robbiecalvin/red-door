import type { MemberPreferences, PhotoVerification } from "./member";
export const PLUS_PRICE_CENTS = 799;
export const PLUS_CURRENCY = "cad";
export const LAUNCH_CODE = "THEREDDOORLAUNCH";
// Midnight January 1, 2027 in America/Vancouver. End is exclusive.
export const LAUNCH_END_MS = Date.parse("2027-01-01T00:00:00-07:00");
export type PlusIdentity = { userType: string; tier?: string; plusExpiresAtMs?: number };
export function hasPlus(identity: PlusIdentity, now = Date.now()): boolean {
  return identity.userType !== "guest" && identity.tier === "premium" &&
    (identity.plusExpiresAtMs === undefined || identity.plusExpiresAtMs > now);
}
export function launchGrant(code: unknown, now = Date.now()): number | undefined {
  if (code === undefined || code === null || code === "") return undefined;
  if (typeof code !== "string" || code.trim().toUpperCase() !== LAUNCH_CODE) throw new Error("Invalid promotion code.");
  if (now >= LAUNCH_END_MS) throw new Error("This promotion expired on January 1, 2027 (Pacific time).");
  return LAUNCH_END_MS;
}
export const PLUS_FEATURES = ["Travel mode", "Advanced filters", "Saved searches", "100 favorites and 50 pinned chats", "20-photo private album with sharing controls", "12 gallery photos and profile video", "Read receipts", "Group chats", "Off-grid browsing", "Remembered discovery preferences"] as const;
export function limits(identity: PlusIdentity, now = Date.now()) {
  return hasPlus(identity, now)
    ? { favorites: 100, pins: 50, gallery: 12, privateAlbum: 20 }
    : { favorites: 20, pins: 3, gallery: 3, privateAlbum: 3 };
}
export type SavedSearch = { name: string; filters: Record<string, string | boolean> };
export type PlusData = {
  member?: MemberPreferences;
  photoVerification?: PhotoVerification;
  pushSubscriptions?: { endpoint: string; keys: { p256dh: string; auth: string } }[];
  analyticsConsent?: boolean;
  savedSearches?: SavedSearch[];
  pinnedKeys?: string[];
  privateMediaIds?: string[];
  albumSharedWith?: string[];
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeLivemode?: boolean;
  stripeCheckoutSessionId?: string;
};
