export const MARKETING_CONSENT_VERSION = "2026-11-19";
export const MARKETING_CONSENT_LABEL = "Email me optional Badehaus X news, promotions, and event updates. I can unsubscribe anytime.";
export type MarketingConsent = {
  enabled: boolean;
  history: { enabled: boolean; atMs: number; source: "registration" | "settings" | "unsubscribe"; version: string }[];
  token?: string;
};
