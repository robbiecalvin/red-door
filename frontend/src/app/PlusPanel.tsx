import React, { useEffect, useRef, useState } from "react";
import { apiClient, uploadToLocalSignedUrl, type Session, type PlusStatus, type PublicProfile } from "./api";
import { PLUS_FEATURES, type PlusData } from "../../../shared/plus";

type Api = ReturnType<typeof apiClient>;
export function openPlus(): void { window.dispatchEvent(new Event("rd:open-plus")); }
export function PlusPanel({ api, session, onClose }: { api: Api; session: Session | null; onClose(): void }): React.ReactElement {
  const panelRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<PlusStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<ReadonlyArray<PublicProfile>>([]);
  const [recipient, setRecipient] = useState("");
  const [albumOwner, setAlbumOwner] = useState("");
  const [photos, setPhotos] = useState<{ mediaId: string; downloadUrl: string }[]>([]);
  const [viewerPhotos, setViewerPhotos] = useState<{ mediaId: string; downloadUrl: string }[]>([]);
  const registered = Boolean(session?.userId && session.ageVerified);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  async function refresh() {
    if (!session?.userId) return;
    setStatus(await api.getPlus(session.sessionToken));
    const album = await api.getPrivateAlbum(session.sessionToken, session.userId);
    setPhotos(album.photos);
  }
  useEffect(() => {
    let cancelled = false;
    if (registered) {
      void refresh().catch(e => !cancelled && setError(e.message));
      void api.getPublicProfiles().then(r => { if (!cancelled) setPeople(r.profiles.filter(p => p.userId !== session?.userId)); });
    }
    // Clear temporary media links after their authorization window ends.
    const timer = window.setInterval(() => { setPhotos([]); setViewerPhotos([]); }, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [api, session?.sessionToken]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch(e) { setError((e as Error).message || "Unable to complete this request."); } finally { setBusy(false); }
  }
  async function save(data: PlusData) {
    if (!session) return;
    await api.savePlusPreferences(session.sessionToken, data); await refresh();
  }
  async function upload(file: File) {
    if (!session || !status) return;
    const started = await api.initiateMediaUpload(session.sessionToken, { kind: "photo_private", mimeType: file.type, sizeBytes: file.size });
    if (!await uploadToLocalSignedUrl(started.uploadUrl, file, file.type)) {
      const response = await fetch(started.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("Photo upload failed.");
    }
    await api.completeMediaUpload(session.sessionToken, started.mediaId);
    await save({ privateMediaIds: [...status.privateMediaIds, started.mediaId] });
  }
  return <div className="rd-plus-backdrop" onClick={onClose}>
    <section ref={panelRef} role="dialog" aria-modal="true" aria-label="Red Door Plus" className="rd-plus-panel" onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []);
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="rd-plus-heading"><div className="rd-eyebrow">MORE WAYS TO CONNECT</div><button className="rd-btn" onClick={onClose} aria-label="Close Plus">Close</button></div>
      <h1>Red Door <span>Plus</span></h1><p className="rd-plus-price">$7.99 <span>CAD / month</span></p>
      <ul className="rd-plus-features">{PLUS_FEATURES.map(feature => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}</ul>
      <p className="rd-plus-small">Basic discovery, direct messaging, blocking, reporting, and essential privacy controls stay free. Cruise messages still expire within 72 hours.</p>
      {status?.active ? <div className="rd-plus-status">Plus is active{status.expiresAtMs ? ` until ${new Date(status.expiresAtMs).toLocaleString("en-CA", { timeZone: "America/Vancouver", dateStyle: "medium", timeStyle: "short" })} Pacific` : ""}.<br /><small>Complimentary access ends automatically. No automatic charge without a Stripe subscription.</small></div> : <button className="rd-btn primary" disabled={busy || !registered || !status?.billingConfigured} onClick={() => void run(async () => { const r = await api.startSubscription(session!.sessionToken); window.location.assign(r.url); })}>Subscribe for CAD $7.99/month</button>}
      {!registered ? <p className="rd-plus-small">Create an account and verify your age to access Plus.</p> : !status?.billingConfigured ? <p className="rd-plus-small">Paid subscriptions will be available once billing is connected.</p> : null}
      {status?.hasBillingAccount ? <button className="rd-btn" disabled={busy} onClick={() => void run(async () => { const r = await api.manageSubscription(session!.sessionToken); window.location.assign(r.url); })}>Manage or cancel subscription</button> : null}
      <p className="rd-plus-small">Paid subscriptions renew monthly until canceled. Manage cancellation through the billing portal.</p>
      {registered && status ? <div className="rd-plus-album">
        <h2>Your private album</h2><p>{status.privateMediaIds.length} / {status.limits.privateAlbum} photos. Only selected members can open it.</p>
        <label className="rd-field"><span className="rd-label">Add a private photo</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || status.privateMediaIds.length >= status.limits.privateAlbum} onChange={e => { const f = e.target.files?.[0]; if (f) void run(() => upload(f)); e.target.value = ""; }} /></label>
        <button className="rd-btn" disabled={busy} onClick={() => void run(refresh)}>Refresh album</button>
        <div className="rd-private-grid">{photos.map(photo => <div key={photo.mediaId}><img src={photo.downloadUrl} alt="Private album photo" /><button className="rd-btn" disabled={busy} onClick={() => void run(() => save({ privateMediaIds: status.privateMediaIds.filter(id => id !== photo.mediaId) }))}>Remove</button></div>)}</div>
        <label className="rd-field"><span className="rd-label">Share with a member</span><select className="rd-input" value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">Select a member</option>{people.map(p => <option key={p.userId} value={p.userId}>{p.displayName}</option>)}</select></label>
        <button className="rd-btn" disabled={!recipient || busy} onClick={() => void run(() => save({ albumSharedWith: [...new Set([...status.albumSharedWith, recipient])] }))}>Share album</button>
        {status.albumSharedWith.map(id => <div className="rd-row" key={id}><span>{people.find(p => p.userId === id)?.displayName ?? "Member"}</span><button className="rd-btn" disabled={busy} onClick={() => void run(() => save({ albumSharedWith: status.albumSharedWith.filter(x => x !== id) }))}>Revoke access</button></div>)}
        <p className="rd-plus-small">Revoking blocks new requests immediately. Previously issued photo links expire within 60 seconds; downloaded copies cannot be recalled.</p>
        <h2>Albums shared with you</h2><label className="rd-field"><span className="rd-label">Album owner</span><select className="rd-input" value={albumOwner} onChange={e => { setAlbumOwner(e.target.value); setViewerPhotos([]); }}><option value="">Select a member</option>{people.map(p => <option key={p.userId} value={p.userId}>{p.displayName}</option>)}</select></label>
        <button className="rd-btn" disabled={!albumOwner || busy} onClick={() => void run(async () => { setViewerPhotos((await api.getPrivateAlbum(session!.sessionToken, albumOwner)).photos); })}>Open shared album</button>
        <div className="rd-private-grid">{viewerPhotos.map(photo => <img key={photo.mediaId} src={photo.downloadUrl} alt="Shared private photo" />)}</div>
      </div> : null}
      {error ? <p className="rd-error" role="alert">{error}</p> : null}
    </section>
  </div>;
}
