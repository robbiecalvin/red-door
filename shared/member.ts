export const INTENTS = { chatting: "Chatting", tonight: "Meeting tonight", browsing: "Just browsing", friends: "Making friends" } as const;
export type Intent = keyof typeof INTENTS;
export const RIGHT_NOW_DURATION_MS = 60 * 60 * 1000;

export function isRightNow(expiresAtMs: number | undefined, now = Date.now()): boolean {
  return typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs) && expiresAtMs > now;
}
export const INTERESTS = ["Coffee", "Food", "Fitness", "Hiking", "Music", "Nightlife", "Gaming", "Art", "Travel", "Movies", "Books", "Dogs", "Sports", "Dancing", "Community", "Outdoors"] as const;
export const PROFILE_PROMPTS = ["A great first hello is…", "My ideal first meet…", "Ask me about…", "We’ll get along if…", "A perfect weekend includes…"] as const;
export type PromptAnswer = { prompt: string; answer: string };
export type MemberPreferences = {
  intent?: Intent;
  intentExpiresAtMs?: number;
  rightNowStartsAtMs?: number;
  rightNowExpiresAtMs?: number;
  interests: string[];
  prompts: PromptAnswer[];
  hideLocation: boolean;
  hideProfile?: boolean;
  incognito: boolean;
  discovery?: { intent: Intent | ""; interest: string; verifiedOnly: boolean };
};
export type PhotoVerification = { status: "challenge" | "pending" | "approved" | "rejected" | "outdated"; challenge: string; expiresAtMs: number; mainPhotoMediaId: string; proofMediaId?: string; submittedAtMs?: number; reviewedAtMs?: number; reason?: string };
export type PublicMember = Pick<MemberPreferences, "interests" | "prompts" | "rightNowExpiresAtMs"> & { intent?: Intent; intentExpiresAtMs?: number; photoVerified: boolean };
export type MemberSettings = { preferences: MemberPreferences; verification: PhotoVerification | null; plus: boolean };
export const DEFAULT_MEMBER: MemberPreferences = { interests: [], prompts: [], hideLocation: false, incognito: false };
export type CommunityPlan = { id: string; hostId: string; title: string; description: string; city: string; venue: string; category: "Coffee" | "Nightlife" | "Outdoors" | "Community"; startsAtMs: number; endsAtMs: number; createdAtMs: number; attendees: string[]; canceled?: boolean };
export type PublicPlan = Omit<CommunityPlan, "attendees"> & { attendeeCount: number; joined: boolean; hostName: string };
