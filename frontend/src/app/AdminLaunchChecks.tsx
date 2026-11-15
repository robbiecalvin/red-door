import React, { useState } from "react";
import { apiClient, type Session } from "./api";

type Report = {
  checkedAt: string;
  checks: Record<string, { status: "passed" | "needs_configuration" | "failed"; detail: string }>;
  manualVerificationRequired: string[];
};
export function AdminLaunchChecks({ api, session }: { api: ReturnType<typeof apiClient>; session: Session }) {
  const [report, setReport] = useState<Report | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (session.role !== "admin") return null;
  const labels: Record<string, string> = { database: "Database", smtp: "Email connection", stripe: "Stripe price and configuration", md: "MD configuration", storage: "Persistent storage", persistence: "Recent storage writes" };
  async function check() {
    setBusy(true); setError("");
    try { setReport(await api.memberRequest<Report>(session.sessionToken, "/admin/launch/health")); }
    catch { setError("Launch checks could not finish. Check the backend connection and try again."); }
    finally { setBusy(false); }
  }
  return <section className="rd-card rd-settings-body">
    <div className="rd-eyebrow">ADMINISTRATOR ONLY</div><h2>Launch readiness</h2>
    <p className="rd-muted">Check the connected backend without making a payment or sending an email. Successful connection checks still need checkout, delivery, restore and device rehearsals.</p>
    <button className="rd-btn primary" disabled={busy} onClick={() => void check()}>{busy ? "Checking services…" : "Run launch checks"}</button>
    {report ? <div aria-live="polite"><p className="rd-caption">Checked {new Date(report.checkedAt).toLocaleString()}</p>
      <dl className="rd-billing-summary">{Object.entries(report.checks).map(([name, item]) => <div key={name} style={{ display: "grid", gap: 6 }}><dt>{labels[name] ?? name}</dt><dd style={{ textAlign: "left" }}><strong>{item.status === "passed" ? "✓ Check passed" : item.status === "needs_configuration" ? "Needs configuration" : "Connection failed"}</strong><p className="rd-caption">{item.detail}</p></dd></div>)}</dl>
      <h3>Still verify before launch</h3><ul>{report.manualVerificationRequired.map(item => <li key={item}>{item}</li>)}</ul>
    </div> : null}
    {error ? <p className="rd-error" role="alert">{error}</p> : null}
  </section>;
}
