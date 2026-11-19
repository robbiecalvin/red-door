import React, { useEffect, useState } from "react";
import type { PayoutContact as Contact } from "../../../shared/payoutContact";
import type { apiClient } from "./api";

export function PayoutContact({ api, token }: { api: ReturnType<typeof apiClient>; token: string }) {
  const [saved, setSaved] = useState<Contact | null>(null);
  const [kind, setKind] = useState<Contact["kind"]>("email");
  const [value, setValue] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const path = "/membership/payout-contact";
  useEffect(() => {
    let active = true;
    setReady(false);
    void api.memberRequest<{ contact: Contact | null }>(token, path).then(({ contact }) => {
      if (!active) return;
      setSaved(contact);
      setKind(contact?.kind ?? "email");
      setValue(contact?.value ?? "");
      setReady(true);
    }).catch(() => { if (active) setError("Couldn’t load your e-transfer contact."); });
    return () => { active = false; };
  }, [api, token]);

  async function save(contact: Contact | null) {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const result = await api.memberRequest<{ contact: Contact | null }>(token, path, { contact }, "PUT");
      setSaved(result.contact);
      setValue(result.contact?.value ?? "");
      setNotice(result.contact ? "E-transfer contact saved." : "E-transfer contact removed.");
    } catch (cause) {
      setError((cause as { message?: string }).message ?? "Couldn’t save your e-transfer contact.");
    } finally { setBusy(false); }
  }

  return <form onSubmit={event => { event.preventDefault(); void save({ kind, value }); }}>
    <h3>E-transfer contact</h3>
    <p className="rd-muted">Visible to you and admins reviewing an unpaid referral commission.</p>
    <label className="rd-field"><span>Contact method</span><select className="rd-input" value={kind} disabled={!ready || busy}
      onChange={event => { const next = event.target.value as Contact["kind"]; setKind(next); setValue(saved?.kind === next ? saved.value : ""); }}>
      <option value="email">Email</option><option value="phone">Phone</option>
    </select></label>
    <label className="rd-field"><span>{kind === "email" ? "E-transfer email address" : "E-transfer phone number"}</span>
      <input className="rd-input" type={kind === "email" ? "email" : "tel"} autoComplete={kind === "email" ? "email" : "tel"}
        value={value} onChange={event => setValue(event.target.value)} maxLength={kind === "email" ? 254 : 30} required disabled={!ready || busy} />
    </label>
    <div className="rd-row">
      <button type="submit" className="rd-btn" disabled={!ready || busy || !value.trim()}>Save e-transfer contact</button>
      {saved ? <button type="button" className="rd-btn" disabled={busy} onClick={() => void save(null)}>Remove contact</button> : null}
    </div>
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert" className="rd-error">{error}</p> : null}
  </form>;
}
