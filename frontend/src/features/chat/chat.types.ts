export type ChatKind = "cruise" | "date";
export type ChatMediaKind = "image" | "video" | "audio";

export type ChatMediaAttachment = Readonly<{
  kind: ChatMediaKind;
  objectKey: string;
  mimeType: string;
  durationSeconds?: number;
}>;

export type ChatMessage = Readonly<{
  messageId: string;
  fromKey: string;
  toKey: string;
  text: string;
  media?: ChatMediaAttachment;
  createdAtMs: number;
  deliveredAtMs?: number;
  readAtMs?: number;
}>;

export type ServiceError = Readonly<{
  code: string;
  message: string;
  context?: Record<string, unknown>;
}>;
