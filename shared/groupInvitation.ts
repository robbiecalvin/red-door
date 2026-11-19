export type GroupInvitations = {
  eventStartAtMs?: number;
  invitedUserIds?: readonly string[];
  inviteExpiresAtByUserId?: Readonly<Record<string, number>>;
};

export function groupInvitationDeadline(group: GroupInvitations, userId: string): number | undefined {
  return group.inviteExpiresAtByUserId?.[userId] ?? group.eventStartAtMs;
}

export function hasActiveGroupInvitation(group: GroupInvitations, userId: string, now: number): boolean {
  return Boolean(group.invitedUserIds?.includes(userId) &&
    Math.min(groupInvitationDeadline(group, userId) ?? Infinity, group.eventStartAtMs ?? Infinity) > now);
}

export function resolveGroupInvitationDeadline(group: GroupInvitations, input: unknown, now: number): number | undefined {
  const end = group.eventStartAtMs;
  const deadline = input === undefined ? end : input;
  return typeof deadline === "number" && Number.isSafeInteger(deadline) &&
    deadline > now && (end === undefined || deadline <= end) ? deadline : undefined;
}
