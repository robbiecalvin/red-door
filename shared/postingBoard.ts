export const POSTING_BOARDS = {
  general: "General",
  meetups: "Meetups",
  local: "Local updates"
} as const;

export type PostingBoard = keyof typeof POSTING_BOARDS;

export function isPostingBoard(value: unknown): value is PostingBoard {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(POSTING_BOARDS, value);
}
