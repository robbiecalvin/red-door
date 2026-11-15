import React, { useEffect, useState } from "react";
import { apiClient, type Session } from "./api";
export function PrivacySettings({ api, session }: { api: ReturnType<typeof apiClient>; session: Session }): React.ReactElement | null {
  const [consent, setConsent] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => { if (session.userId) void api.getPrivacy(session.sessionToken).then(r => setConsent(r.analyticsConsent)).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [api, session.sessionToken]);
  if (!session.userId) return null;
  async function change(value: boolean) { const previous = consent; setConsent(value); setLoading(true); setError(""); try { const r = await api.setPrivacy(session.sessionToken, value); setConsent(r.analyticsConsent); } catch(e) { setConsent(previous); setError((e as Error).message); } finally { setLoading(false); } }
  return <section className="rd-card"><div className="rd-card-body"><h2 style={{ fontSize: 18 }}>Help improve Red Door</h2><label className="rd-row"><input type="checkbox" checked={consent} disabled={loading} onChange={e => void change(e.target.checked)} />Share optional usage statistics</label><p className="rd-plus-small">We measure profile completion, conversations, and return visits using a protected account identifier. Daily activity is kept for 35 days; inactive measurement records are deleted after 35 days. We never include message content, photos, or location. Turning this off deletes your individual measurement record; anonymous totals remain.</p>{error ? <p role="alert" className="rd-error">{error}</p> : null}</div></section>;
}
