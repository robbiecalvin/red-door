import { PRIORITY_INVITATION_CODE } from "../../../shared/membership";
import React, { useEffect, useState } from "react";
import type { apiClient, PlusStatus, Session } from "./api";

type Props = { api: ReturnType<typeof apiClient>; session: Session };
type Queue = { radiusKm: number; applications: { id: string; email: string; approved: boolean }[] };

export function MembershipPrograms({ api, session }: Props) {
  const [referrals, setReferrals] = useState<{ verified: number; credits: { status: string; atMs: number }[] } | null>(null);
  const [status, setStatus] = useState<PlusStatus | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [radius, setRadius] = useState("100");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const token = session.sessionToken;

  useEffect(() => {
    let active = true;
    if (!session.userId) return;
    void api.getPlus(token).then(result => { if (active) { setStatus(result); if (result.priorityInvited || result.priorityPending) setCode(PRIORITY_INVITATION_CODE); } }).catch(() => {});
    if (session.role === "admin") {
      void api.memberRequest<Queue>(token, "/admin/membership/priority").then(result => {
        if (active) { setQueue(result); setRadius(String(result.radiusKm)); }
      }).catch((cause: { message?: string }) => { if (active) setError(cause.message ?? "Unable to load membership approvals."); });
    }
    return () => { active = false; };
  }, [api, session.role, session.userId, token]);

  useEffect(() => {
    let active = true;
    if (status?.priority) {
      void api.memberRequest<{ verified: number; credits: { status: string; atMs: number }[] }>(token, "/membership/referrals")
        .then(value => { if (active) setReferrals(value); }).catch(() => {});
    }
    return () => { active = false; };
  }, [api, status?.priority, token]);

  async function run(action: () => Promise<unknown>, notice: string) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
      setStatus(await api.getPlus(token));
      if (session.role === "admin") setQueue(await api.memberRequest<Queue>(token, "/admin/membership/priority"));
      setMessage(notice);
      window.dispatchEvent(new Event("rd:plus-changed"));
    } catch (cause) {
      setError((cause as { message?: string }).message ?? "Unable to update membership.");
    } finally { setBusy(false); }
  }

  if (!session.userId) return null;
  return <section className="rd-card rd-settings-body">
    <h2>Membership programs</h2>
    {status?.priorityInvited && !status.priority && !status.priorityPending ? <p>Priority invitation saved. Redeem it to activate complimentary Plus.</p> : null}
    {status?.founderRateEligible ? <p>Founding Member · CAD $4.99/month after your free period.</p> : null}
    {status?.priority ? <>
      <p>Priority Member · Complimentary Plus</p>
      {status.priorityReferralCode ? <p>Your personal referral code is <code>{status.priorityReferralCode}</code>.</p> : null}
      {referrals ? <p>{referrals.verified} verified referrals · {referrals.credits.filter(row => row.status === "pending").length} pending · {referrals.credits.filter(row => row.status === "earned").length} earned · {referrals.credits.filter(row => row.status === "paid").length} paid</p> : null}
      <button className="rd-btn" disabled={busy} onClick={() => void run(() => api.memberRequest(token, "/membership/priority/resign", {}), "Priority membership ended.")}>Resign from Priority</button>
    </> : <form onSubmit={event => {
      event.preventDefault();
      void run(() => api.memberRequest(token, "/membership/priority/apply", { code }), "Priority and complimentary Plus activated.");
    }}>
      <label className="rd-field"><span>Priority invitation code</span><input className="rd-input" autoComplete="off" maxLength={80} value={code} onChange={event => setCode(event.target.value)} required /></label>
      <button className="rd-btn" disabled={busy || !code.trim()}>Redeem Priority code</button>
    </form>}
    {queue ? <>
      <h3>Membership administration</h3>
      <form onSubmit={event => {
        event.preventDefault();
        void run(() => api.memberRequest(token, "/admin/membership", { action: "invite-founder", email }), "Founding Member access granted.");
      }}>
        <label className="rd-field"><span>Founding Member account email</span><input className="rd-input" type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
        <button className="rd-btn" disabled={busy || !email.trim()}>Grant Founding Membership</button>
      </form>
      <form onSubmit={event => {
        event.preventDefault();
        void run(() => api.memberRequest(token, "/admin/membership/radius", { radiusKm: Number(radius) }, "PUT"), "Priority radius saved.");
      }}>
        <label className="rd-field"><span>Priority discovery radius in kilometres</span><input className="rd-input" type="number" min={1} max={100} value={radius} onChange={event => setRadius(event.target.value)} required /></label>
        <button className="rd-btn" disabled={busy}>Save radius</button>
      </form>
      {queue.applications.map(row => <div key={row.id} className="rd-row">
        <span>{row.email}</span>
        <button className="rd-btn" disabled={busy} onClick={() => void run(() => api.memberRequest(token, "/admin/membership", {
          action: row.approved ? "revoke-priority" : "approve-priority", email: row.email
        }), row.approved ? "Priority membership revoked." : "Priority membership approved.")}>{row.approved ? "Revoke Priority" : "Approve Priority"}</button>
      </div>)}
    </> : null}
    {message ? <p role="status">{message}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
