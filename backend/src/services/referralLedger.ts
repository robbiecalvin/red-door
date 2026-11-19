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
  payout?: { actorId: string; atMs: number; reference: string };
};

const key = "referralLedger";
type Ledger = { credits: ReferralCredit[]; refunds: Record<string, number> };
export const commissionCents = 500;

export function creditStatus(credit: ReferralCredit) {
  if (credit.refundedCents >= credit.grossCents) return "reversed";
  if (credit.refundedCents > 0) return "refund-review";
  if (credit.payout) return "paid";
  return credit.approved ? "earned" : "pending";
}

const vancouverMonth = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver", year: "numeric", month: "numeric"
});

export function summarizeReferrals(credits: readonly ReferralCredit[], priority: boolean, now = Date.now()): ReferralSummary {
  const live = credits.filter(credit => credit.live);
  const qualifying = live.filter(credit => credit.refundedCents === 0);
  const month = vancouverMonth.format(now);
  const monthlyReferrals = qualifying.filter(credit => vancouverMonth.format(credit.earnedAtMs) === month).length;
  return {
    priority,
    lifetimeReferrals: qualifying.length,
    monthlyReferrals,
    monthlyEarningsCents: monthlyReferrals * commissionCents,
    unpaidCents: qualifying.filter(credit => !credit.payout).length * commissionCents,
    paidCents: live.filter(credit => credit.payout).length * commissionCents
  };
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
    async review(invoiceId: string, actorId: string, action: unknown, reference: unknown) {
      return update(ledger => {
        const row = ledger.credits.find(credit => credit.invoiceId === invoiceId && credit.live);
        if (!row) throw new MemberError("NOT_FOUND", "Live commission not found.", 404);
        const status = creditStatus(row);
        if (action === "approve" && status === "pending") row.approved = { actorId, atMs: Date.now() };
        else if (action === "record-payout" && status === "earned") {
          const payoutReference = text(reference, 120, "Payout reference");
          if (ledger.credits.some(credit => credit.payout?.reference === payoutReference)) {
            throw new MemberError("DUPLICATE", "This payout reference is already recorded.", 409);
          }
          row.payout = { actorId, atMs: Date.now(), reference: payoutReference };
        } else throw new MemberError("INVALID_STATE", "That action is unavailable for this commission.", 409);
        return row;
      });
    }
  };
}
