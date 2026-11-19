export type ReferralSummary = {
  priority: boolean;
  lifetimeReferrals: number;
  monthlyReferrals: number;
  monthlyEarningsCents: number;
  unpaidCents: number;
  paidCents: number;
  pendingAdjustmentCents?: number;
  payoutAdjustments?: { atMs: number; cents: number }[];
};

export const referralCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD"
});
