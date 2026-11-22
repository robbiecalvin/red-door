import { backroomLaunch } from "../../../shared/backroomLaunch";

declare const __BACKROOM_EDITORIAL__: { slug: string; title: string; synopsis: string; alt: string }[];
const editorialArticles = typeof __BACKROOM_EDITORIAL__ === "undefined" ? [] : __BACKROOM_EDITORIAL__;
import React, { useEffect, useState } from "react";
import type { Article } from "../../../shared/backroom";
import type { apiClient, Session } from "./api";

type Props = { api: ReturnType<typeof apiClient>; session: Session | null };
type Editor = { admin: boolean; articles: Article[] };
const empty = { slug: "", title: "", synopsis: "", body: "", byline: "" };
const fields = [
  ["slug", "URL slug", 80], ["title", "Title", 120], ["synopsis", "Synopsis", 300],
  ["byline", "Public byline (optional)", 80], ["body", "Article", 20000]
] as const;

export function Backroom({ api, session }: Props) {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState(empty);
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [slug, setSlug] = useState(() => window.location.hash.slice(1));
  const token = session?.sessionToken;
  function reload() {
    return Promise.all([
      api.memberRequest<Article[]>("", "/backroom/articles").then(setArticles),
      token && session?.userId && session.ageVerified
        ? api.memberRequest<Editor>(token, "/backroom/editor").then(setEditor, () => setEditor(null))
        : Promise.resolve(setEditor(null))
    ]);
  }
  useEffect(() => { void reload().catch(() => setNotice("Couldn’t load The Backroom.")); }, [api, token, session?.ageVerified]);
  useEffect(() => {
    const sync = () => setSlug(window.location.hash.slice(1));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const article = articles?.find(item => item.slug === slug);
  useEffect(() => {
    document.title = article ? `${article.title} · The Backroom` : "The Backroom · Badehaus X";
  }, [article]);

  async function submit(route: string, data: object, method?: string) {
    if (!token) return;
    setWorking(true);
    setNotice("");
    try {
      await api.memberRequest(token, route, data, method);
      await reload();
      setNotice("Article updated.");
    } catch (error) {
      setNotice((error as { message?: string }).message ?? "Couldn’t update the article.");
    } finally {
      setWorking(false);
    }
  }
  return <div className="site-page rd-backroom">
    <header className="site-header"><div className="site-header-inner">
      <a className="site-brand" href="../"><img src="../icons/icon-192.png" width={36} height={36} alt="" />Badehaus X</a>
      <nav aria-label="Site navigation"><a href="./" aria-current="page">The Backroom</a><a href="../store/">Shop</a></nav>
    </div></header>
    <main className="rd-backroom-content">
    {!article ? <><h1>The Backroom</h1><section className="rd-backroom-grid" aria-label="Launch articles">
      {[...editorialArticles.slice().reverse(), ...backroomLaunch].map(entry => <article className="rd-backroom-card" key={entry.slug}>
        <a href={`./${entry.slug}/`}>
          <img width={"alt" in entry ? 382 : 1200} height={"alt" in entry ? 510 : 600} loading="lazy" src={`./covers/${entry.slug}.${"alt" in entry ? "jpg" : "png"}`} alt={"alt" in entry ? entry.alt : ""} />
          <div className="rd-backroom-card-copy"><h2>{entry.title}</h2><p>{entry.synopsis}</p></div>
        </a>
      </article>)}
    </section></> : null}
    {article ? <article className="rd-card rd-settings-body rd-backroom-reading">
      <a href="#">All articles</a>
      <h1>{article.title}</h1>
      <p>{article.byline} · {new Date(article.publishedAtMs!).toLocaleDateString("en-CA", { timeZone: "America/Vancouver" })}</p>
      <p>{article.synopsis}</p>
      <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{article.body}</div>
    </article> : articles?.length ? articles.map(item => <article className="rd-card rd-settings-body" key={item.slug}>
      <h2><a href={`#${item.slug}`}>{item.title}</a></h2><p>{item.synopsis}</p>
    </article>) : null}
    {editor ? <section className="rd-card rd-settings-body">
      <h2>{editor.admin ? "Editorial desk" : "Contribute an article"}</h2>
      {editor.articles.map(item => <details key={item.slug}>
        <summary>{item.title} · {item.status}</summary>
        <p>{item.synopsis}</p><p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
        {item.status === "draft" || item.status === "rejected" ? <button type="button" className="rd-btn" onClick={() => setDraft(item)}>Load draft</button> : null}
        {editor.admin && item.status === "pending" ? <div className="rd-row">
          <button type="button" className="rd-btn" disabled={working} onClick={() => void submit(`/backroom/review/${item.slug}`, { action: "publish" })}>Approve and publish</button>
          <button type="button" className="rd-btn" disabled={working} onClick={() => void submit(`/backroom/review/${item.slug}`, { action: "reject" })}>Reject</button>
        </div> : null}
      </details>)}
      <form onSubmit={event => {
        event.preventDefault();
        const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "draft";
        void submit(`/backroom/editor/${encodeURIComponent(draft.slug)}`, { ...draft, action }, "PUT");
      }}>
        {fields.map(([name, label, limit]) => <label className="rd-field" key={name}>
          <span>{label}</span>
          {name === "body" ? <textarea className="rd-input" required rows={10} maxLength={limit} value={draft[name]} onChange={event => setDraft({ ...draft, [name]: event.target.value })} />
            : <input className="rd-input" required={name !== "byline"} pattern={name === "slug" ? "[a-z0-9]+(?:-[a-z0-9]+)*" : undefined} maxLength={limit} value={draft[name]} onChange={event => setDraft({ ...draft, [name]: event.target.value })} />}
        </label>)}
        <button type="submit" className="rd-btn" disabled={working} value="draft">Save draft</button>
        <button type="submit" className="rd-btn" disabled={working} value="submit">{editor.admin ? "Publish" : "Submit for review"}</button>
      </form>
    </section> : null}
    {notice ? <p role="status">{notice}</p> : null}
    </main>
  </div>;
}
