import catalogCategories from "../../../shared/adult-catalog-manifest.json";
import React, { useEffect, useState } from "react";
import {
  ADULT_VIDEO_CATEGORIES, type AdultVideo, type AdultVideoCategory, type AdultVideoFavorite
} from "../../../shared/adultLibrary";
import type { Session, apiClient } from "./api";

type Api = ReturnType<typeof apiClient>;
type SavedVideos = { favorites: string[]; savedVideos: AdultVideoFavorite[] };
type Library = { videos: AdultVideo[] } & SavedVideos;

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

type LibraryActions = {
  library: Library;
  busy: boolean;
  updateFavorite(id: string): Promise<void>;
};

function CuratedAdultLibrary({ api, session, library, category, busy: saving, updateFavorite, setLibrary }: LibraryActions & {
  api: Api; session: Session; category: string; setLibrary: React.Dispatch<React.SetStateAction<Library | null>>;
}) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setBusy] = useState(false);
  const [draft, setDraft] = useState<AdultVideo | null>(null);
  const busy = saving || editing;
  const token = session.sessionToken;

  async function saveVideo(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !library || !draft) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { video } = await api.memberRequest<{ video: AdultVideo }>(token, "/admin/adult-library", draft, "PUT");
      const videos = library.videos.map(entry => entry.id === video.id ? video : entry);
      setLibrary(current => current && { ...current, videos,
        savedVideos: current.savedVideos.map(entry => entry.id === video.id ? { id: video.id, title: video.title, creator: video.creator, watchUrl: video.watchUrl } : entry) });
      setDraft(null);
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
      setLibrary(current => current && {
        videos: current.videos.filter(entry => entry.id !== video.id),
        favorites: current.favorites.filter(id => id !== video.id),
        savedVideos: current.savedVideos.filter(entry => entry.id !== video.id)
      });
      if (draft?.id === video.id) setDraft(null);
      setStatus("Video removed.");
    } catch (error) {
      setError(errorText(error));
    } finally { setBusy(false); }
  }

  const categories = Object.entries(ADULT_VIDEO_CATEGORIES).map(([id, name]) => <option key={id} value={id}>{name}</option>);
  const visible = library?.videos.filter(video => !category || video.category === category) ?? [];
  return <>
    {error && <p role="alert" className="rd-error">{error}</p>}
    {status && <p role="status">{status}</p>}
    {visible.length === 0 ? <p>No videos in this category yet.</p> : <div className="rd-adult-video-grid">
      {visible.map(video => {
        const selected = library.favorites.includes(video.id);
        return <article key={video.id} className="rd-card">
          <a href={video.watchUrl} target="_blank" rel="noopener noreferrer">
            <img src={video.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
            <h2>{video.title}</h2>
          </a>
          <p>{video.creator} · {ADULT_VIDEO_CATEGORIES[video.category]}</p>
          <div className="rd-adult-video-actions">
            <a className="rd-btn primary" href={video.watchUrl} target="_blank" rel="noopener noreferrer">Open video</a>
            <button type="button" className="rd-btn" disabled={busy || (!selected && library.favorites.length >= 3)} aria-pressed={selected}
              onClick={() => void updateFavorite(video.id)}>{selected ? "Remove saved video" : "Save video"}</button>
          </div>
          {session.role === "admin" && <div className="rd-row">
            <button type="button" className="rd-btn" onClick={() => setDraft(video)}>Edit video</button>
            <button type="button" className="rd-btn" disabled={busy} onClick={() => void removeVideo(video)}>Remove video</button>
          </div>}
        </article>;
      })}
    </div>}
    {session.role === "admin" && draft && <form className="rd-adult-editor" onSubmit={saveVideo}>
      <h2>Edit video</h2>
      <p>Use a direct HTTPS thumbnail URL you have permission to display.</p>
      <label className="rd-field">Title<input className="rd-input" required maxLength={140} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="rd-field">Creator or studio<input className="rd-input" required maxLength={100} value={draft.creator} onChange={event => setDraft({ ...draft, creator: event.target.value })} /></label>
      <label className="rd-field">Category<select className="rd-input" value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value as AdultVideoCategory })}>{categories}</select></label>
      <label className="rd-field">Original video URL<input className="rd-input" type="url" required value={draft.watchUrl} onChange={event => setDraft({ ...draft, watchUrl: event.target.value })} /></label>
      <label className="rd-field">Thumbnail URL<input className="rd-input" type="url" required value={draft.thumbnailUrl} onChange={event => setDraft({ ...draft, thumbnailUrl: event.target.value })} /></label>
      <div className="rd-row">
        <button type="submit" className="rd-btn primary" disabled={busy}>Save video</button>
        <button type="button" className="rd-btn" onClick={() => setDraft(null)}>Cancel edit</button>
      </div>
    </form>}
  </>;
}

