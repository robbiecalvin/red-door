import { googlePlayEdition } from "./edition";
import { ApprovedPhotoPicker } from "./ApprovedPhotoPicker";
import { ReportProfileMediaButton } from "./MemberPanels";
import React, { useEffect, useState } from "react";
import { uploadToLocalSignedUrl, type apiClient, type PlusStatus, type Session } from "./api";

type Props = { api: ReturnType<typeof apiClient>; session: Session };
type Entry = { id: string; name: string };
type Queue = { pending: Entry[]; access: Entry[]; received: Entry[] };
type Album = Awaited<ReturnType<Props["api"]["getPrivateAlbum"]>>;
type State = "unavailable" | "available" | "pending" | "approved";
const route = "/plus/album-requests";

function ProtectedAlbumPhoto({ url, token }: { url: string; token: string }) {
  const [photo, setPhoto] = useState<{ source: string; url: string }>();
  useEffect(() => {
    let active = true;
    let blobUrl: string | undefined;
    void fetch(url, { headers: { "x-session-token": token }, cache: "no-store" }).then(async response => {
      if (!response.ok) return;
      const blob = await response.blob();
      if (!active) return;
      blobUrl = URL.createObjectURL(blob);
      setPhoto({ source: url, url: blobUrl });
    }).catch(() => {});
    return () => { active = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [url, token]);
  return photo?.source === url ? <img src={photo.url} alt="Private album photo" /> : null;
}

function AlbumPhotos({ album, remove, report, token }: { album: Album | null; token: string; remove?: (id: string) => void; report?: (id: string) => React.ReactNode }) {
  const [expired, setExpired] = useState<Album | null>(null);
  useEffect(() => {
    if (!album) return;
    const timer = window.setTimeout(() => setExpired(album), album.expiresInSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [album]);
  if (!album || album === expired) return null;
  return <div className="rd-private-grid">{album.photos.map(photo => <div key={photo.mediaId}>
    {googlePlayEdition ? <ProtectedAlbumPhoto url={photo.downloadUrl} token={token} /> : <img src={photo.downloadUrl} alt="Private album photo" />}
    {report?.(photo.mediaId)}
    {remove ? <button type="button" className="rd-btn" onClick={() => remove(photo.mediaId)}>Remove</button> : null}
  </div>)}</div>;
}

export function RequestPrivateAlbum({ api, session, ownerId }: Props & { ownerId: string }) {
  const [state, setState] = useState<State>("unavailable");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const token = session.sessionToken;
  const path = `${route}/${encodeURIComponent(ownerId)}`;
  useEffect(() => {
    if (!session.userId || session.userId === ownerId || !session.ageVerified) return;
    let active = true;
    void api.memberRequest<{ status: State }>(token, path).then(result => {
      if (active) setState(result.status);
    }).catch(() => {});
    return () => { active = false; };
  }, [api, ownerId, path, session.ageVerified, session.userId, token]);

  if (!session.userId || session.userId === ownerId || state === "unavailable") return null;
  return <div>
    {state === "available" ? <button type="button" className="rd-btn" disabled={busy} onClick={() => {
      setBusy(true);
      setError("");
      void api.memberRequest<{ status: State }>(token, path, {}).then(result => setState(result.status))
        .catch(cause => setError(cause.message || "Unable to request this album.")).finally(() => setBusy(false));
    }}>Request Private Album</button> : <p role="status">{state === "pending" ? "Private album request pending." : "Album shared with you. Open it in Settings → Photos."}</p>}
    {error ? <p className="rd-error" role="alert">{error}</p> : null}
  </div>;
}

export function PrivateAlbumsSettings({ api, session }: Props) {
  const [status, setStatus] = useState<PlusStatus | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [owned, setOwned] = useState<Album | null>(null);
  const [viewed, setViewed] = useState<{ id: string; name: string; album: Album } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { userId, sessionToken: token } = session;
  async function refresh() {
    if (!userId) return;
    const results = await Promise.allSettled([
      api.getPlus(token), api.memberRequest<Queue>(token, route), api.getPrivateAlbum(token, userId)
    ] as const);
    const [plan, requests, album] = results;
    if (plan.status === "fulfilled") setStatus(plan.value);
    if (requests.status === "fulfilled") setQueue(requests.value);
    if (album.status === "fulfilled") setOwned(album.value);
    if (requests.status === "rejected" && requests.reason?.context?.status === 404) {
      throw new Error("Album requests are unavailable on this server version. You can still manage your own photos.");
    }
    for (const result of results) if (result.status === "rejected") throw result.reason;
  }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (cause) { setError((cause as { message?: string }).message ?? "Unable to update your private album."); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (userId) void run(refresh); }, [api, token, userId]);

  async function save(ids: string[]) {
    await api.savePlusPreferences(token, { privateMediaIds: ids });
    await refresh();
  }
  async function upload(file: File) {
    if (!status) return;
    const media = await api.initiateMediaUpload(token, { kind: "photo_private", mimeType: file.type, sizeBytes: file.size });
    if (!(await uploadToLocalSignedUrl(media.uploadUrl, file, file.type))) {
      const response = await fetch(media.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("Photo upload failed.");
    }
    await api.completeMediaUpload(token, media.mediaId);
    await save([...status.privateMediaIds, media.mediaId]);
  }
  async function respond(id: string, action: "approve" | "decline" | "revoke") {
    await api.memberRequest(token, `${route}/${encodeURIComponent(id)}/respond`, { action });
    setQueue(await api.memberRequest<Queue>(token, route));
  }

  if (!userId) return <p>Sign in to manage private albums.</p>;
  return <section className="rd-card rd-settings-body">
    <h2>Your private album</h2>
    {status ? <>
      <p>{status.privateMediaIds.length} / {status.limits.privateAlbum} photos</p>
      {googlePlayEdition ? <ApprovedPhotoPicker api={api} session={session} destination="private-album" action="Add to album"
        excluded={status.privateMediaIds} disabled={busy || status.privateMediaIds.length >= status.limits.privateAlbum}
        onChoose={id => save([...status.privateMediaIds, id])} /> : <label className="rd-field"><span>Add a private photo</span><input type="file" accept="image/jpeg,image/png,image/webp"
        disabled={busy || status.privateMediaIds.length >= status.limits.privateAlbum} onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void run(() => upload(file));
        }} /></label>}
      <AlbumPhotos token={token} album={owned} remove={busy ? undefined : id => void run(() => save(status.privateMediaIds.filter(photo => photo !== id)))} />
    </> : null}
    <button type="button" className="rd-btn" disabled={busy} onClick={() => void run(refresh)}>Refresh album</button>
    <h3>Album requests</h3>
    {queue?.pending.length ? queue.pending.map(row => <div className="rd-row" key={row.id}>
      <span>{row.name}</span>
      <button type="button" className="rd-btn" disabled={busy || !status?.privateMediaIds.length} onClick={() => void run(() => respond(row.id, "approve"))}>Approve</button>
      <button type="button" className="rd-btn" disabled={busy} onClick={() => void run(() => respond(row.id, "decline"))}>Decline</button>
    </div>) : queue ? <p>No pending requests.</p> : null}
    {queue?.access.length ? <>
      <h3>Members with access</h3>
      {queue.access.map(row => <div className="rd-row" key={row.id}><span>{row.name}</span>
        <button type="button" className="rd-btn" disabled={busy} onClick={() => void run(() => respond(row.id, "revoke"))}>Revoke access</button></div>)}
    </> : null}
    <h3>Albums shared with you</h3>
    {queue?.received.length ? queue.received.map(row => <div className="rd-row" key={row.id}>
      <span>{row.name}</span>
      <button type="button" className="rd-btn" disabled={busy} onClick={() => void run(async () => {
        setViewed(null);
        setViewed({ id: row.id, name: row.name, album: await api.getPrivateAlbum(token, row.id) });
      })}>Open album</button>
    </div>) : queue ? <p>No albums have been shared with you.</p> : null}
    {viewed ? <><h4>{viewed.name}’s album</h4><AlbumPhotos token={token} album={viewed.album} report={googlePlayEdition ? mediaId =>
      <ReportProfileMediaButton api={api} session={session} mediaId={mediaId} video={false}
        reportPath={`/plus/albums/${encodeURIComponent(viewed.id)}/photos/${encodeURIComponent(mediaId)}/report`} /> : undefined} /></> : null}
    {error ? <p className="rd-error" role="alert">{error}</p> : null}
  </section>;
}
