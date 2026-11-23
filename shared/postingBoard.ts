import classifiedCategories from "./classifiedCategories.json";

export const POSTING_BOARDS = {
  general: "General",
  meetups: "Meetups",
  local: "Local updates"
} as const;

export const CLASSIFIED_CATEGORIES = classifiedCategories;

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
