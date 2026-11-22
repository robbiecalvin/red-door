import type { PayoutContact } from "../../../shared/payoutContact";
import React, { useEffect, useState } from "react";
import { MARKETING_CONSENT_LABEL } from "../../../shared/marketing";
import type { apiClient, Session } from "./api";

type Props = { api: ReturnType<typeof apiClient>; session: Session };
type Credit = { payoutContact?: PayoutContact; ownerEmail?: string; invoiceId: string; live: boolean; grossCents: number; refundedCents: number; status: string; chargeback?: { disputeId: string; outcome: "won" | "lost"; applied?: { reference: string } }; payout?: { reference: string } };
type Campaign = { id: string; subject: string; segment: string; atMs: number; status: string; accepted: number; failed: number; unconfirmed: number };
type PayoutGroup = { id: string; name: string; contact?: PayoutContact; invoiceIds: string[]; adjustmentCents: number; netCents: number };
type Growth = { payoutWindow?: { closedAtMs: number; nextAtMs: number }; payouts?: PayoutGroup[]; referrals: number; verifiedReferrals: number; marketingSubscribers: number; marketingSendingEnabled: boolean; commissionCents: number; credits: Credit[]; campaigns: Campaign[] };
const cad = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);

export function MarketingPreferences({ api, session }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    if (session.userId) void api.memberRequest<{ enabled: boolean }>(session.sessionToken, "/account/marketing")
      .then(result => { if (active) setEnabled(result.enabled); })
      .catch(() => { if (active) setMessage("Marketing preferences are unavailable."); });
    return () => { active = false; };
  }, [api, session.sessionToken, session.userId]);
  if (!session.userId) return null;
  return <section className="rd-card rd-settings-body">
    <h2>Marketing email</h2>
    <label className="rd-field"><span><input type="checkbox" checked={enabled === true} disabled={working || enabled === null}
      onChange={event => {
        const next = event.target.checked;
        setWorking(true);
        setMessage("");
        void api.memberRequest<{ enabled: boolean }>(session.sessionToken, "/account/marketing", { enabled: next }, "PUT")
          .then(result => { setEnabled(result.enabled); setMessage("Preference saved."); })
          .catch(cause => setMessage(cause.message || "Could not save your preference."))
          .finally(() => setWorking(false));
      }} /> {MARKETING_CONSENT_LABEL}</span></label>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

