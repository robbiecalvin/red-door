export type AnalyticsCohort = "free" | "launch" | "paid" | "other_plus";
export const ANALYTICS_COHORTS: AnalyticsCohort[] = ["free", "launch", "paid", "other_plus"];
export type AnalyticsEvent = "registrations" | "profile_completed" | "first_message" | "first_reply" | "messages_sent" | "conversations_started" | "conversations_replied" | "checkout_started" | "test_checkout_started" | "test_paid_period_confirmed" | "subscription_activated" | "payment_failed" | "subscription_canceled";
export type AnalyticsSummary = {
  enabled: boolean; windowDays: number; asOfDay: string;
  daily: { day: string; activeParticipants: number; events: Partial<Record<AnalyticsEvent, number>> }[];
  cohorts: { cohort: AnalyticsCohort; registrations: number; participants: number; profilesCompleted: number; firstMessages: number; firstReplies: number; paidConversions: number; sevenDayEligible: number; sevenDayReturned: number }[];
  totals: Partial<Record<AnalyticsEvent, number>>;
};
