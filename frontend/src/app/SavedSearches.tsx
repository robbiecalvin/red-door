import React, { useEffect, useState } from "react";
import { type Session, apiClient } from "./api";
import { hasPlus, type SavedSearch } from "../../../shared/plus";
import { openPlus } from "./PlusPanel";
export function SavedSearches({ api, session, filters, onApply }: { api: ReturnType<typeof apiClient>; session: Session; filters: SavedSearch["filters"]; onApply(filters: SavedSearch["filters"]): void }): React.ReactElement {
  const [searches, setSearches] = useState<SavedSearch[]>([]), [name, setName] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { if (hasPlus(session)) void api.getPlus(session.sessionToken).then(s => setSearches(s.savedSearches)).catch(e => setError(e.message)); }, [api, session.sessionToken, session.tier]);
  async function save(next: SavedSearch[]) { setBusy(true); setError(""); try { await api.savePlusPreferences(session.sessionToken, { savedSearches: next }); setSearches(next); setName(""); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  if (!hasPlus(session)) return <div className="rd-plus-gate">Unlock advanced filters and saved searches with Plus.<button className="rd-btn" onClick={openPlus}>Explore Plus</button></div>;
  return <div style={{ display: "grid", gap: 8 }}><label className="rd-field"><span className="rd-label">Save this search (up to 10)</span><input className="rd-input" aria-label="Saved search name" maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Give this search a name" /></label><button className="rd-btn" disabled={!name.trim() || searches.length >= 10 || busy} onClick={() => void save([...searches, { name: name.trim(), filters }])}>Save search</button>{searches.map((s,i) => <div className="rd-row" key={i}><button className="rd-btn" onClick={() => onApply(s.filters)}>Apply {s.name}</button><button className="rd-btn" disabled={busy} aria-label={`Delete ${s.name}`} onClick={() => void save(searches.filter((_,n) => n !== i))}>Delete</button></div>)}{error ? <p role="alert">{error}</p> : null}</div>;
}
