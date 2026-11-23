export const UNDERAGE_REPORT_REASON = "Underage concern";
export const EXPLOITATION_REPORT_REASON = "Suspected child sexual abuse or exploitation";

export function childSafetyPriority(reason: unknown): "underage" | "exploitation" | undefined {
  if (typeof reason !== "string") return undefined;
  const normalized = reason.trim().toLowerCase();
  if (normalized === UNDERAGE_REPORT_REASON.toLowerCase()) return "underage";
  if (normalized === EXPLOITATION_REPORT_REASON.toLowerCase()) return "exploitation";
  return undefined;
}
