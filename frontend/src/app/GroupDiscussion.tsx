import React, { useEffect, useState } from "react";
import { GROUP_MESSAGE_MAX_LENGTH, type GroupDiscussionMessage } from "../../../shared/groupDiscussion";
import { Sheet } from "./Sheet";
import type { apiClient, Session } from "./api";

type Props = {
  api: ReturnType<typeof apiClient>;
  session: Session;
  postingId: string;
  displayNameForUserId(userId: string): string;
};

export function GroupDiscussion({ api, session, postingId, displayNameForUserId }: Props): React.ReactElement {
  const [messages, setMessages] = useState<readonly GroupDiscussionMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [readError, setReadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [revision, setRevision] = useState(0);
  const [reporting, setReporting] = useState<GroupDiscussionMessage | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const route = `/public-postings/event/${encodeURIComponent(postingId)}/discussion`;

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function update(): Promise<void> {
      try {
        const result = await api.memberRequest<{ messages: GroupDiscussionMessage[] }>(session.sessionToken, route);
        if (!Array.isArray(result?.messages)) throw new Error("Unable to load the group discussion.");
        if (active) {
          setMessages(result.messages);
          setReadError("");
        }
      } catch (error) {
        if (active) {
          setMessages([]);
          setReadError((error as Error).message || "Unable to load the group discussion.");
        }
      } finally {
        if (active) {
          setLoading(false);
          timer = window.setTimeout(() => void update(), 3000);
        }
      }
    }
    void update();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, route, session.sessionToken, revision]);

  async function send(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const draft = text.trim();
    if (!draft || sending || loading || readError) return;
    setSending(true);
    setSendError("");
    try {
      await api.memberRequest(session.sessionToken, route, { text: draft });
      setText("");
      setRevision(value => value + 1);
    } catch (error) {
      setSendError((error as Error).message || "Unable to send your message.");
      setRevision(value => value + 1);
    } finally {
      setSending(false);
    }
  }

  async function sendReport(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!reporting || !reportReason.trim() || submittingReport) return;
    setSubmittingReport(true);
    setReportError("");
    try {
      await api.memberRequest(session.sessionToken, `${route}/${encodeURIComponent(reporting.messageId)}/report`, { reason: reportReason.trim() });
      setReporting(null);
      setReportSent(true);
    } catch (error) {
      setReportError((error as Error).message || "Unable to send the report.");
    } finally {
      setSubmittingReport(false);
    }
  }

  return (
    <section className="rd-group-discussion" aria-label="Group discussion">
      <h3>Group discussion</h3>
      {loading ? <p role="status">Loading discussion…</p> : null}
      {readError ? <p role="alert">{readError}</p> : null}
      {!loading && !readError && messages.length === 0 ? <p>No messages yet.</p> : null}
      {messages.length > 0 ? <ol aria-label="Discussion messages">
        {messages.map(message => (
          <li key={message.messageId}>
            <strong>{displayNameForUserId(message.authorUserId)}</strong>
            <time dateTime={new Date(message.createdAtMs).toISOString()}>
              {new Date(message.createdAtMs).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
            </time>
            <p>{message.text}</p>
            {message.authorUserId !== session.userId ? <button type="button" className="rd-btn"
              aria-label={`Report message from ${displayNameForUserId(message.authorUserId)}`}
              onClick={() => { setReporting(message); setReportReason(""); setReportError(""); setReportSent(false); }}>Report</button> : null}
          </li>
        ))}
      </ol> : null}
      <form onSubmit={event => void send(event)}>
        <label className="rd-field">
          <span>Message the group</span>
          <textarea className="rd-input" value={text} onChange={event => setText(event.target.value)}
            maxLength={GROUP_MESSAGE_MAX_LENGTH} disabled={sending || Boolean(readError)} />
        </label>
        <button className="rd-btn primary" disabled={sending || loading || !text.trim() || Boolean(readError)}>Send message</button>
        {sendError ? <p role="alert">{sendError}</p> : null}
      </form>
      {reportSent ? <p role="status">Report sent for review.</p> : null}
      {reporting ? <Sheet title="Report group message" onClose={() => { if (!submittingReport) setReporting(null); }}>
        <form className="rd-plan-form" onSubmit={event => void sendReport(event)}>
          <p>The safety team will receive the reported message and your reason.</p>
          <label className="rd-field"><span>Reason</span>
            <textarea className="rd-input" required maxLength={500} value={reportReason}
              onChange={event => setReportReason(event.target.value)} />
          </label>
          <button className="rd-btn primary" disabled={submittingReport || !reportReason.trim()}>Send report</button>
          {reportError ? <p role="alert">{reportError}</p> : null}
        </form>
      </Sheet> : null}
    </section>
  );
}
