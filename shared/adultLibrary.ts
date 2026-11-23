export const ADULT_VIDEO_CATEGORIES = {
  solo: "Solo",
  couples: "Couples",
  groups: "Groups",
  "kink-fetish": "Kink & fetish",
  "behind-the-scenes": "Behind the scenes"
} as const;

export type AdultVideoCategory = keyof typeof ADULT_VIDEO_CATEGORIES;
export type AdultVideo = Readonly<{
  id: string;
  title: string;
  creator: string;
  category: AdultVideoCategory;
  watchUrl: string;
  thumbnailUrl: string;
}>;
export type AdultVideoFavorite = Pick<AdultVideo, "id" | "title" | "creator" | "watchUrl">;

export function isAdultVideoCategory(value: unknown): value is AdultVideoCategory {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ADULT_VIDEO_CATEGORIES, value);
}
