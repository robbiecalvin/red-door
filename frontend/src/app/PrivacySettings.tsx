import React, { useEffect, useState } from "react";
import { apiClient, type Session } from "./api";
export function PrivacySettings({ api, session }: { api: ReturnType<typeof apiClient>; session: Session }): React.ReactElement | null {
  const [autoReplies, setAutoReplies] = useState(false);
  useEffect(() => {
    if (!session.userId) return;
    let active = true;
    void api.memberRequest<{ enabled: boolean }>(session.sessionToken, "/members/automatic-replies")
      .then(result => { if (active) setAutoReplies(result.enabled); }).catch(() => {});
    return () => { active = false; };
  }, [api, session.sessionToken, session.userId]);
  const [consent, setConsent] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => { if (session.userId) void api.getPrivacy(session.sessionToken).then(r => setConsent(r.analyticsConsent)).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [api, session.sessionToken]);
  if (!session.userId) return <section className="rd-card rd-settings-body"><h2>Your guest identity</h2><p className="rd-muted">Your screen name is always Anon. Each guest session keeps its own conversations and identity.</p><p className="rd-muted">Badehaus X asks for your browser’s location permission before sharing your location on the map. You can revoke that permission in your browser’s site settings.</p><p className="rd-caption">Optional account usage statistics are available to registered members.</p></section>;
  async function change(value: boolean) { const previous = consent; setConsent(value); setLoading(true); setError(""); try { const r = await api.setPrivacy(session.sessionToken, value); setConsent(r.analyticsConsent); } catch(e) { setConsent(previous); setError((e as Error).message); } finally { setLoading(false); } }
  return <section className="rd-card"><div className="rd-card-body"><h2 style={{ fontSize: 18 }}>Help improve Badehaus X</h2><label className="rd-row"><input type="checkbox" checked={consent} disabled={loading} onChange={e => void change(e.target.checked)} />Share optional usage statistics</label><p className="rd-plus-small">We measure profile completion, conversations, and return visits using a protected account identifier. Daily activity is kept for 35 days; inactive measurement records are deleted after 35 days. We never include message content, photos, or location. Turning this off deletes your individual measurement record; anonymous totals remain.</p>{autoReplies && <button className="rd-btn" type="button" onClick={() => {
    void api.memberRequest(session.sessionToken, "/members/automatic-replies", undefined, "DELETE")
      .then(() => setAutoReplies(false)).catch(() => setError("Could not turn off automatic replies. Please retry."));
  }}>Turn off automatic replies</button>}{error ? <p role="alert" className="rd-error">{error}</p> : null}</div></section>;
}
