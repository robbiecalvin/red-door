import React from "react";
import { PROFILE_DETAIL_FIELDS, type ProfileDetails } from "../../../shared/profileDetails";

export function ProfileDetailsEditor({ value, onChange }: { value: ProfileDetails; onChange: (value: ProfileDetails) => void }) {
  return <section style={{ display: "grid", gap: 12 }}>
    <h3>More about you</h3>
    <p className="rd-caption">All fields are optional and self-reported. Only share what you want others to see on your profile. Health information is not verified.</p>
    {PROFILE_DETAIL_FIELDS.map(field => {
      const current = value[field.key] ?? "";
      const update = (next: string) => onChange({ ...value, [field.key]: next });
      if ("multiple" in field) {
        const selected = current ? current.split("; ") : [];
        return <fieldset key={field.key}><legend>{field.label} (optional; select any)</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{field.options.map(option => <label key={option} style={{ display: "flex", gap: 6 }}><input type="checkbox" checked={selected.includes(option)} onChange={e => update((e.target.checked ? [...selected, option] : selected.filter(v => v !== option)).join("; "))} />{option}</label>)}</div>
          <p className="rd-caption">{current || "No selections"}</p>
        </fieldset>;
      }
      return <label className="rd-field" key={field.key}><span>{field.label} (optional)</span>{"date" in field
        ? <input className="rd-input" type="date" value={current} onChange={e => update(e.target.value)} />
        : <select className="rd-input" value={current} onChange={e => update(e.target.value)}><option value="">Leave blank</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select>}</label>;
    })}
  </section>;
}

export function ProfileDetailsView({ stats }: { stats?: ProfileDetails }) {
  const answered = PROFILE_DETAIL_FIELDS.filter(field => stats?.[field.key]);
  if (!answered.length) return null;
  return <div style={{ marginTop: 10 }}><div className="rd-caption">Optional · Self-reported</div>{answered.map(field => <div key={field.key}>{field.label}: {stats![field.key]}</div>)}</div>;
}
