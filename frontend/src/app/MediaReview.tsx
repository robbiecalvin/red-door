import React, { useCallback, useEffect, useState } from "react";

const destinations = {
  "profile-photo": "Profile photo", "profile-gallery": "Gallery photo", "profile-video": "Profile video",
  "private-album": "Private album photo", "group-photo": "Group photo", "chat-photo": "Chat photo",
  "chat-video": "Chat video", "chat-audio": "Chat audio"
};
type Destination = keyof typeof destinations;
type Submission = { id: string; destination: Destination; mimeType: string; status: string; reason?: string };

export function MediaReview({ baseUrl, token, admin }: { baseUrl: string; token: string; admin: boolean }) {
  const [mine, setMine] = useState<Submission[]>([]);
  const [queue, setQueue] = useState<Submission[]>([]);
  const [destination, setDestination] = useState<Destination>("profile-photo");
  const [file, setFile] = useState<File | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved">("pending");
  const [preview, setPreview] = useState<{ id: string; url: string; mimeType: string }>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retention, setRetention] = useState("");
  const [retentionId, setRetentionId] = useState("");
  const [retentionReason, setRetentionReason] = useState("");

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("x-session-token", token);
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.message || "Could not complete the media request.");
    }
    return response;
  }, [baseUrl, token]);

  const refresh = useCallback(async () => {
    const own = await (await request("/media-review")).json();
    setMine(own.submissions);
    if (admin) {
      const pending = await (await request(`/admin/media-review?status=${filter}`)).json();
      setQueue(pending.submissions);
    }
  }, [admin, filter, request]);

  useEffect(() => { void refresh().catch(error => setError(error.message)); }, [refresh]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); } catch (error) {
      setError(error instanceof Error ? error.message : "Could not complete the media request.");
    } finally { setBusy(false); }
  }

  return <section className="rd-card rd-settings-body" aria-label="Media review">
    <h2>Media review</h2>
    <p>Profile photos, gallery photos, and profile videos appear after approval. Choose an approved group photo when creating a group plan. Add approved album photos in Settings → Photos or send approved chat photos from a conversation.</p>
    <form onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      if (file) void perform(async () => {
        await request(`/media-review/${destination}`, {
          method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" }
        });
        form.reset();
        setFile(null);
        await refresh();
      });
    }}>
      <label>Media type <select value={destination} onChange={event => { setDestination(event.target.value as Destination); }}>
        {Object.entries(destinations).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <input type="file" aria-label="Media file" onChange={event => setFile(event.target.files?.[0] ?? null)} />
      <button type="submit" className="rd-btn primary" disabled={busy || !file}>Submit for review</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {mine.length > 0 && <ul>{mine.map(item => <li key={item.id}>
      {destinations[item.destination]} · {item.status}{item.reason ? ` · ${item.reason}` : ""}
      {(item.status === "pending" || item.status === "approved") &&
        <button type="button" className="rd-btn" disabled={busy} onClick={() => {
          if (!window.confirm("Withdraw this submission? It will stop showing anywhere you shared it.")) return;
          void perform(async () => {
            await request(`/media-review/${item.id}/withdraw`, { method: "POST" });
            await refresh();
          });
        }}>Withdraw</button>}
    </li>)}</ul>}
    {admin && <>
      <h3>Moderator queue</h3>
      <label>Status <select value={filter} onChange={event => {
        setPreview(undefined);
        setReason("");
        setFilter(event.target.value === "approved" ? "approved" : "pending");
      }}><option value="pending">Pending</option><option value="approved">Approved</option></select></label>
      <button type="button" className="rd-btn" disabled={busy} onClick={() => void perform(refresh)}>Refresh</button>
      <ul>{queue.map(item => <li key={item.id}>
        <button type="button" className="rd-btn" disabled={busy} onClick={() => void perform(async () => {
          const response = await request(`/admin/media-review/${item.id}/content`);
          setReason("");
          setPreview({ id: item.id, mimeType: item.mimeType, url: URL.createObjectURL(await response.blob()) });
        })}>Review {destinations[item.destination]}</button>
        <small> Media reference {item.id}</small>
      </li>)}</ul>
      {preview && <div>
        {preview.mimeType.startsWith("image/") ? <img src={preview.url} alt="Submission under review" style={{ maxWidth: "100%", maxHeight: 420 }} /> :
          preview.mimeType.startsWith("video/") ? <video src={preview.url} controls style={{ maxWidth: "100%" }} /> :
            <audio src={preview.url} controls />}
        <label>Decision reason <input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
        {(filter === "pending" ? ["approved", "rejected"] : ["removed"]).map(action => <button key={action} type="button"
          className="rd-btn" disabled={busy || (action !== "approved" && !reason.trim())} onClick={() => void perform(async () => {
            await request(`/admin/media-review/${preview.id}/decision`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason })
            });
            setPreview(undefined);
            await refresh();
          })}>{action === "approved" ? "Approve" : action === "rejected" ? "Reject" : "Remove"}</button>)}
      </div>}
      <h3>Media retention</h3>
      <button type="button" className="rd-btn" disabled={busy} onClick={() => void perform(async () => {
        const result = await (await request("/admin/media-review/retention")).json();
        setRetention(`${result.eligible} files eligible for cleanup. Automatic deletion is ${result.enabled ? "enabled" : "disabled"}.`);
      })}>Check cleanup eligibility</button>
      {retention && <p role="status">{retention}</p>}
      <label className="rd-field"><span>Media reference</span><input className="rd-input" value={retentionId} onChange={event => setRetentionId(event.target.value)} /></label>
      <label className="rd-field"><span>Hold or release reason</span><input className="rd-input" value={retentionReason} maxLength={500} onChange={event => setRetentionReason(event.target.value)} /></label>
      <div className="rd-row">{["hold", "release"].map(action => <button key={action} type="button" className="rd-btn"
        disabled={busy || !retentionId.trim() || !retentionReason.trim()} onClick={() => void perform(async () => {
          await request(`/admin/media-review/${encodeURIComponent(retentionId.trim())}/retention`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason: retentionReason })
          });
          setRetention(action === "hold" ? "Evidence hold applied." : "Evidence hold released.");
          setRetentionReason("");
        })}>{action === "hold" ? "Place evidence hold" : "Release evidence hold"}</button>)}</div>
    </>}
  </section>;
}
