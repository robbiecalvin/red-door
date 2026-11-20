import type { ReferralSummary } from "../../../shared/referralSummary";
import type { CommunityRepository } from "../repositories/communityRepository";
import { MemberError, text } from "./memberService";

export type ReferralCredit = {
  buyerId: string;
  ownerId: string;
  invoiceId: string;
  earnedAtMs: number;
  live: boolean;
  grossCents: number;
  refundedCents: number;
  approved?: { actorId: string; atMs: number };
  chargeback?: { disputeId: string; outcome: "won" | "lost"; actorId: string; atMs: number; applied?: { atMs: number; reference: string } };
  payout?: { actorId: string; atMs: number; reference: string };
};

const key = "referralLedger";
type Ledger = { credits: ReferralCredit[]; refunds: Record<string, number> };
export const commissionCents = 500;

export function creditStatus(credit: ReferralCredit) {
  if (credit.payout) return "paid";
  if (credit.refundedCents >= credit.grossCents) return "reversed";
  if (credit.refundedCents > 0) return "refund-review";
  return credit.approved ? "earned" : "pending";
}

const vancouverMonth = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver", year: "numeric", month: "numeric"
});

export function summarizeReferrals(credits: readonly ReferralCredit[], priority: boolean, now = Date.now()): ReferralSummary {
  const live = credits.filter(credit => credit.live);
  const qualifying = live.filter(credit => credit.refundedCents === 0 && credit.chargeback?.outcome !== "lost");
  const applied = live.flatMap(credit => credit.chargeback?.applied ? [credit.chargeback.applied] : []);
  const month = vancouverMonth.format(now);
  const monthlyReferrals = qualifying.filter(credit => vancouverMonth.format(credit.earnedAtMs) === month).length;
  return {
    priority,
    lifetimeReferrals: qualifying.length,
    monthlyReferrals,
    monthlyEarningsCents: monthlyReferrals * commissionCents,
    unpaidCents: qualifying.filter(credit => !credit.payout).length * commissionCents,
    paidCents: (live.filter(credit => credit.payout).length - applied.length) * commissionCents,
    pendingAdjustmentCents: live.filter(pendingChargeback).length * commissionCents,
    payoutAdjustments: applied.map(({ atMs }) => ({ atMs, cents: commissionCents }))
  };
}

const vancouverDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver", year: "numeric", month: "numeric"
});
const vancouverOffset = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver", timeZoneName: "shortOffset"
});

export function payoutWindow(now = Date.now()) {
  const parts = vancouverDate.formatToParts(now);
  const year = Number(parts.find(part => part.type === "year")?.value);
  const month = Number(parts.find(part => part.type === "month")?.value) - 1;
  function cutoff(monthIndex: number) {
    const weekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    const thirdFriday = 15 + (5 - weekday + 7) % 7;
    const wallTime = Date.UTC(year, monthIndex, thirdFriday, 23);
    const zone = vancouverOffset.formatToParts(wallTime).find(part => part.type === "timeZoneName")?.value;
    const offset = Number(zone?.replace("GMT", ""));
    return wallTime - offset * 3600000;
  }
  const current = cutoff(month);
  return now >= current
    ? { closedAtMs: current, nextAtMs: cutoff(month + 1) }
    : { closedAtMs: cutoff(month - 1), nextAtMs: current };
}

export function eligibleForPayout(credit: ReferralCredit, cutoffMs: number) {
  return credit.live && creditStatus(credit) === "earned" && credit.earnedAtMs <= cutoffMs;
}

export function pendingChargeback(credit: ReferralCredit) {
  return credit.live && credit.chargeback?.outcome === "lost" && !credit.chargeback.applied;
}

