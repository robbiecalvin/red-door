import type { PolicyAcceptanceRecord } from "./registrationPolicy";
import type { MarketingConsent } from "./marketing";
import type { MemberPreferences, PhotoVerification } from "./member";
export const PLUS_PRICE_CENTS = 799;
export const PLUS_CURRENCY = "cad";
export const LAUNCH_CODE = "THEREDDOORLAUNCH";
export const PROVIDER_LAUNCH_CODE = "REDDOORLAUNCH";
export const MEMBER_LAUNCH_CODE = "REDDOORUNLOCKED";
export const BADEHAUS_FLYER_CODE = "BADEHAUSXONLINE";
export const PROMO_CODES = [LAUNCH_CODE, PROVIDER_LAUNCH_CODE, MEMBER_LAUNCH_CODE, BADEHAUS_FLYER_CODE] as const;
export function promoCode(value:unknown):string { if(typeof value!=="string" || !(PROMO_CODES as readonly string[]).includes(value.trim().toUpperCase()))throw new Error("Invalid promotion code.");return value.trim().toUpperCase(); }
// Midnight January 1, 2027 in America/Vancouver. End is exclusive.
export const LAUNCH_END_MS = Date.parse("2027-01-01T00:00:00-07:00");
export type PlusIdentity = { userType: string; tier?: string; plusExpiresAtMs?: number; plusData?: PlusData };
export function effectivePlusExpiry(identity: PlusIdentity): number | undefined {
  const data = identity.plusData;
  if (data?.priorityApprovedAtMs !== undefined) return undefined;
  if (identity.tier === "premium" && identity.plusExpiresAtMs === undefined) return undefined;
  return Math.max(identity.plusExpiresAtMs ?? 0, data?.founderTrialEndsAtMs ?? 0) || undefined;
}
export function hasPlus(identity: PlusIdentity, now = Date.now()): boolean {
  if (identity.userType === "guest") return false;
  if (identity.plusData?.priorityApprovedAtMs !== undefined) return true;
  if ((identity.plusData?.founderTrialEndsAtMs ?? 0) > now) return true;
  return identity.tier === "premium" && (identity.plusExpiresAtMs === undefined || identity.plusExpiresAtMs > now);
}
export function launchGrant(code: unknown, now = Date.now()): number | undefined {
  if (code === undefined || code === null || code === "") return undefined;
  promoCode(code);
  if (now >= LAUNCH_END_MS) throw new Error("This promotion expired on January 1, 2027 (Pacific time).");
  return LAUNCH_END_MS;
}
export const PLUS_FEATURES = ["Travel mode", "Advanced filters", "Saved searches", "100 favorites and 50 pinned chats", "20-photo private album with sharing controls", "12 gallery photos and profile video", "Read receipts", "Group chats", "Remembered discovery preferences"] as const;
export function limits(identity: PlusIdentity, now = Date.now()) {
  return hasPlus(identity, now)
    ? { favorites: 100, pins: 50, gallery: 12, privateAlbum: 20 }
    : { favorites: 20, pins: 3, gallery: 3, privateAlbum: 3 };
}
export type SavedSearch = { name: string; filters: Record<string, string | boolean> };
export type PlusData = {
  customerImport?: { sourceId: string; completed: boolean; autoReplies: boolean; city?: string; neighbourhood?: string };
  registrationPolicy?: PolicyAcceptanceRecord;
  marketing?: MarketingConsent;
  founderAtMs?: number;
  founderTrialEndsAtMs?: number;
  founderRateEligible?: boolean;
  priorityInvited?: boolean;
  priorityRequestedAtMs?: number;
  priorityProofMediaId?: string;
  priorityApprovedAtMs?: number;
  priorityReferralCode?: string;
  priorityReferralOwnerId?: string;
  referralIntroInvoiceId?: string;
  membershipAudit?: { action: string; actorId: string; atMs: number }[];
  member?: MemberPreferences;
  photoVerification?: PhotoVerification;
  pushSubscriptions?: { endpoint: string; keys: { p256dh: string; auth: string } }[];
  redeemedPromoCodes?: string[];
  providerTutorialPending?: boolean;
  stripePaymentMethodSaved?: boolean;
  stripeAutoRenew?: boolean;
  stripeNextBillingAtMs?: number;
  stripeSubscriptionStatus?: string;
  stripeScheduleId?: string;
  stripeScheduleStatus?: string;
  stripeProcessedSetupIds?: string[];
  mdKeyHash?: string;
  mdKeyCreatedAtMs?: number;
  analyticsConsent?: boolean;
  savedSearches?: SavedSearch[];
  pinnedKeys?: string[];
  privateMediaIds?: string[];
  albumSharedWith?: string[];
  albumRequests?: string[];
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeLivemode?: boolean;
  stripeCheckoutSessionId?: string;
};
