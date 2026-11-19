import React, { useEffect, useState } from "react";
import { MARKETING_CONSENT_LABEL } from "../../../shared/marketing";
import type { apiClient, Session } from "./api";

type Props = { api: ReturnType<typeof apiClient>; session: Session };
type Credit = { ownerEmail?: string; invoiceId: string; live: boolean; grossCents: number; refundedCents: number; status: string; payout?: { reference: string } };
type Campaign = { id: string; subject: string; segment: string; atMs: number; status: string; accepted: number; failed: number; unconfirmed: number };
type Growth = { referrals: number; verifiedReferrals: number; marketingSubscribers: number; marketingSendingEnabled: boolean; commissionCents: number; credits: Credit[]; campaigns: Campaign[] };
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
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [segment, setSegment] = useState("all");
  const [sendAt, setSendAt] = useState("");
  const [payout, setPayout] = useState<{ invoiceId: string; reference: string } | null>(null);
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
        {credit.live && credit.status === "pending" ? <button className="rd-btn" disabled={busy} onClick={() => void run(() =>
          api.memberRequest(token, "/admin/growth/commission", { invoiceId: credit.invoiceId, action: "approve" }), "Commission approved.")}>Approve commission</button> : null}
        {credit.live && credit.status === "earned" ? <button className="rd-btn" onClick={() => setPayout({ invoiceId: credit.invoiceId, reference: "" })}>Record completed payout</button> : null}
      </div>)}
      {payout ? <form onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          await api.memberRequest(token, "/admin/growth/commission", { ...payout, action: "record-payout" });
          setPayout(null);
        }, "Completed payout recorded.");
      }}>
        <label className="rd-field"><span>External payout reference for {payout.invoiceId}</span><input className="rd-input" maxLength={120} value={payout.reference} onChange={event => setPayout({ ...payout, reference: event.target.value })} required /></label>
        <button className="rd-btn" disabled={busy || !payout.reference.trim()}>Record payout</button>
      </form> : null}
      <h3>Marketing campaigns</h3>
      {data.marketingSendingEnabled ? <form onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          await api.memberRequest(token, "/admin/growth/campaign", { subject, body, segment, atMs: new Date(sendAt).getTime() });
          setSubject(""); setBody(""); setSendAt("");
        }, "Campaign scheduled.");
      }}>
        <label className="rd-field"><span>Subject</span><input className="rd-input" maxLength={120} value={subject} onChange={e => setSubject(e.target.value)} required /></label>
        <label className="rd-field"><span>Message</span><textarea className="rd-input" maxLength={4000} value={body} onChange={e => setBody(e.target.value)} required /></label>
        <label className="rd-field"><span>Opted-in audience</span><select className="rd-input" value={segment} onChange={e => setSegment(e.target.value)}><option value="all">All subscribers</option><option value="plus">Plus members</option><option value="free">Free members</option><option value="priority">Priority members</option></select></label>
        <label className="rd-field"><span>Send time in your device timezone</span><input className="rd-input" type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)} required /></label>
        <button className="rd-btn" disabled={busy}>Schedule campaign</button>
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
