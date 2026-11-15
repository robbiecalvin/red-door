import React, { useEffect, useRef, useState } from "react";
import { apiClient } from "./api";
export function PasswordRecovery({ api, token, onClose, onComplete }: { api: ReturnType<typeof apiClient>; token: string; onClose(): void; onComplete(): void }): React.ReactElement {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (token) { await api.confirmPasswordReset(token, password); onComplete(); }
      else { const result = await api.requestPasswordReset(email); setMessage(result.message); }
    } catch(e) { setError((e as Error).message || "Unable to reset your password."); } finally { setBusy(false); }
  }
  return <div className="rd-plus-backdrop"><section className="rd-plus-panel" role="dialog" aria-modal="true" aria-label="Password recovery" onKeyDown={e => { if (e.key === "Escape") onClose(); }}><div className="rd-plus-heading"><h2>{token ? "Choose a new password" : "Forgot your password?"}</h2><button className="rd-btn" onClick={onClose}>Close</button></div><p className="rd-plus-small">{token ? "Use at least 10 characters with uppercase, lowercase, a number, and a symbol. Updating your password signs out all existing sessions." : "Enter your account email. We’ll send a single-use link that expires in 15 minutes."}</p><form onSubmit={e => void submit(e)}><label className="rd-field"><span className="rd-label">{token ? "New password" : "Account email"}</span><input ref={input} className="rd-input" aria-label={token ? "New password" : "Recovery email"} required minLength={token ? 10 : undefined} type={token ? "password" : "email"} autoComplete={token ? "new-password" : "email"} value={token ? password : email} onChange={e => token ? setPassword(e.target.value) : setEmail(e.target.value)} /></label><button className="rd-btn primary" disabled={busy}>{busy ? "Please wait…" : token ? "Update password" : "Send reset link"}</button></form>{message ? <p role="status">{message}</p> : null}{error ? <p role="alert" className="rd-error">{error}</p> : null}</section></div>;
}