export function GrowthDashboard({ api, session }: Props) {
  const [data, setData] = useState<Growth | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [approved, setApproved] = useState(false);
  const [includeSignups, setIncludeSignups] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [segment, setSegment] = useState("all");
  const [sendAt, setSendAt] = useState("");
  const [payout, setPayout] = useState<{ group: PayoutGroup; reference: string } | null>(null);
  const [dispute, setDispute] = useState<{ invoiceId: string; disputeId: string; outcome: string } | null>(null);
  const token = session.sessionToken;
  async function run(action?: () => Promise<unknown>, success?: string) {
    setBusy(true); setNotice(""); setError("");
    try {
      await action?.();
      setData(await api.memberRequest<Growth>(token, "/admin/growth"));
      if (success) setNotice(success);
    } catch (cause) { setError((cause as { message?: string }).message ?? "Growth reporting is unavailable."); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (session.role === "admin") void run(); }, [api, token, session.role]);
  if (session.role !== "admin") return null;
  const live = data?.credits.filter(row => row.live) ?? [];
  const total = (status: string) => cad(live.filter(row => status === "paid" ? Boolean(row.payout) : row.status === status).length * (data?.commissionCents ?? 500));

  return <section className="rd-card rd-settings-body">
    <h2>Growth dashboard</h2>
    <div className="rd-row">
      <button className="rd-btn" disabled={busy} onClick={() => void run()}>Refresh Growth</button>
      <button className="rd-btn" disabled={busy} onClick={() => void run(() => api.memberRequest(token, "/admin/growth/summary-email", {}), "Summary email requested.")}>Email my summary</button>
    </div>
    {data ? <>
      <p>{data.verifiedReferrals} verified referrals / {data.referrals} attributed registrations · {data.marketingSubscribers} marketing subscribers</p>
      <p>Introductory receipts {cad(live.reduce((sum, row) => sum + row.grossCents, 0))} · Refunds {cad(live.reduce((sum, row) => sum + row.refundedCents, 0))}</p>
      <dl className="rd-billing-summary">{["pending", "earned", "paid", "reversed", "refund-review"].map(status => <div key={status}><dt>{status.replace("-", " ")}</dt><dd>{total(status)}</dd></div>)}</dl>
      {data.credits.map(credit => <div key={String(credit.live) + credit.invoiceId} className="rd-row">
        <span>{credit.ownerEmail ?? "Referral owner"} · {credit.invoiceId} · {credit.live ? credit.status : "Sandbox"}{credit.payout ? " · Payout recorded" : ""}</span>
        {credit.live && (credit.status === "pending" || credit.status === "earned") ? <span>
          {cad(data.commissionCents)} · {credit.payoutContact ? `E-transfer ${credit.payoutContact.kind}: ${credit.payoutContact.value}` : "No e-transfer contact saved"}
        </span> : null}
        {credit.live && credit.status === "pending" ? <button className="rd-btn" disabled={busy} onClick={() => void run(() =>
          api.memberRequest(token, "/admin/growth/commission", { invoiceId: credit.invoiceId, action: "approve" }), "Commission approved.")}>Approve commission</button> : null}
        {credit.chargeback ? <span>{credit.chargeback.disputeId} · {credit.chargeback.outcome === "won" ? "Won" : credit.chargeback.applied ? "Adjustment applied" : "Adjustment pending"}</span> : null}
        {credit.live && credit.payout && !credit.chargeback ? <button className="rd-btn" disabled={busy}
          onClick={() => setDispute({ invoiceId: credit.invoiceId, disputeId: "", outcome: "" })}>Record Stripe dispute outcome</button> : null}
      </div>)}
      {dispute ? <form onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          await api.memberRequest(token, "/admin/growth/chargeback", dispute);
          setDispute(null);
        }, "Dispute outcome recorded.");
      }}>
        <p>Confirm the final outcome for {dispute.invoiceId} in Stripe before recording it.</p>
        <label className="rd-field"><span>Stripe dispute ID</span><input className="rd-input" required pattern="dp_[a-zA-Z0-9]+" maxLength={120}
          value={dispute.disputeId} onChange={event => setDispute({ ...dispute, disputeId: event.target.value })} /></label>
        <label className="rd-field"><span>Final outcome</span><select className="rd-input" required value={dispute.outcome}
          onChange={event => setDispute({ ...dispute, outcome: event.target.value })}>
          <option value="">Choose outcome</option><option value="won">Won</option><option value="lost">Lost</option>
        </select></label>
        <button className="rd-btn" disabled={busy}>Save outcome</button>
        <button type="button" className="rd-btn" disabled={busy} onClick={() => setDispute(null)}>Cancel</button>
      </form> : null}
      <h3>Third-Friday payout review</h3>
      {data.payoutWindow ? <p>Last cutoff {new Date(data.payoutWindow.closedAtMs).toLocaleString("en-CA", { timeZone: "America/Vancouver" })} Pacific · Next cutoff {new Date(data.payoutWindow.nextAtMs).toLocaleString("en-CA", { timeZone: "America/Vancouver" })} Pacific</p> : null}
      {data.payouts?.length ? data.payouts.map(group => <div key={group.id} className="rd-row">
        <span>{group.name} · {group.invoiceIds.length} approved · {cad(group.netCents)} to transfer{group.adjustmentCents ? ` · ${cad(group.adjustmentCents)} adjustment` : ""}</span>
        <span>{group.contact ? `E-transfer ${group.contact.kind}: ${group.contact.value}` : "No e-transfer contact saved"}</span>
        <button type="button" className="rd-btn" disabled={busy} onClick={() => setPayout({ group, reference: "" })}>{group.netCents ? "Record completed payout" : "Record offset settlement"}</button>
      </div>) : <p>No approved commissions ready for payout.</p>}
      {payout ? <form onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          await api.memberRequest(token, "/admin/growth/payout", {
            ownerId: payout.group.id, invoiceIds: payout.group.invoiceIds, reference: payout.reference, expectedCents: payout.group.netCents
          });
          setPayout(null);
        }, "Completed payout recorded.");
      }}>
        <p>{payout.group.name} · {cad(payout.group.netCents)}</p>
        <label className="rd-field"><span>{payout.group.netCents ? "Completed e-transfer reference" : "Offset settlement reference"}</span><input className="rd-input" maxLength={120} value={payout.reference} onChange={event => setPayout({ ...payout, reference: event.target.value })} required /></label>
        <button className="rd-btn" disabled={busy || !payout.reference.trim()}>Record payout</button>
        <button type="button" className="rd-btn" disabled={busy} onClick={() => setPayout(null)}>Cancel</button>
      </form> : null}
      <h3>Weekly newsletter</h3>
      <p>Prepare the Tuesday morning edition. Add confirmed releases to the draft before approval.</p>
      <label><input type="checkbox" checked={includeSignups} onChange={event => setIncludeSignups(event.target.checked)} /> Include aggregate registrations</label>
      <button type="button" className="rd-btn" disabled={busy} onClick={() => void run(async () => {
        const draft = await api.memberRequest<{ subject: string; body: string }>(token,
          `/admin/growth/newsletter-draft?includeSignups=${includeSignups}`);
        setSubject(draft.subject); setBody(draft.body); setSegment("all"); setNewsletter(true); setApproved(false);
      }, "Weekly draft generated.")}>Generate weekly draft</button>
      {!data.marketingSendingEnabled && newsletter ? <label className="rd-field"><span>Draft message</span>
        <textarea className="rd-input" maxLength={4000} value={body} onChange={event => setBody(event.target.value)} />
      </label> : null}
      <h3>Marketing campaigns</h3>
      {data.marketingSendingEnabled ? <form onSubmit={event => {
        event.preventDefault();
        if (newsletter && !approved) return;
        void run(async () => {
          await api.memberRequest(token, "/admin/growth/campaign", { subject, body, segment, atMs: new Date(sendAt).getTime() });
          setSubject(""); setBody(""); setSendAt(""); setNewsletter(false); setApproved(false);
        }, "Campaign scheduled.");
      }}>
        <label className="rd-field"><span>Subject</span><input className="rd-input" maxLength={120} value={subject} onChange={e => { setSubject(e.target.value); setApproved(false); }} required /></label>
        <label className="rd-field"><span>Message</span><textarea className="rd-input" maxLength={4000} value={body} onChange={e => { setBody(e.target.value); setApproved(false); }} required /></label>
        <label className="rd-field"><span>Opted-in audience</span><select className="rd-input" value={segment} onChange={e => { setSegment(e.target.value); setApproved(false); }}><option value="all">All subscribers</option><option value="plus">{session.freePlus === false ? "Plus members" : "Members with a paid-plan entitlement"}</option><option value="free">Free members</option><option value="priority">Priority members</option></select></label>
        <label className="rd-field"><span>Send time in your device timezone</span><input className="rd-input" type="datetime-local" value={sendAt} onChange={e => { setSendAt(e.target.value); setApproved(false); }} required /></label>
        {newsletter ? <label className="rd-field"><span><input type="checkbox" checked={approved} required
          onChange={event => setApproved(event.target.checked)} /> I’ve reviewed the draft, audience, and send time.</span></label> : null}
        <button className="rd-btn" disabled={busy || (newsletter && !approved)}>Schedule campaign</button>
      </form> : <p>Campaign sending is disabled.</p>}
      {data.campaigns.map(row => <div key={row.id} className="rd-row">
        <span>{row.subject} · {row.segment} · {row.status} · {new Date(row.atMs).toLocaleString("en-CA", { timeZone: "America/Vancouver" })} Pacific · SMTP accepted {row.accepted}, failed or skipped {row.failed}, unconfirmed {row.unconfirmed}</span>
        {["scheduled", "sending"].includes(row.status) ? <button className="rd-btn" disabled={busy} onClick={() => void run(() => api.memberRequest(token, `/admin/growth/campaign/${row.id}/cancel`, {}), "Campaign canceled.")}>Cancel campaign</button> : null}
      </div>)}
    </> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert" className="rd-error">{error}</p> : null}
  </section>;
}
