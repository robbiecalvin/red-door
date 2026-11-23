import React, { useEffect, useState } from "react";
import type { apiClient, Session } from "./api";

export function ApprovedPhotoPicker({ api, session, destination, excluded = [], onChoose, action, disabled }: {
  api: ReturnType<typeof apiClient>;
  session: Session;
  destination: "private-album" | "chat-photo";
  excluded?: readonly string[];
  onChoose(id: string): Promise<void>;
  action: string;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<{ id: string; submittedAt: number }[]>([]);
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<{ id: string; url: string }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const token = session.sessionToken;

  useEffect(() => {
    let active = true;
    void api.memberRequest<{ submissions: { id: string; status: string; destination: string; submittedAt: number }[] }>(token, "/media-review")
      .then(({ submissions }) => { if (active) setRows(submissions.filter(row => row.status === "approved" && row.destination === destination)); })
      .catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [api, token, destination]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    let url: string | undefined;
    void api.memberPhoto(token, selected, "approved-photo-preview").then(blob => {
      if (active) {
        url = URL.createObjectURL(blob);
        setPreview({ id: selected, url });
      }
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [api, token, selected]);

  return <div className="rd-settings-body">
    <label className="rd-field"><span>Approved photo</span><select className="rd-input" value={selected} onChange={event => {
      setSelected(event.target.value);
      setError("");
    }}>
      <option value="">Choose a photo</option>
      {rows.filter(row => !excluded.includes(row.id)).map(row =>
        <option key={row.id} value={row.id}>{new Date(row.submittedAt).toLocaleString()}</option>)}
    </select></label>
    {selected && preview?.id === selected && <img src={preview.url} alt="Selected approved photo" style={{ maxWidth: 240, width: "100%" }} />}
    <p className="rd-caption">Submit photos for review in Settings → Profile.</p>
    <button type="button" className="rd-btn" disabled={!selected || excluded.includes(selected) || busy || disabled} onClick={async () => {
      setBusy(true);
      setError("");
      try { await onChoose(selected); setSelected(""); }
      catch (error) { setError((error as Error).message); }
      finally { setBusy(false); }
    }}>{action}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
