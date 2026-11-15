import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAnalyticsService } from "../backend/src/services/analyticsService";
const DAY = 86400000;
// Acceptance: optional measurement never stores content/location or exposes identifiers;
// launch and paid cohorts remain separate; replays do not inflate billing totals.
describe("Privacy-conscious baseline metrics", () => {
  it("Given opted-out registrations When profile or message events occur Then records only registration totals", () => {
    const svc = createAnalyticsService({ secret: "test" });
    svc.registration("a", "free", false); svc.registration("a", "free", false); svc.profileCompleted("a"); svc.message("a", "b");
    const data = svc.summary(); expect(data.totals.registrations).toBe(1); expect(data.totals.profile_completed).toBeUndefined(); expect(data.cohorts.every(c => c.participants === 0)).toBe(true);
  });
  it("Given a conversation When the other person replies Then counts one response and deduplicates milestones", () => {
    const svc = createAnalyticsService({ secret: "test" }); svc.registration("a", "free", true); svc.registration("b", "launch", true);
    svc.profileCompleted("a"); svc.profileCompleted("a"); svc.message("a", "b"); svc.message("b", "a"); svc.message("b", "a");
    const data = svc.summary(); expect(data.totals.profile_completed).toBe(1); expect(data.totals.conversations_started).toBe(1); expect(data.totals.conversations_replied).toBe(1); expect(data.totals.messages_sent).toBe(3);
    expect(data.cohorts.find(c => c.cohort === "free")?.firstReplies).toBe(1); expect(data.cohorts.find(c => c.cohort === "launch")?.firstReplies).toBe(0);
  });
  it("Given a seven-day cohort When eligible users return on day seven Then reports a measured denominator", () => {
    let now = Date.parse("2026-10-01T12:00:00Z"); const svc = createAnalyticsService({ secret: "test", nowMs: () => now });
    svc.registration("a", "free", true); svc.registration("b", "free", true); now += 7 * DAY; svc.activity("a"); svc.activity("a");
    const group = svc.summary().cohorts.find(c => c.cohort === "free")!; expect(group.sevenDayEligible).toBe(2); expect(group.sevenDayReturned).toBe(1);
    expect(svc.summary().daily.find(d => d.day === "2026-10-08")?.activeParticipants).toBe(1);
  });
  it("Given opt-out When applied Then removes participant relationships while preserving aggregate history", () => {
    const svc = createAnalyticsService({ secret: "test" }); svc.registration("a", "free", true); svc.registration("b", "launch", true); svc.message("a", "b");
    svc.consent("b", false, "launch", Date.now()); const data = svc.summary(); expect(data.cohorts.find(c => c.cohort === "launch")?.participants).toBe(0); expect(data.totals.conversations_started).toBe(1);
    svc.message("a", "b"); expect(svc.summary().totals.messages_sent).toBe(1);
  });
  it("Given Stripe event redelivery When recorded Then increments once and separates paid conversion from promo", () => {
    const svc = createAnalyticsService({ secret: "test" }); svc.registration("a", "free", true); svc.registration("b", "launch", true);
    svc.billing("subscription_activated", "sub:period", "a"); svc.billing("subscription_activated", "sub:period", "a"); svc.billing("payment_failed", "invoice");
    const data = svc.summary(); expect(data.totals.subscription_activated).toBe(1); expect(data.totals.payment_failed).toBe(1); expect(data.cohorts.find(c => c.cohort === "free")?.paidConversions).toBe(1); expect(data.cohorts.find(c => c.cohort === "launch")?.paidConversions).toBe(0);
  });
  it("Given persisted metrics When restarted and retention elapses Then retains counts without raw identifiers and deletes expired records", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reddoor-metrics-")), filePath = path.join(dir, "metrics.json"); let now = Date.parse("2026-10-01T12:00:00Z");
    const svc = createAnalyticsService({ secret: "test", filePath, nowMs: () => now }); svc.registration("raw-user-id", "launch", true);
    expect(fs.readFileSync(filePath,"utf8")).not.toContain("raw-user-id");
    const restored = createAnalyticsService({ secret: "test", filePath, nowMs: () => now }); expect(restored.summary().totals.registrations).toBe(1);
    now += 35 * DAY; expect(restored.summary().daily).toHaveLength(0); expect(JSON.parse(fs.readFileSync(filePath,"utf8")).participants).toEqual({});
    fs.rmSync(dir, { recursive: true });
  });
  it("Given collection disabled When operations occur Then records nothing", () => {
    const svc = createAnalyticsService({ secret: "test", enabled: false }); svc.registration("a", "free", true); svc.message("a", "b"); svc.billing("checkout_started", "checkout"); expect(svc.summary().totals).toEqual({}); expect(svc.summary().enabled).toBe(false);
  });
});

describe("Rolling activation cohorts", () => {
  it("Given an older but still active participant When the cohort window passes Then excludes the old signup from the retention denominator", () => {
    let now = Date.parse("2026-09-01T12:00:00Z"); const svc = createAnalyticsService({ secret: "test", nowMs: () => now });
    svc.registration("active", "free", true);
    now += 36 * DAY; svc.activity("active");
    const data = svc.summary(); expect(data.cohorts.find(c => c.cohort === "free")?.sevenDayEligible).toBe(0);
    expect(data.daily.find(d => d.day === "2026-10-07")?.activeParticipants).toBe(1);
  });
});
