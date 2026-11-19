export const MAX_GROUP_OCCURRENCES = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

export type GroupFormat = "scheduled" | "open-house";

export function isGroupFormat(value: unknown): value is GroupFormat {
  return value === "scheduled" || value === "open-house";
}

export type GroupOccurrence = { startsAtMs: number; endsAtMs: number };

export function validGroupSchedule(value: unknown, firstEndAtMs: number | undefined, now: number): value is GroupOccurrence[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_GROUP_OCCURRENCES) return false;
  if (value[0]?.endsAtMs !== firstEndAtMs) return false;
  return value.every((item, index) => {
    if (!item || typeof item !== "object") return false;
    const { startsAtMs, endsAtMs } = item;
    if (!Number.isSafeInteger(startsAtMs) || !Number.isSafeInteger(endsAtMs) ||
        startsAtMs <= now || endsAtMs <= startsAtMs || !Number.isFinite(new Date(endsAtMs).getTime())) return false;
    if (index === 0) return true;
    const previous = value[index - 1];
    const gap = startsAtMs - previous.startsAtMs;
    return previous.endsAtMs <= startsAtMs && gap >= 6 * DAY_MS && gap <= 8 * DAY_MS;
  });
}
