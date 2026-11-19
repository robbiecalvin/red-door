export const GROUP_MESSAGE_MAX_LENGTH = 1000;

export type GroupDiscussionMessage = Readonly<{
  messageId: string;
  authorUserId: string;
  text: string;
  createdAtMs: number;
}>;
