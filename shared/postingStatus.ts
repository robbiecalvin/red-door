export const POSTING_AVAILABILITY = {
  hosting: "Hosting",
  travelling: "Travelling"
} as const;

export type PostingAvailability = keyof typeof POSTING_AVAILABILITY;

export function isPostingAvailability(value: unknown): value is PostingAvailability {
  return value === "hosting" || value === "travelling";
}
