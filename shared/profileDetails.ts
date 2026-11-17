/** Optional, self-reported profile information. Multi-select values use semicolons. */
export const PROFILE_DETAIL_FIELDS = [
  { key: "lookingFor", label: "Looking for", multiple: true, options: ["lets just fuck", "looking to suck", "suck me", "cuddle times", "friends", "networks", "relationship", "roommates"] },
  { key: "relationshipStatus", label: "Relationship Status", options: ["single", "committed", "open-relationship", "married"] },
  { key: "hivStatus", label: "HIV Status", options: ["negative", "positive", "undetectable"] },
  { key: "lastStiCheck", label: "Last STI Check", date: true },
  { key: "prep", label: "PrEP", options: ["yes", "no"] },
  { key: "kinks", label: "Kinks", multiple: true, options: ["Age Play", "Agoraphilia", "BDSM", "Blindfolds", "Bondage", "Breath Play", "Claustrophilia", "Cuckolding", "Humiliation", "Electrostimulation", "Gagging", "Hosiery", "Masochism", "Orgasm control", "Sadism", "Urophilia", "Wax Play", "Zentai"] },
  { key: "tribe", label: "Tribe", multiple: true, options: ["Twink", "Daddy", "Hunk", "Jock", "Otter", "Bear", "Cubs", "Chubs"] },
  { key: "bodyType", label: "Body Type", options: ["Thin", "Slender", "Toned", "Average", "Muscular", "Big"] }
] as const;
export type ProfileDetailKey = typeof PROFILE_DETAIL_FIELDS[number]["key"];
export type ProfileDetails = Readonly<Partial<Record<ProfileDetailKey, string>>>;

/** Reject invalid selections identically for backend and browser-local profiles. */
export function parseProfileDetails(input: Record<string, unknown>): ProfileDetails {
  const result: Partial<Record<ProfileDetailKey, string>> = {};
  for (const field of PROFILE_DETAIL_FIELDS) {
    const raw = input[field.key];
    if (raw === undefined || raw === "") continue;
    if (typeof raw !== "string") throw new Error(`${field.label} must be a string.`);
    const value = raw.trim();
    if (!value) continue;
    if ("date" in field) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01" || !Number.isFinite(Date.parse(value + "T00:00:00Z")) || new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value) {
        throw new Error("Last STI Check must be a valid date formatted YYYY-MM-DD.");
      }
      result[field.key] = value;
    } else {
      const values = "multiple" in field ? value.split(";").map(v => v.trim()) : [value];
      if (values.some(v => !(field.options as readonly string[]).includes(v))) throw new Error(`${field.label} contains an invalid selection.`);
      result[field.key] = [...new Set(values)].join("; ");
    }
  }
  return result;
}