export function createReferralLedger(repository: CommunityRepository) {
  function update<T>(apply: (ledger: Ledger) => T) {
    return repository.update(state => {
      const ledger = (state.settings[key] as Ledger | undefined) ?? { credits: [], refunds: {} };
      const result = apply(ledger);
      state.settings[key] = ledger;
      return result;
    });
  }
  const invoiceKey = (invoiceId: string, live: boolean) => (live ? "live:" : "test:") + invoiceId;
  return {
    async list() { return (await repository.readSetting<Ledger>(key))?.credits ?? []; },
    async record(input: Omit<ReferralCredit, "refundedCents" | "earnedAtMs">) {
      if (input.buyerId === input.ownerId) return false;
      return update(ledger => {
        if (ledger.credits.some(row => row.live === input.live && (row.buyerId === input.buyerId || row.invoiceId === input.invoiceId))) return false;
        const refundedCents = ledger.refunds[invoiceKey(input.invoiceId, input.live)] ?? 0;
        ledger.credits.push({ ...input, earnedAtMs: Date.now(), refundedCents });
        return true;
      });
    },
    async refund(invoiceId: string, live: boolean, refundedCents: number) {
      if (!Number.isSafeInteger(refundedCents) || refundedCents <= 0) return false;
      return update(ledger => {
        const refundKey = invoiceKey(invoiceId, live);
        if ((ledger.refunds[refundKey] ?? 0) >= refundedCents) return false;
        ledger.refunds[refundKey] = refundedCents;
        const row = ledger.credits.find(credit => credit.invoiceId === invoiceId && credit.live === live);
        if (row) row.refundedCents = refundedCents;
        return Boolean(row);
      });
    },
    async recordPayout(ownerId: string, invoiceIds: string[], actorId: string, reference: unknown, now = Date.now(), expectedCents?: unknown) {
      const payoutReference = text(reference, 120, "Payout reference");
      const cutoff = payoutWindow(now).closedAtMs;
      return update(ledger => {
        if (ledger.credits.some(credit => credit.payout?.reference === payoutReference)) {
          throw new MemberError("DUPLICATE", "This payout reference is already recorded.", 409);
        }
        const selected = ledger.credits.filter(credit => credit.ownerId === ownerId && credit.live && invoiceIds.includes(credit.invoiceId));
        if (!invoiceIds.length || selected.length !== invoiceIds.length || selected.some(credit => !eligibleForPayout(credit, cutoff))) {
          throw new MemberError("INVALID_STATE", "The payout list changed. Refresh and review the commissions.", 409);
        }
        const offsets = ledger.credits.filter(credit => credit.ownerId === ownerId && pendingChargeback(credit))
          .sort((a, b) => a.chargeback!.atMs - b.chargeback!.atMs)
          .slice(0, selected.length);
        const paidCents = (selected.length - offsets.length) * commissionCents;
        if ((offsets.length || expectedCents !== undefined) && expectedCents !== paidCents) {
          throw new MemberError("INVALID_STATE", "The transfer amount changed. Refresh and review the payout.", 409);
        }
        for (const credit of offsets) credit.chargeback!.applied = { atMs: now, reference: payoutReference };
        for (const credit of selected) credit.payout = { actorId, atMs: now, reference: payoutReference };
        return paidCents;
      });
    },
    async resolveChargeback(invoiceId: string, dispute: unknown, outcome: unknown, actorId: string) {
      const disputeId = text(dispute, 120, "Stripe dispute ID");
      if (!/^dp_[a-zA-Z0-9]+$/.test(disputeId) || (outcome !== "won" && outcome !== "lost")) {
        throw new MemberError("INVALID_INPUT", "Enter the Stripe dispute ID and its final outcome.");
      }
      return update(ledger => {
        const credit = ledger.credits.find(row => row.live && row.invoiceId === invoiceId);
        if (!credit?.payout || credit.chargeback || ledger.credits.some(row => row.chargeback?.disputeId === disputeId)) {
          throw new MemberError("INVALID_STATE", "This dispute cannot be recorded against the commission.", 409);
        }
        credit.chargeback = { disputeId, outcome, actorId, atMs: Date.now() };
      });
    },
    async review(invoiceId: string, actorId: string, action: unknown, _reference?: unknown) {
      return update(ledger => {
        const row = ledger.credits.find(credit => credit.invoiceId === invoiceId && credit.live);
        if (!row) throw new MemberError("NOT_FOUND", "Live commission not found.", 404);
        const status = creditStatus(row);
        if (action === "approve" && status === "pending") row.approved = { actorId, atMs: Date.now() };
        else throw new MemberError("INVALID_STATE", "That action is unavailable for this commission.", 409);
        return row;
      });
    }
  };
}
