import React, { useEffect, useRef, useState } from "react";
import type { Session, apiClient } from "./api";

type Api = ReturnType<typeof apiClient>;
type Folder = "inbox" | "sent" | "requests" | "archive" | "drafts";
type Row = { id: string; subject: string; peerId: string; peerName: string; status: "pending" | "accepted"; incoming: boolean; unread: boolean; archived: boolean; updatedAt: number };
type Message = { id: string; sender: string; body: string; at: number };
type Detail = { thread: Row; messages: Message[]; next: number | null };
type Draft = { id: string; recipient: string; subject: string; body: string; revision: number };
const folders: [Folder, string][] = [["inbox", "Inbox"], ["sent", "Sent"], ["requests", "Requests"], ["drafts", "Drafts"], ["archive", "Archive"]];
const freshDraft = (recipient = ""): Draft => ({ id: crypto.randomUUID(), recipient, subject: "", body: "", revision: 0 });
const messageFor = (error: unknown) => error && typeof error === "object" && "message" in error && typeof error.message === "string"
  ? error.message : "Couldn’t update your private inbox.";

export function PrivateInbox({ api, session }: { api: Api; session: Session }) {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [contacts, setContacts] = useState<{ userId: string; displayName: string }[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => {
    const recipient = window.location.hash.split("/")[2];
    return recipient ? freshDraft(recipient) : null;
  });
  const [reply, setReply] = useState("");
  const replyId = useRef("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [incoming, setIncoming] = useState<"requests" | "connections" | "nobody" | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const token = session.sessionToken;
  const eligible = session.userType !== "guest" && session.ageVerified;

  useEffect(() => {
    if (!eligible) return;
    let active = true;
    setListLoading(true);
    const request = folder === "drafts"
      ? api.memberRequest<{ drafts: Draft[] }>(token, "/private-inbox/drafts").then(data => {
        if (active) setDrafts(data.drafts);
      })
      : api.memberRequest<{ threads: Row[]; next: number | null }>(token, `/private-inbox/threads?folder=${folder}`).then(data => {
        if (!active) return;
        setRows(data.threads);
        setNext(data.next);
      });
    void request.catch(failure => { if (active) setError(messageFor(failure)); }).finally(() => {
      if (active) setListLoading(false);
    });
    return () => { active = false; };
  }, [api, eligible, folder, refresh, token]);

  useEffect(() => {
    if (!eligible) return;
    let active = true;
    void api.memberRequest<{ incoming: "requests" | "connections" | "nobody" }>(token, "/private-inbox/preferences").then(data => {
      if (active) setIncoming(data.incoming);
    }, () => {});
    return () => { active = false; };
  }, [api, eligible, token]);

  const composing = draft !== null;
  useEffect(() => {
    if (!eligible || !composing) return;
    let active = true;
    void api.getPublicProfiles().then(data => {
      if (active) setContacts(data.profiles.filter(profile => profile.userId !== session.userId));
    }, () => {});
    return () => { active = false; };
  }, [api, composing, eligible, session.userId]);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try { await work(); }
    catch (failure) { setError(messageFor(failure)); }
    finally { setBusy(false); }
  }

  async function open(id: string) {
    const data = await api.memberRequest<Detail>(token, `/private-inbox/threads/${id}`);
    await api.memberRequest(token, `/private-inbox/threads/${id}`, { action: "read", through: data.messages[data.messages.length - 1]?.at ?? 0 }, "PATCH");
    setDetail(data);
    setDraft(null);
    setReply("");
    replyId.current = "";
    setReportId(null);
    setRows(current => current.map(row => row.id === id ? { ...row, unread: false } : row));
  }

  function changeFolder(value: Folder) {
    setFolder(value);
    setRows([]);
    setNext(null);
    setDraft(null);
    setDetail(null);
    setError("");
    setNotice("");
  }

  if (!eligible) return <section className="rd-card rd-adult-library"><div className="rd-card-body">
    <h1>Private inbox</h1><p>Sign in with an age-verified Badehaus X account to send or read private messages.</p>
  </div></section>;

  return <section className="rd-card rd-private-inbox" aria-labelledby="private-inbox-heading">
    <div className="rd-card-body">
      <h1 id="private-inbox-heading">Private inbox</h1>
      <div className="rd-row">
        <button type="button" className="rd-btn primary" disabled={busy} onClick={() => { setDraft(freshDraft()); setDetail(null); setError(""); }}>Compose</button>
        <button type="button" className="rd-btn" disabled={busy || listLoading} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
        <a className="rd-btn" href="#/threads">Instant Chat</a>
      </div>
      {error && <p role="alert" className="rd-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {draft ? <form onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          const result = await api.memberRequest<{ id: string }>(token, "/private-inbox/threads", { ...draft, requestId: draft.id });
          setDraft(null);
          setFolder("sent");
          setRefresh(value => value + 1);
          setNotice("Private message sent.");
          await open(result.id);
        });
      }}>
        <h2>New private message</h2>
        <label className="rd-field">To
          <select className="rd-input" aria-label="To" value={draft.recipient} required onChange={event => setDraft({ ...draft, recipient: event.target.value })}>
            <option value="">Choose a member</option>
            {draft.recipient && !contacts.some(contact => contact.userId === draft.recipient) && <option value={draft.recipient}>Selected member</option>}
            {contacts.map(contact => <option key={contact.userId} value={contact.userId}>{contact.displayName}</option>)}
          </select>
        </label>
        <label className="rd-field">Subject<input className="rd-input" required maxLength={120} value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value })} /></label>
        <label className="rd-field">Message<textarea className="rd-input" aria-label="Message" required rows={6} maxLength={3000} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} /></label>
        <div className="rd-row">
          <button type="submit" className="rd-btn primary" disabled={busy}>Send private message</button>
          <button type="button" className="rd-btn" disabled={busy} onClick={() => void run(async () => {
            const data = await api.memberRequest<{ draft: Draft }>(token, `/private-inbox/drafts/${draft.id}`, draft, "PUT");
            setDraft(data.draft); setNotice("Draft saved.");
          })}>Save draft</button>
          <button type="button" className="rd-btn" disabled={busy} onClick={() => setDraft(null)}>Back</button>
        </div>
      </form> : detail ? <div>
        <button type="button" className="rd-btn" disabled={busy} onClick={() => { setDetail(null); setReportId(null); }}>Back to folders</button>
        <h2>{detail.thread.subject}</h2>
        <p>{detail.thread.peerName}</p>
        {detail.next !== null && <button type="button" className="rd-btn" disabled={busy} onClick={() => void run(async () => {
          const older = await api.memberRequest<Detail>(token, `/private-inbox/threads/${detail.thread.id}?offset=${detail.next}`);
          setDetail({ ...detail, messages: [...older.messages, ...detail.messages], next: older.next });
        })}>Load older messages</button>}
        <ol className="rd-private-inbox-messages">
          {detail.messages.map(message => <li key={message.id}>
            <strong>{message.sender === session.userId ? "You" : detail.thread.peerName}</strong>
            <small>{new Date(message.at).toLocaleString()}</small>
            <p>{message.body}</p>
            {message.sender !== session.userId && <button type="button" className="rd-btn" onClick={() => { setReportId(message.id); setReason(""); }}>Report message</button>}
          </li>)}
        </ol>
        {reportId && <form onSubmit={event => {
          event.preventDefault();
          void run(async () => {
            await api.memberRequest(token, `/private-inbox/threads/${detail.thread.id}/report`, { messageId: reportId, reason });
            setReportId(null); setNotice("Report submitted.");
          });
        }}>
          <label className="rd-field">Reason for report<textarea className="rd-input" required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <button type="submit" className="rd-btn primary" disabled={busy}>Submit report</button>
        </form>}
        {detail.thread.status === "accepted" ? <form onSubmit={event => {
          event.preventDefault();
          void run(async () => {
            replyId.current ||= crypto.randomUUID();
            const data = await api.memberRequest<{ message: Message }>(token, `/private-inbox/threads/${detail.thread.id}/messages`, { body: reply, requestId: replyId.current });
            setDetail({ ...detail, messages: [...detail.messages, data.message] });
            setReply(""); replyId.current = "";
            setRefresh(value => value + 1);
          });
        }}>
          <label className="rd-field">Reply<textarea className="rd-input" required maxLength={3000} rows={4} value={reply} onChange={event => setReply(event.target.value)} /></label>
          <button type="submit" className="rd-btn primary" disabled={busy}>Send reply</button>
        </form> : <p>{detail.thread.incoming ? "Accept this request to reply." : "Waiting for the recipient to accept."}</p>}
        <div className="rd-row">
          {(detail.thread.status === "pending" ? detail.thread.incoming ? [["accept", "Accept"], ["decline", "Decline"]] : [["withdraw", "Withdraw request"]]
            : [[detail.thread.archived ? "unarchive" : "archive", detail.thread.archived ? "Unarchive" : "Archive"], ["hide", "Delete from my inbox"]]).map(([action, label]) =>
            <button className="rd-btn" type="button" key={action} disabled={busy} onClick={() => {
              if (action === "hide" && !window.confirm("Delete from your inbox? The other member can still see delivered messages.")) return;
              void run(async () => {
                await api.memberRequest(token, `/private-inbox/threads/${detail.thread.id}`, { action }, "PATCH");
                setRefresh(value => value + 1);
                if (action === "accept") await open(detail.thread.id); else setDetail(null);
              });
            }}>{label}</button>)}
          <button type="button" className="rd-btn" disabled={busy} onClick={() => {
            if (!window.confirm("Block this member?")) return;
            void run(async () => { await api.block(token, `user:${detail.thread.peerId}`); setDetail(null); setRefresh(value => value + 1); });
          }}>Block member</button>
        </div>
      </div> : <>
        <nav className="rd-row" aria-label="Private inbox folders">
          {folders.map(([id, label]) => <button type="button" className={`rd-btn${folder === id ? " primary" : ""}`} key={id} disabled={busy} aria-pressed={folder === id} onClick={() => changeFolder(id)}>{label}</button>)}
        </nav>
        {incoming !== null && <label className="rd-field">New private conversations
          <select className="rd-input" value={incoming} disabled={busy} onChange={event => {
            const value = event.target.value;
            if (value !== "requests" && value !== "connections" && value !== "nobody") return;
            void run(async () => {
              await api.memberRequest(token, "/private-inbox/preferences", { incoming: value }, "PUT");
              setIncoming(value);
              setNotice("Inbox preference saved.");
            });
          }}>
            <option value="requests">Send new members to Requests</option>
            <option value="connections">Existing inbox connections only</option>
            <option value="nobody">Nobody</option>
          </select>
        </label>}
        {listLoading ? <p role="status">Loading…</p> : folder === "drafts" ? (
          drafts.length ? <ul>{drafts.map(item => <li key={item.id}>
            <button type="button" className="rd-btn" onClick={() => setDraft(item)}>{item.subject || "Untitled draft"}</button>
            <button type="button" className="rd-btn" disabled={busy} onClick={() => {
              if (!window.confirm("Discard this draft?")) return;
              void run(async () => {
                await api.memberRequest(token, `/private-inbox/drafts/${item.id}`, undefined, "DELETE");
                setDrafts(drafts.filter(entry => entry.id !== item.id));
              });
            }}>Discard draft</button>
          </li>)}</ul> : <p>No saved drafts.</p>
        ) : rows.length ? <ul className="rd-private-inbox-list">
          {rows.map(row => <li key={row.id}><button className="rd-btn" type="button" disabled={busy} onClick={() => void run(() => open(row.id))}>
            <strong>{row.subject}</strong> · {row.peerName}{row.unread ? " · Unread" : ""}
          </button></li>)}
        </ul> : <p>No conversations in this folder.</p>}
        {folder !== "drafts" && next !== null && !listLoading && <button type="button" className="rd-btn" disabled={busy} onClick={() => void run(async () => {
          const data = await api.memberRequest<{ threads: Row[]; next: number | null }>(token, `/private-inbox/threads?folder=${folder}&offset=${next}`);
          setRows(current => [...current, ...data.threads.filter(row => !current.some(item => item.id === row.id))]);
          setNext(data.next);
        })}>Load more conversations</button>}
      </>}
    </div>
  </section>;
}
