import { groupInvitationDeadline, hasActiveGroupInvitation, type GroupInvitations } from "./groupInvitation";

type GroupPosting = GroupInvitations & {
  type: string;
  authorUserId: string;
  guestLimit?: number;
  attendeeCount?: number;
  lat?: number;
  lng?: number;
  locationInstructions?: string;
  acceptedUserIds?: readonly string[];
  joinRequestUserIds?: readonly string[];
};

export function groupPostingForViewer<T extends GroupPosting>(posting: T, viewerId?: string, now = Date.now()): T {
  if (posting.type !== "event") return posting;
  const attendeeCount = new Set(posting.acceptedUserIds ?? []).size;
  const activeInvitations = (posting.invitedUserIds ?? []).filter(id => hasActiveGroupInvitation(posting, id, now));
  const host = viewerId === posting.authorUserId;
  const invitedUserIds = host ? activeInvitations : activeInvitations.filter(id => id === viewerId);
  const inviteExpiresAtByUserId = Object.fromEntries(invitedUserIds.flatMap(id => {
    const deadline = groupInvitationDeadline(posting, id);
    return deadline === undefined ? [] : [[id, deadline]];
  }));
  if (host) return { ...posting, attendeeCount, invitedUserIds, inviteExpiresAtByUserId };

  const ownEntry = (ids?: readonly string[]) => viewerId && ids?.includes(viewerId) ? [viewerId] : [];
  const acceptedUserIds = ownEntry(posting.acceptedUserIds);
  const visible = {
    ...posting,
    attendeeCount,
    invitedUserIds,
    inviteExpiresAtByUserId,
    acceptedUserIds,
    joinRequestUserIds: ownEntry(posting.joinRequestUserIds)
  };
  if (!acceptedUserIds.length) {
    delete visible.lat;
    delete visible.lng;
    delete visible.locationInstructions;
  }
  return visible;
}
