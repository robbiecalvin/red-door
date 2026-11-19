export function validGuestLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function groupIsFull(group: {
  guestLimit?: number;
  attendeeCount?: number;
  acceptedUserIds?: readonly string[];
}): boolean {
  const count = group.attendeeCount ?? new Set(group.acceptedUserIds ?? []).size;
  return validGuestLimit(group.guestLimit) && count >= group.guestLimit;
}
