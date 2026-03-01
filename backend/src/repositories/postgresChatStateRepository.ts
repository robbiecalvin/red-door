import type { Pool } from "pg";

import type { ChatMessage, ChatPersistenceState } from "../services/chatService";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

function parseMedia(value: unknown): ChatMessage["media"] {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  if (kind !== "image" && kind !== "video" && kind !== "audio") return undefined;
  const objectKey = asString(raw.objectKey);
  const mimeType = asString(raw.mimeType);
  const durationRaw = raw.durationSeconds;
  const durationSeconds = typeof durationRaw === "number" && Number.isFinite(durationRaw) ? durationRaw : undefined;
  if (!objectKey || !mimeType) return undefined;
  return { kind, objectKey, mimeType, durationSeconds };
}

function parseMessage(row: Record<string, unknown>): ChatMessage | null {
  const messageId = asString(row.message_id);
  const threadId = asString(row.thread_id);
  const chatKind = row.chat_kind;
  const fromKey = asString(row.from_key);
  const toKey = asString(row.to_key);
  const text = asString(row.text);
  const createdAtMs = asNumber(row.created_at_ms);
  const deliveredAtRaw = row.delivered_at_ms;
  const readAtRaw = row.read_at_ms;
  const expiresAtRaw = row.expires_at_ms;

  if (!messageId || !threadId || !fromKey || !toKey || !text || !Number.isFinite(createdAtMs)) return null;
  if (chatKind !== "cruise" && chatKind !== "date") return null;

  const deliveredAtMs = deliveredAtRaw === null || deliveredAtRaw === undefined ? undefined : asNumber(deliveredAtRaw);
  const readAtMs = readAtRaw === null || readAtRaw === undefined ? undefined : asNumber(readAtRaw);
  const expiresAtMs = expiresAtRaw === null || expiresAtRaw === undefined ? undefined : asNumber(expiresAtRaw);

  return {
    messageId,
    chatId: threadId,
    chatKind,
    fromKey,
    toKey,
    text,
    media: parseMedia(row.media_json),
    createdAtMs,
    deliveredAtMs: Number.isFinite(deliveredAtMs) ? deliveredAtMs : undefined,
    readAtMs: Number.isFinite(readAtMs) ? readAtMs : undefined,
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : undefined
  };
}

export type ChatStateRepository = Readonly<{
  loadState(): Promise<ChatPersistenceState>;
  saveState(state: ChatPersistenceState): Promise<void>;
}>;

export function createPostgresChatStateRepository(pool: Pool): ChatStateRepository {
  return {
    async loadState(): Promise<ChatPersistenceState> {
      const [messagesRes, cursorsRes] = await Promise.all([
        pool.query(
          `SELECT message_id, thread_id, chat_kind, from_key, to_key, text, media_json,
                  created_at_ms, delivered_at_ms, read_at_ms, expires_at_ms
           FROM chat_messages`
        ),
        pool.query("SELECT thread_user_key, read_at_ms FROM chat_read_cursors")
      ]);

      const grouped = new Map<string, ChatMessage[]>();
      for (const row of messagesRes.rows) {
        const msg = parseMessage(row as Record<string, unknown>);
        if (!msg) continue;
        const list = grouped.get(msg.chatId) ?? [];
        list.push(msg);
        grouped.set(msg.chatId, list);
      }

      const threads = Array.from(grouped.entries()).map(([threadId, messages]) => ({
        threadId,
        messages: messages.sort((a, b) => a.createdAtMs - b.createdAtMs)
      }));

      const readCursors = cursorsRes.rows
        .map((row) => {
          const key = asString((row as Record<string, unknown>).thread_user_key);
          const readAtMs = asNumber((row as Record<string, unknown>).read_at_ms);
          if (!key || !Number.isFinite(readAtMs)) return null;
          return { threadUserKey: key, readAtMs };
        })
        .filter((v): v is { threadUserKey: string; readAtMs: number } => v !== null);

      return { threads, readCursors };
    },

    async saveState(state: ChatPersistenceState): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM chat_messages");
        await client.query("DELETE FROM chat_read_cursors");

        for (const thread of state.threads) {
          for (const msg of thread.messages) {
            await client.query(
              `INSERT INTO chat_messages (
                message_id, thread_id, chat_kind, from_key, to_key, text, media_json,
                created_at_ms, delivered_at_ms, read_at_ms, expires_at_ms
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7::jsonb,
                $8, $9, $10, $11
              )`,
              [
                msg.messageId,
                thread.threadId,
                msg.chatKind,
                msg.fromKey,
                msg.toKey,
                msg.text,
                msg.media ? JSON.stringify(msg.media) : null,
                msg.createdAtMs,
                msg.deliveredAtMs ?? null,
                msg.readAtMs ?? null,
                msg.expiresAtMs ?? null
              ]
            );
          }
        }

        for (const cursor of state.readCursors) {
          await client.query(
            "INSERT INTO chat_read_cursors (thread_user_key, read_at_ms) VALUES ($1, $2)",
            [cursor.threadUserKey, cursor.readAtMs]
          );
        }

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
  };
}
