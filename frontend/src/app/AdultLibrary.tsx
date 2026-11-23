import React, { useEffect, useState } from "react";
import {
  ADULT_VIDEO_CATEGORIES, type AdultVideo, type AdultVideoCategory, type AdultVideoFavorite
} from "../../../shared/adultLibrary";
import type { Session, apiClient } from "./api";

type Api = ReturnType<typeof apiClient>;
type Library = { videos: AdultVideo[]; favorites: string[] };
type VideoDraft = Omit<AdultVideo, "id"> & { id?: string };
const emptyDraft: VideoDraft = { title: "", creator: "", category: "solo", watchUrl: "", thumbnailUrl: "" };

function errorText(error: unknown): string {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message : "Something went wrong. Please try again.";
}

export function AdultProfileFavorites({ videos }: { videos: readonly AdultVideoFavorite[] }) {
  if (!videos.length) return null;
  return <section className="rd-member-bio">
    <h3>Favorite adult videos</h3>
    <ol>
      {videos.map(video => <li key={video.id}>
        <a href={video.watchUrl} target="_blank" rel="noopener noreferrer">{video.title}</a> · {video.creator}
      </li>)}
    </ol>
  </section>;
}

export function AdultLibrary({ api, session, onRegister }: { api: Api; session: Session; onRegister?(): void }) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<VideoDraft>(emptyDraft);
  const [retry, setRetry] = useState(0);
  const token = session.sessionToken;

  useEffect(() => {
    if (session.userType === "guest" || !session.ageVerified) return;
    let active = true;
    setError("");
    void api.memberRequest<Library>(token, "/adult-library").then(data => {
      if (active) setLibrary(data);
    }, error => {
      if (active) setError(errorText(error));
    });
    return () => { active = false; };
  }, [api, retry, session.ageVerified, session.userType, token]);

  async function updateFavorite(id: string) {
    if (busy || !library) return;
    const ids = library.favorites.includes(id) ? library.favorites.filter(item => item !== id) : [...library.favorites, id];
    if (ids.length > 3) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { favorites } = await api.memberRequest<Pick<Library, "favorites">>(token, "/adult-library/favorites", { ids }, "PUT");
      setLibrary({ ...library, favorites });
      setStatus("Profile favorites updated.");
    } catch (error) {
      setError(errorText(error));
    } finally { setBusy(false); }
  }

  async function saveVideo(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !library) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { video } = await api.memberRequest<{ video: AdultVideo }>(token, "/admin/adult-library", draft, "PUT");
      const videos = draft.id ? library.videos.map(entry => entry.id === video.id ? video : entry) : [...library.videos, video];
      setLibrary({ ...library, videos });
      setCategory(video.category);
      setDraft(emptyDraft);
      setStatus("Video saved.");
    } catch (error) {
      setError(errorText(error));
    } finally { setBusy(false); }
  }

  async function removeVideo(video: AdultVideo) {
    if (busy || !library || !window.confirm(`Remove “${video.title}” from the directory?`)) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await api.memberRequest(token, `/admin/adult-library/${encodeURIComponent(video.id)}`, undefined, "DELETE");
      setLibrary({
        videos: library.videos.filter(entry => entry.id !== video.id),
        favorites: library.favorites.filter(id => id !== video.id)
      });
      if (draft.id === video.id) setDraft(emptyDraft);
      setStatus("Video removed.");
    } catch (error) {
      setError(errorText(error));
    } finally { setBusy(false); }
  }

  const categories = Object.entries(ADULT_VIDEO_CATEGORIES).map(([id, name]) => <option key={id} value={id}>{name}</option>);
  const visible = library?.videos.filter(video => !category || video.category === category) ?? [];
  const favorites = library?.favorites.flatMap(id => {
    const video = library.videos.find(entry => entry.id === id);
    return video ? [video] : [];
  }) ?? [];

  return <section className="rd-card rd-adult-library" aria-labelledby="adult-library-title">
    <div className="rd-card-body">
      <h1 id="adult-library-title">Adult video directory · 18+</h1>
      {session.userType === "guest" ? <>
        <p>Sign in with a Badehaus X account to browse adult videos and choose profile favorites.</p>
        <button type="button" className="rd-btn primary" onClick={onRegister}>Create an account</button>
      </> : <>
        <p>Videos open on their original hosts. Choose up to three favorites to show to signed-in, age-verified members who view your profile.</p>
        {error && <p className="rd-error" role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
        {!library ? error ? <button type="button" className="rd-btn" onClick={() => setRetry(value => value + 1)}>Retry</button> : <p role="status">Loading directory…</p> : <>
          <section aria-label="Your profile favorites">
            <h2>Your profile favorites ({favorites.length}/3)</h2>
            {favorites.length > 0 && <ol>{favorites.map(video => <li key={video.id}>
              {video.title} <button type="button" className="rd-btn" disabled={busy} aria-label={`Remove ${video.title} from favorites`} onClick={() => void updateFavorite(video.id)}>Remove</button>
            </li>)}</ol>}
          </section>
          <label className="rd-field">
            <span className="rd-label">Video category</span>
            <select className="rd-input" value={category} onChange={event => setCategory(event.target.value)}>
              <option value="">All categories</option>{categories}
            </select>
          </label>
          {visible.length === 0 ? <p>No videos in this category yet.</p> : <div className="rd-adult-video-grid">
            {visible.map(video => {
              const selected = library.favorites.includes(video.id);
              return <article key={video.id} className="rd-card">
                <a href={video.watchUrl} target="_blank" rel="noopener noreferrer">
                  <img src={video.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <h2>{video.title}</h2>
                </a>
                <p>{video.creator} · {ADULT_VIDEO_CATEGORIES[video.category]}</p>
                <button type="button" className="rd-btn" disabled={busy || (!selected && library.favorites.length >= 3)} aria-pressed={selected}
                  onClick={() => void updateFavorite(video.id)}>{selected ? "Remove from favorites" : "Add to profile favorites"}</button>
                {session.role === "admin" && <div className="rd-row">
                  <button type="button" className="rd-btn" onClick={() => setDraft(video)}>Edit video</button>
                  <button type="button" className="rd-btn" disabled={busy} onClick={() => void removeVideo(video)}>Remove video</button>
                </div>}
              </article>;
            })}
          </div>}
          {session.role === "admin" && <form className="rd-adult-editor" onSubmit={saveVideo}>
            <h2>{draft.id ? "Edit video" : "Add a video"}</h2>
            <p>Use a direct HTTPS thumbnail URL you have permission to display.</p>
            <label className="rd-field">Title<input className="rd-input" required maxLength={140} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
            <label className="rd-field">Creator or studio<input className="rd-input" required maxLength={100} value={draft.creator} onChange={event => setDraft({ ...draft, creator: event.target.value })} /></label>
            <label className="rd-field">Category<select className="rd-input" value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value as AdultVideoCategory })}>{categories}</select></label>
            <label className="rd-field">Original video URL<input className="rd-input" type="url" required value={draft.watchUrl} onChange={event => setDraft({ ...draft, watchUrl: event.target.value })} /></label>
            <label className="rd-field">Thumbnail URL<input className="rd-input" type="url" required value={draft.thumbnailUrl} onChange={event => setDraft({ ...draft, thumbnailUrl: event.target.value })} /></label>
            <div className="rd-row">
              <button type="submit" className="rd-btn primary" disabled={busy}>Save video</button>
              {draft.id && <button type="button" className="rd-btn" onClick={() => setDraft(emptyDraft)}>Cancel edit</button>}
            </div>
          </form>}
        </>}
      </>}
    </div>
  </section>;
}
