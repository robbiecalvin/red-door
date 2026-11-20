import React, { useState } from "react";
import type { Session } from "./api";
import { apiClient } from "./api";

type Props = { api: ReturnType<typeof apiClient>; session: Session };
type ImportRow = { row: number; status: "ready" | "imported" | "skipped" | "updated" | "error"; message?: string };

export function CustomerImport({ api, session }: Props): React.ReactElement {
  const [file, setFile] = useState<File>();
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const [autoReplies, setAutoReplies] = useState(false);
  const [error, setError] = useState("");

  async function run(action: "preview" | "apply" | "photos") {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 300_000) throw new Error("Choose a CSV under 300 KB.");
      const content = action === "apply" ? csv : await file.text();
      const result = await api.memberRequest<{ results: ImportRow[] }>(
        session.sessionToken, `/admin/customer-import/${action}`, { csv: content, autoReplies },
      );
      setCsv(content);
      setRows(result.results);
      setPreviewed(action === "preview");
    } catch (cause) {
      setError((cause as { message?: string }).message ?? "Unable to complete the import request.");
    } finally {
      setBusy(false);
    }
  }

  const count = (status: ImportRow["status"]) => rows.filter(row => row.status === status).length;
  return <details className="rd-card rd-settings-body">
    <summary>Import customers from CSV</summary>
    <p>Preview the file before creating accounts. Existing accounts are skipped. Customers can set a password through email recovery when they want to sign in.</p>
    <label className="rd-field">
      <span>Customer CSV</span>
      <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => {
        setFile(event.target.files?.[0]); setCsv(""); setRows([]); setPreviewed(false); setError("");
      }} />
    </label>
    <button type="button" className="rd-btn" disabled={!file || busy} onClick={() => void run("preview")}>Preview import</button>
    <button type="button" className="rd-btn" disabled={!file || busy} onClick={() => void run("photos")}>Update automatic reply photo links</button>
    <p className="rd-muted">For photo links, upload a CSV with email and auto_reply_photo_url columns.</p>
    {error && <p role="alert">{error}</p>}
    {rows.length > 0 && <div>
      <p role="status">{count("ready")} ready · {count("imported")} imported · {count("skipped")} skipped · {count("updated")} photo links updated · {count("error")} need attention</p>
      <ul>{rows.filter(row => row.message).map(row => <li key={row.row}>Row {row.row}. {row.message}</li>)}</ul>
    </div>}
    {previewed && count("ready") > 0 && <>
      <label className="rd-row">
        <input type="checkbox" checked={autoReplies} disabled={busy} onChange={event => setAutoReplies(event.target.checked)} />
        Enable automatic replies for these customers immediately after import
      </label>
      <button type="button" className="rd-btn primary" disabled={busy} onClick={() => void run("apply")}>Import {count("ready")} customers</button>
    </>}
  </details>;
}
