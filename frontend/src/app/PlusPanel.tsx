import React, { useEffect, useRef, useState } from "react";
import { apiClient, uploadToLocalSignedUrl, type Session, type PlusStatus, type PublicProfile, type BillingHealth } from "./api";
import { type PlusData } from "../../../shared/plus";

import { PlusShowcase, PLUS_STORIES, type PlusFeature } from "./PlusShowcase";
import { Icon } from "./Icon";

type Api = ReturnType<typeof apiClient>;
export function openPlus(feature?: PlusFeature): void { window.dispatchEvent(new CustomEvent("rd:open-plus", {detail:{feature}})); }
export function PlusPanel({ api, session, onClose, feature, onRegister }: { api: Api; session: Session | null; onClose(): void; feature?: PlusFeature; onRegister?(): void }): React.ReactElement {
  const panelRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<PlusStatus | null>(null);
  const [billingHealth, setBillingHealth] = useState<BillingHealth | null>(null);
  const [loading, setLoading] = useState(false);
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
      setLoading(true);
      void refresh().catch(e => !cancelled && setError(e.message)).finally(() => !cancelled && setLoading(false));
      void api.getPublicProfiles().then(r => { if (!cancelled) setPeople(r.profiles.filter(p => p.userId !== session?.userId)); }).catch(() => { /* Album member lists can be refreshed by reopening Plus. */ });
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
        const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? []);
        const visible = elements.filter(el => el.getClientRects().length > 0);
        const first = visible[0], last = visible[visible.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="rd-plus-heading"><div className="rd-eyebrow">RED DOOR <span className="rd-plus-wordmark">PLUS</span></div><button className="rd-btn" onClick={onClose} aria-label="Close Plus">Close</button></div>
      <div className="rd-plus-hero"><span className="rd-plus-hero-symbol" aria-hidden="true">+</span><div className="rd-plus-eyeline">{status?.active ? "WELCOME TO YOUR PLUS" : "MORE POSSIBILITY. MORE YOU."}</div><h1>{status?.active ? <>Make it<br /><span>your kind of night.</span></> : <>Good chemistry.<br /><span>More possibilities.</span></>}</h1><p>{feature ? PLUS_STORIES[feature].description : "Your type. Your next city. Your private side. Open up more ways to connect."}</p><div className="rd-plus-hero-price">{status?.active ? <span className="rd-plus-active-label">✓ Plus is active</span> : <><strong>CAD $7.99</strong><span>/ month</span></>}</div></div>
      {status?.active ? <div className="rd-plus-status">{status.expiresAtMs ? `${status.hasBillingAccount ? "Current billing period through" : "Complimentary access until"} ${new Date(status.expiresAtMs).toLocaleString("en-CA", { timeZone: "America/Vancouver", dateStyle: "medium", timeStyle: "short" })} Pacific.` : "Your Plus benefits are ready."}{!status.hasBillingAccount ? <small>Complimentary access ends automatically. No automatic charge without a Stripe subscription.</small> : null}</div> : null}
      <PlusShowcase initialFeature={feature} />
      <details className="rd-plus-comparison"><summary>See everything you get</summary><div className="rd-plus-table-wrap"><table><caption>Free and Plus membership benefits</caption><thead><tr><th scope="col">Make it yours</th><th scope="col">Free</th><th scope="col">Plus</th></tr></thead><tbody>{[["Favorites", "20", "100"], ["Pinned chats", "3", "50"], ["Gallery photos", "3", "12 + video"], ["Private album photos", "3", "20"], ["Advanced filters", "—", "Included"], ["Saved searches", "—", "Up to 10"], ["Travel mode", "—", "Included"], ["Read receipts", "—", "Included"], ["Remembered discovery preferences", "—", "Included"], ["Group chat invitations", "—", "Included"]].map(row => <tr key={row[0]}><th scope="row">{row[0]}</th><td>{row[1]}</td><td>{row[2]}</td></tr>)}</tbody></table></div></details>
      <div className="rd-plus-free-note"><Icon name="shield" /><p>Discovery, direct messages, blocking, reporting, and essential privacy controls stay free. Cruise messages still expire within 72 hours.</p></div>
      <div className={`rd-plus-checkout ${status?.active ? "" : "is-offer"}`}>
      {status?.active ? <div className="rd-plus-member-actions"><strong>Your next move</strong><button className="rd-btn" onClick={() => { onClose(); window.location.hash = "#/discover-chat"; window.dispatchEvent(new CustomEvent("rd:discover-control", {detail:{action:"open_filters"}})); }}>Find your type</button><a className="rd-btn" href="#plus-private-album" onClick={e => { e.preventDefault(); document.getElementById("plus-private-album")?.scrollIntoView({behavior:"smooth"}); }}>Open your private album</a></div> : registered ? <><div className="rd-plus-checkout-price"><strong>Red Door Plus</strong><span>CAD $7.99 / month</span></div><button className="rd-btn primary" disabled={busy || loading || !status?.billingConfigured} onClick={() => void run(async () => { const r = await api.startSubscription(session!.sessionToken); window.location.assign(r.url); })}>{loading ? "Checking subscription…" : busy ? "Opening secure checkout…" : "Get Red Door Plus"}</button><small>Renews monthly until canceled. Manage or cancel through Stripe billing.</small></> : <><button className="rd-btn primary" onClick={onRegister} disabled={!onRegister}>Create an account to get Plus</button><small>CAD $7.99 / month. Guest conversations do not transfer to a new account.</small></>}
      </div>
      {!status?.active && registered && !loading && !status?.billingConfigured ? <div className="rd-plus-gate" role="status">Payments are temporarily unavailable. You can still explore everything Plus includes.<button className="rd-btn" disabled={busy} onClick={() => void run(refresh)}>Refresh payment status</button></div> : null}
      {error ? <p className="rd-error" role="alert">{error}</p> : null}
      {session?.role === "admin" ? <div className="rd-plus-gate"><strong>Admin payment connection</strong><button className="rd-btn" disabled={busy} onClick={() => void run(async () => { setBillingHealth(await api.getBillingHealth(session.sessionToken)); await refresh(); })}>Check Stripe connection</button>{billingHealth ? <div><p>Backend configuration: {billingHealth.configuration.configured ? "Complete" : "Incomplete"}</p>{billingHealth.configuration.missing.length ? <p>Missing on backend: {billingHealth.configuration.missing.join(", ")}</p> : null}{!billingHealth.configuration.publicUrlValid ? <p>PUBLIC_APP_URL must be a valid HTTPS URL.</p> : null}<p>Stripe connection: {billingHealth.stripeConnection}</p><p>CAD $7.99 monthly price: {billingHealth.priceValid ? "Verified" : "Not verified"}{billingHealth.mode ? ` (${billingHealth.mode} mode)` : ""}</p>{billingHealth.issue ? <p>{billingHealth.issue}</p> : null}<small>This checks configuration and reads the price; it does not create a subscription or charge a card. Webhook delivery still needs a separate Stripe test.</small></div> : null}</div> : null}
      {status?.hasBillingAccount ? <button className="rd-btn" disabled={busy} onClick={() => void run(async () => { const r = await api.manageSubscription(session!.sessionToken); window.location.assign(r.url); })}>Manage or cancel subscription</button> : null}
      {registered && status ? <div className="rd-plus-album" id="plus-private-album">
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
    </section>
  </div>;
}
