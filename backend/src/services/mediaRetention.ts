export const MEDIA_RETENTION = {
  pendingDays: 30,
  unusedDays: 90,
  declinedDays: 30,
  incompleteDays: 1
} as const;

export type RetainedMedia = {
  status: "uploading" | "pending" | "approved" | "rejected" | "removed" | "expired";
  submittedAt: number;
  decidedAt?: number;
  lastUsedAt?: number;
  hold?: { reason: string; at: number; reviewerId?: string };
  holdReleasedAt?: number;
  purgeStartedAt?: number;
  purgedAt?: number;
};

export function isMediaDue(row: RetainedMedia, now: number, referenced: boolean, lastReportAt?: number): boolean {
  if (row.purgedAt !== undefined || row.hold ||
      (lastReportAt !== undefined && lastReportAt > (row.holdReleasedAt ?? -1))) return false;
  if (row.purgeStartedAt !== undefined) return true;
  const days = row.status === "uploading" ? MEDIA_RETENTION.incompleteDays :
    row.status === "pending" ? MEDIA_RETENTION.pendingDays :
    row.status === "approved" ? MEDIA_RETENTION.unusedDays : MEDIA_RETENTION.declinedDays;
  if (row.status === "approved" && referenced) return false;
  return now - Math.max(row.submittedAt, row.decidedAt ?? 0, row.lastUsedAt ?? 0) >= days * 86_400_000;
}