export function AdultClassifiedPreviews({ api, token }: { api: Api; token: string }) {
  const [videos, setVideos] = useState<AdultVideo[]>([]);
  const [status, setStatus] = useState("Loading previews…");
  useEffect(() => {
    let active = true;
    void api.memberRequest<{ videos: AdultVideo[] }>(token, "/adult-library/previews").then(result => {
      if (!active) return;
      setVideos(result.videos);
      setStatus(result.videos.length ? "" : "No video previews are available yet.");
    }, () => {
      if (active) setStatus("Video previews are temporarily unavailable.");
    });
    return () => { active = false; };
  }, [api, token]);
  return <section className="rd-card rd-adult-library" aria-label="From the 18+ directory">
    <div className="rd-card-body">
      <h2>From the 18+ directory</h2>
      {status && <p role="status">{status}</p>}
      {videos.length > 0 && <div className="rd-adult-video-grid">
        {videos.map(video => <article key={video.id}>
          <a href={video.watchUrl} target="_blank" rel="noopener noreferrer">
            <img src={video.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
            {video.title}
          </a>
        </article>)}
      </div>}
      <a href="#/adult-library">Browse the directory</a>
    </div>
  </section>;
}


type CatalogPage = { name: string; slug: string; page: number; pages: number; favorites: string[]; videos: { id: string; watchUrl: string; thumbnailUrl: string }[] };

function CatalogThumbnail({ url }: { url: string }) {
  const [unavailable, setUnavailable] = useState(false);
  return url && !unavailable
    ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setUnavailable(true)} />
    : <span className="rd-caption">Thumbnail unavailable</span>;
}

function BulkAdultPage({ api, session, category, page, library, busy, updateFavorite }: LibraryActions & {
  api: Api; session: Session; category: string; page: string;
}) {
  const [result, setResult] = useState<CatalogPage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (session.userType === "guest" || !session.ageVerified) return;
    let active = true;
    const params = new URLSearchParams({ category, page });
    void api.memberRequest<CatalogPage>(session.sessionToken, `/adult-library/catalog?${params}`).then(data => {
      if (active) setResult(data);
    }, failure => {
      if (active) setError(errorText(failure));
    });
    return () => { active = false; };
  }, [api, category, page, session.ageVerified, session.sessionToken, session.userType]);

  const appPage = (number: number) => `./?videoCategory=${encodeURIComponent(category)}&videoPage=${number}#/adult-library`;
  const publicPage = (number: number) => `./gay-porn/cat/${encodeURIComponent(category)}/${number === 1 ? "" : `page/${number}/`}`;
  return <>
      <nav className="rd-adult-links" aria-label="Adult video directory navigation">
        <a className="rd-btn primary" href={publicPage(Number(page))}>View this page on the website</a>
      </nav>
      {error ? <p role="alert">{error}</p> : !result ? <p role="status">Loading previews…</p> : <>
          <h2>{result.name}</h2>
          <div className="rd-adult-video-grid">
            {result.videos.map((video, index) => <article key={video.id} className="rd-card">
              <CatalogThumbnail url={video.thumbnailUrl} />
              <div className="rd-adult-video-actions">
                <a className="rd-btn primary" href={video.watchUrl} target="_blank" rel="noopener noreferrer">
                  Open video {(result.page - 1) * 20 + index + 1}
                </a>
                {video.id && <button type="button" className="rd-btn" aria-pressed={library.favorites.includes(video.id)}
                  disabled={busy || (!library.favorites.includes(video.id) && library.favorites.length >= 3)}
                  onClick={() => void updateFavorite(video.id)}>
                  {library.favorites.includes(video.id) ? "Remove saved video" : "Save video"}
                </button>}
              </div>
            </article>)}
          </div>
          <nav aria-label="Video results pages">
            {result.page > 1 && <a href={appPage(result.page - 1)}>Previous page</a>}
            {" · "}Page {result.page} of {result.pages}{" · "}
            {result.page < result.pages && <a href={appPage(result.page + 1)}>Next page</a>}
          </nav>
        </>}
  </>;
}

