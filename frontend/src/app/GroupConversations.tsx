import { EXPLOITATION_REPORT_REASON, UNDERAGE_REPORT_REASON } from "../../../shared/childSafety";
import { googlePlayEdition } from "./edition";
import React, { useEffect, useState } from "react";
import type { apiClient, Session } from "./api";
import { Sheet } from "./Sheet";

type Group = { id: string; members: string[]; accepted: string[]; creatorId: string; unread: number };
type Message = { id: string; authorId: string; text: string; createdAtMs: number };
const route = "/group-conversations";

export function GroupConversations({ api, session, peerId, candidates, onClose }: {
  api: ReturnType<typeof apiClient>;
  session: Session;
  peerId?: string;
  candidates: { id: string; label: string }[];
  onClose(): void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [invitee, setInvitee] = useState("");
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState("");
  const [reason, setReason] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const group = groups.find(item => item.id === selected);
  const groupRoute = `${route}/${encodeURIComponent(selected)}`;
  const activeGroup = Boolean(group && group.accepted.length === group.members.length);
  const label = (id: string) => id === session.userId ? "You" : candidates.find(row => row.id === id)?.label ?? "Member";

  useEffect(() => {
    let live = true;
    let timer: number | undefined;
    let readThrough = 0;
    async function refresh() {
      try {
        const { groups: rows } = await api.memberRequest<{ groups: Group[] }>(session.sessionToken, route);
        if (!live) return;
        setGroups(rows);
        const current = rows.find(item => item.id === selected);
        if (!current || current.accepted.length !== current.members.length) {
          setMessages([]);
          return;
        }
        const { messages } = await api.memberRequest<{ messages: Message[] }>(session.sessionToken, `${groupRoute}/messages`);
        if (!live) return;
        setMessages(messages);
        const through = messages[messages.length - 1]?.createdAtMs ?? 0;
        if (through > readThrough && !document.hidden) {
          await api.memberRequest(session.sessionToken, `${groupRoute}/read`, { through });
          readThrough = through;
        }
      } catch (error) {
        if (live) {
          setMessages([]);
          setError((error as Error).message || "Unable to load group conversations.");
        }
      } finally {
        if (live) timer = window.setTimeout(() => void refresh(), 3000);
      }
    }
    void refresh();
    return () => { live = false; window.clearTimeout(timer); };
  }, [api, groupRoute, revision, selected, session.sessionToken]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (error) { setError((error as Error).message || "Unable to update the conversation."); }
    finally { setBusy(false); setRevision(value => value + 1); }
  }

  return <Sheet title="Group conversations" onClose={onClose}>
    <div className="rd-group-discussion">
      {peerId ? <form onSubmit={event => {
        event.preventDefault();
        if (!invitee) return;
        void run(async () => {
          const result = await api.memberRequest<{ id: string }>(session.sessionToken, route, { peerId, inviteeId: invitee });
          setSelected(result.id);
          setInvitee("");
        });
      }}>
        <p>Both members need to accept. The new group starts with an empty conversation.</p>
        <label className="rd-field"><span>Additional member</span>
          <select className="rd-input" value={invitee} onChange={event => setInvitee(event.target.value)}>
            <option value="">Choose a member</option>
            {candidates.filter(row => row.id !== peerId).map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </label>
        <button className="rd-btn primary" disabled={!invitee || busy}>Invite both members</button>
      </form> : null}

      {groups.length ? <div className="rd-row" aria-label="Conversations">{groups.map(row =>
        <button type="button" className="rd-btn" key={row.id} aria-pressed={row.id === selected} onClick={() => {
          setMessages([]); setDraft(""); setError(""); setReporting(""); setReportSent(false); setSelected(row.id);
        }}>
          {row.members.map(label).join(", ")}{row.unread ? ` · ${row.unread} unread` : ""}
          {row.accepted.length < row.members.length ? " · Invitation" : ""}
        </button>)}</div> : <p>No group conversations yet.</p>}

      {group && !activeGroup ? <>
        <p>{group.accepted.length} of {group.members.length} accepted.</p>
        <div className="rd-row">
          {!group.accepted.includes(session.userId ?? "") ? <button className="rd-btn primary" disabled={busy}
            onClick={() => void run(async () => { await api.memberRequest(session.sessionToken, `${groupRoute}/respond`, { accept: true }); })}>Accept invitation</button> : null}
          <button className="rd-btn" disabled={busy} onClick={() => void run(async () => {
            await api.memberRequest(session.sessionToken, `${groupRoute}/respond`, { accept: false }); setSelected("");
          })}>{group.creatorId === session.userId ? "Cancel invitations" : "Decline invitation"}</button>
        </div>
      </> : null}
      {activeGroup ? <>
        {messages.length ? <ol aria-label="Group messages">{messages.map(message => <li key={message.id}>
          <strong>{label(message.authorId)}</strong><p>{message.text}</p>
          {message.authorId !== session.userId ? <button type="button" className="rd-btn" aria-label={`Report message from ${label(message.authorId)}`}
            onClick={() => { setReporting(message.id); setReason(""); setReportSent(false); }}>Report</button> : null}
        </li>)}</ol> : <p>No messages yet.</p>}
        {reporting ? <form onSubmit={event => {
          event.preventDefault();
          if (!reason.trim()) return;
          void run(async () => {
            await api.memberRequest(session.sessionToken, `${groupRoute}/messages/${encodeURIComponent(reporting)}/report`, { reason });
            setReporting(""); setReportSent(true);
          });
        }}>
          {googlePlayEdition && <div className="rd-row">
            {[UNDERAGE_REPORT_REASON, EXPLOITATION_REPORT_REASON].map(option => <button key={option}
              className="rd-btn" type="button" onClick={() => setReason(option)}>{option}</button>)}
          </div>}
          <label className="rd-field"><span>Report reason</span>
            <textarea className="rd-input" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
          </label>
          <div className="rd-row">
            <button className="rd-btn primary" disabled={!reason.trim() || busy}>Send report</button>
            <button type="button" className="rd-btn" onClick={() => setReporting("")}>Cancel report</button>
          </div>
        </form> : null}
        {reportSent ? <p role="status">Report sent for review.</p> : null}
        <form onSubmit={event => {
          event.preventDefault();
          if (!draft.trim()) return;
          void run(async () => { await api.memberRequest(session.sessionToken, `${groupRoute}/messages`, { text: draft }); setDraft(""); });
        }}>
          <label className="rd-field"><span>Message the group</span>
            <textarea className="rd-input" maxLength={1000} value={draft} onChange={event => setDraft(event.target.value)} />
          </label>
          <button className="rd-btn primary" disabled={!draft.trim() || busy}>Send message</button>
        </form>
      </> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </Sheet>;
}
