import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ANALYTICS_COHORTS, type AnalyticsCohort, type AnalyticsEvent, type AnalyticsSummary } from "../../../shared/analytics";

const DAY = 86400000;
const RETENTION_DAYS = 35;
type Participant = { cohort: AnalyticsCohort; signupDay: string; startedDay: string; activeDays: string[]; milestones: string[]; paid?: boolean };
type Conversation = { participants: string[]; initiator: string; createdDay: string; replied: boolean };
export type AnalyticsState = {
  version: 1;
  days: Record<string, Partial<Record<AnalyticsEvent, number>>>;
  participants: Record<string, Participant>;
  conversations: Record<string, Conversation>;
  dedupe: Record<string, string>;
};
const empty = (): AnalyticsState => ({ version: 1, days: {}, participants: {}, conversations: {}, dedupe: {} });
export function createAnalyticsService(deps: { secret: string; enabled?: boolean; filePath?: string; initialState?: AnalyticsState; nowMs?: () => number; onChange?: (state: AnalyticsState) => void }) {
  const now = deps.nowMs ?? Date.now;
  const enabled = deps.enabled !== false;
  const tag = (kind: string, value: string) => crypto.createHmac("sha256", deps.secret).update(`analytics:${kind}:${value}`).digest("hex");
  const day = () => new Date(now()).toISOString().slice(0, 10);
  let state = deps.initialState ?? empty();
  if (!deps.initialState && deps.filePath && fs.existsSync(deps.filePath)) {
    state = JSON.parse(fs.readFileSync(deps.filePath, "utf8"));
    if (state.version !== 1 || !state.days || !state.participants || !state.conversations || !state.dedupe) throw new Error("Invalid analytics store.");
  }
  function prune() {
    const cutoff = new Date(now() - (RETENTION_DAYS - 1) * DAY).toISOString().slice(0, 10);
    for (const key of Object.keys(state.days)) if (key < cutoff) delete state.days[key];
    for (const [key, participant] of Object.entries(state.participants)) {
      participant.activeDays = participant.activeDays.filter(d => d >= cutoff);
      if (participant.startedDay < cutoff && participant.activeDays.length === 0) delete state.participants[key];
    }
    for (const [key, conversation] of Object.entries(state.conversations)) if (conversation.createdDay < cutoff) delete state.conversations[key];
    for (const [key, value] of Object.entries(state.dedupe)) if (value < cutoff) delete state.dedupe[key];
  }
  function persist() {
    prune();
    if (deps.filePath) {
      fs.mkdirSync(path.dirname(deps.filePath), { recursive: true });
      fs.writeFileSync(deps.filePath + ".tmp", JSON.stringify(state));
      fs.renameSync(deps.filePath + ".tmp", deps.filePath);
    }
    deps.onChange?.(JSON.parse(JSON.stringify(state)));
  }
  function increment(event: AnalyticsEvent) {
    const bucket = state.days[day()] ??= {};
    bucket[event] = (bucket[event] ?? 0) + 1;
  }
  function milestone(id: string, event: "profile_completed" | "first_message" | "first_reply") {
    const participant = state.participants[tag("actor", id)];
    if (!participant || participant.milestones.includes(event)) return;
    participant.milestones.push(event); increment(event);
  }
  function eraseUser(id: string) {
    const actor = tag("actor", id);
    delete state.participants[actor];
    delete state.dedupe[tag("registration", id)];
    for (const [key, conversation] of Object.entries(state.conversations)) {
      if (conversation.participants.includes(actor)) delete state.conversations[key];
    }
    persist();
  }
  return {
    eraseUser,
    registration(id: string, cohort: AnalyticsCohort, consent: boolean) {
      if (!enabled) return;
      const key = tag("registration", id);
      if (state.dedupe[key]) return;
      state.dedupe[key] = day(); increment("registrations");
      if (consent) state.participants[tag("actor", id)] = { cohort, signupDay: day(), startedDay: day(), activeDays: [day()], milestones: [] };
      persist();
    },
    consent(id: string, value: boolean, cohort: AnalyticsCohort, createdAtMs: number) {
      if (!enabled) return;
      const actor = tag("actor", id);
      if (!value) {
        eraseUser(id);
        return;
      } else if (!state.participants[actor]) {
        state.participants[actor] = { cohort, signupDay: new Date(createdAtMs).toISOString().slice(0, 10), startedDay: day(), activeDays: [day()], milestones: [] };
      }
      persist();
    },
    activity(id: string) {
      if (!enabled) return;
      const participant = state.participants[tag("actor", id)];
      if (!participant || participant.activeDays.includes(day())) return;
      participant.activeDays.push(day()); state.days[day()] ??= {}; persist();
    },
    profileCompleted(id: string) { if (enabled) { milestone(id, "profile_completed"); persist(); } },
    message(fromId: string, toId: string) {
      if (!enabled || fromId === toId) return;
      const from = tag("actor", fromId), to = tag("actor", toId);
      // Both people must consent before a conversation relationship is measured.
      if (!state.participants[from] || !state.participants[to]) return;
      increment("messages_sent"); milestone(fromId, "first_message");
      const key = tag("conversation", [fromId, toId].sort().join(":"));
      const conversation = state.conversations[key];
      if (!conversation) { state.conversations[key] = { participants: [from, to], initiator: from, createdDay: day(), replied: false }; increment("conversations_started"); }
      else if (!conversation.replied && conversation.initiator !== from) { conversation.replied = true; increment("conversations_replied"); milestone(toId, "first_reply"); }
      persist();
    },
    billing(event: "checkout_started" | "test_checkout_started" | "test_paid_period_confirmed" | "subscription_activated" | "payment_failed" | "subscription_canceled", providerKey: string, userId?: string) {
      if (!enabled) return;
      const key = tag(event, providerKey);
      if (state.dedupe[key]) return;
      state.dedupe[key] = day(); increment(event);
      if (event === "subscription_activated" && userId) { const actor = state.participants[tag("actor", userId)]; if (actor) actor.paid = true; }
      persist();
    },
    cleanup() { persist(); },
    summary(): AnalyticsSummary {
      persist();
      const participants = Object.values(state.participants);
      const totals: Partial<Record<AnalyticsEvent, number>> = {};
      for (const bucket of Object.values(state.days)) for (const [event, count] of Object.entries(bucket)) totals[event as AnalyticsEvent] = (totals[event as AnalyticsEvent] ?? 0) + count!;
      return {
        enabled, windowDays: RETENTION_DAYS, asOfDay: day(), totals,
        daily: Object.keys(state.days).sort().map(d => ({ day: d, activeParticipants: participants.filter(p => p.activeDays.includes(d)).length, events: { ...state.days[d] } })),
        cohorts: ANALYTICS_COHORTS.map(cohort => {
          const cohortCutoff = new Date(now() - (RETENTION_DAYS - 1) * DAY).toISOString().slice(0, 10);
          const group = participants.filter(p => p.cohort === cohort && p.signupDay >= cohortCutoff);
          const eligible = group.filter(p => p.startedDay === p.signupDay && Date.parse(p.signupDay) + 7 * DAY <= Date.parse(day()));
          return { cohort, registrations: group.length, participants: group.length, profilesCompleted: group.filter(p => p.milestones.includes("profile_completed")).length, firstMessages: group.filter(p => p.milestones.includes("first_message")).length, paidConversions: group.filter(p => p.paid).length, firstReplies: group.filter(p => p.milestones.includes("first_reply")).length, sevenDayEligible: eligible.length, sevenDayReturned: eligible.filter(p => p.activeDays.includes(new Date(Date.parse(p.signupDay) + 7 * DAY).toISOString().slice(0,10))).length };
        })
      };
    }
  };
}
