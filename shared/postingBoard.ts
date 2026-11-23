export const POSTING_BOARDS = {
  general: "General",
  meetups: "Meetups",
  local: "Local updates"
} as const;

export const CLASSIFIED_CATEGORIES = {
  housing: "Housing",
  jobs: "Jobs",
  gigs: "Gigs",
  services: "Services",
  "for-sale": "For sale",
  wanted: "Wanted",
  free: "Free stuff",
  community: "Community",
  events: "Events",
  personals: "Personals",
  rideshare: "Rideshare",
  "lost-found": "Lost and found"
} as const;

export type ClassifiedCategory = keyof typeof CLASSIFIED_CATEGORIES;
export type PostingBoard = keyof typeof POSTING_BOARDS | ClassifiedCategory;

export function isClassifiedCategory(value: unknown): value is ClassifiedCategory {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CLASSIFIED_CATEGORIES, value);
}

export function isPostingBoard(value: unknown): value is keyof typeof POSTING_BOARDS {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(POSTING_BOARDS, value);
}

export function adLifetimeMs(cityId?: string): number {
  return (cityId ? 30 * 24 : 12) * 60 * 60 * 1000;
}
