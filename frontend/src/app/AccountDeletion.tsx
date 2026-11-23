import React, { useState } from "react";

export const deletionPage = "?account-deletion=1";

export function AccountDeletion({ apiBase }: { apiBase: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [requested, setRequested] = useState(false);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(action: "request" | "confirm", data: object) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/account-deletion/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), cache: "no-store"
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Account deletion is temporarily unavailable.");
      if (action === "request") setRequested(true);
      else {
        setResult(body.status === "deleted" ? "Your account has been deleted." : "Your deletion request has been received. Processing will continue on the server.");
        setCode("");
        setConfirmation("");
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="rd-main">
    <section className="rd-card rd-settings-body">
      <h1>Delete your Badehaus X account</h1>
      <p>Deletion removes your access, profile, conversations, and reviewed uploads. Safety evidence and records required for billing or legal reasons may be retained.</p>
      {result ? <p role="status">{result}</p> : <>
        <form onSubmit={event => { event.preventDefault(); void submit("request", { email }); }}>
          <label className="rd-field"><span>Account email</span><input className="rd-input" type="email" autoComplete="email" required
            value={email} onChange={event => setEmail(event.target.value)} /></label>
          <button className="rd-btn" disabled={busy} type="submit">Email me a deletion code</button>
        </form>
        {requested && <p role="status">If the email belongs to an eligible account, check your inbox for a deletion code.</p>}
        <form onSubmit={event => { event.preventDefault(); void submit("confirm", { code, confirmation }); }}>
          <label className="rd-field"><span>Deletion code</span><input className="rd-input" autoComplete="one-time-code" required
            value={code} onChange={event => setCode(event.target.value)} /></label>
          <label className="rd-field"><span>Type DELETE to confirm</span><input className="rd-input" required
            value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
          <button type="submit" className="rd-btn primary" disabled={busy || confirmation !== "DELETE" || !code.trim()}>Permanently delete account</button>
        </form>
      </>}
      {error && <p role="alert">{error}</p>}
      <a className="rd-btn" href="./">Return to Badehaus X</a>
    </section>
  </main>;
}