const curatedPrefix = "curated:";

export function AdultLibrary({ api, session, onRegister }: { api: Api; session: Session; onRegister?(): void }) {
  const query = new URLSearchParams(window.location.search);
  const category = query.get("videoCategory") ?? "";
  const page = query.get("videoPage") ?? "1";
  const [library, setLibrary] = useState<Library | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const eligible = session.userType !== "guest" && session.ageVerified;
  const token = session.sessionToken;

  useEffect(() => {
    if (!eligible) return;
    let active = true;
    setError("");
    void api.memberRequest<Library>(token, "/adult-library").then(data => {
      if (active) setLibrary({ ...data, savedVideos: data.savedVideos ?? [] });
    }, failure => {
      if (active) setError(errorText(failure));
    });
    return () => { active = false; };
  }, [api, eligible, retry, token]);

  async function updateFavorite(id: string) {
    if (busy || !library) return;
    const saved = !library.favorites.includes(id);
    if (saved && library.favorites.length >= 3) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const update = await api.memberRequest<SavedVideos>(token, "/adult-library/favorite", { id, saved }, "PUT");
      setLibrary(current => current && { ...current, ...update });
      setNotice(saved ? "Video saved to your profile." : "Video removed from your profile.");
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  const curated = category.startsWith(curatedPrefix);
  const selected = curated ? category : catalogCategories.some(entry => entry.slug === category) ? category : "";
  const curatedCategories = Object.entries(ADULT_VIDEO_CATEGORIES).filter(([id]) =>
    library?.videos.some(video => video.category === id) || category === curatedPrefix + id
  );

  return <section className="rd-card rd-adult-library" aria-labelledby="adult-library-title">
    <div className="rd-card-body">
      <h1 id="adult-library-title">Adult video directory · 18+</h1>
      {!eligible ? <>
        <p>Sign in with an age-verified Badehaus X account to browse and save videos.</p>
        <button type="button" className="rd-btn primary" onClick={onRegister}>Create an account</button>
      </> : <>
        <label className="rd-field">
          <span className="rd-label">Video category</span>
          <select className="rd-input" aria-label="Video category" value={selected} disabled={busy} onChange={event => {
            const next = event.target.value;
            window.location.assign(next ? `./?videoCategory=${encodeURIComponent(next)}&videoPage=1#/adult-library` : "./?app=1#/adult-library");
          }}>
            <option value="">Choose a category</option>
            {catalogCategories.map(entry => <option key={entry.slug} value={entry.slug}>{entry.name} ({entry.count})</option>)}
            {curatedCategories.length > 0 && <optgroup label="Curated videos">
              {curatedCategories.map(([id, name]) => <option key={id} value={curatedPrefix + id}>{name}</option>)}
            </optgroup>}
          </select>
        </label>
        <p><a className="rd-btn primary" href="./gay-porn/#video-categories">Adult video categories on the website</a></p>
        {error && <p className="rd-error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {!library ? error ? <button type="button" className="rd-btn" onClick={() => setRetry(value => value + 1)}>Retry</button> : <p role="status">Loading saved videos…</p> : <>
          <section aria-labelledby="saved-video-heading">
            <h2 id="saved-video-heading">Your profile favorites ({library.savedVideos.length}/3)</h2>
            <p>Signed-in, age-verified members can see these videos on your profile.</p>
            <ol className="rd-adult-saved-slots">
              {Array.from({ length: 3 }, (_, index) => {
                const video = library.savedVideos[index];
                return <li key={index}>{video ? <>
                  <a href={video.watchUrl} target="_blank" rel="noopener noreferrer">{video.title}</a>
                  <button type="button" className="rd-btn" disabled={busy} onClick={() => void updateFavorite(video.id)}
                    aria-label={`Remove ${video.title} from favorites`}>Remove</button>
                </> : <span className="rd-caption">No video saved</span>}</li>;
              })}
            </ol>
          </section>
          {selected && (curated ? <CuratedAdultLibrary api={api} session={session} library={library} busy={busy}
            updateFavorite={updateFavorite} category={selected.slice(curatedPrefix.length)} setLibrary={setLibrary} />
            : <BulkAdultPage key={`${selected}/${page}`} api={api} session={session} library={library} busy={busy}
              updateFavorite={updateFavorite} category={selected} page={page} />)}
        </>}
      </>}
    </div>
  </section>;
}
