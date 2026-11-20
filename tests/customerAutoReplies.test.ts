import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCommunityRepository } from "../backend/src/repositories/communityRepository";
import { createAuthService } from "../backend/src/services/authService";
import { createChatService, type ChatMessage } from "../backend/src/services/chatService";
import { createCustomerAutoReplies } from "../backend/src/services/customerAutoReplies";

test("imported customers disclose automatic replies once and finish after receiving a photo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "customer-auto-replies-"));
  try {
    const storage = join(dir, "community.json");
    const auth = createAuthService({ jwtSecret: "automatic-reply-test", userStoreFilePath: join(dir, "users.json") });
    const regular = auth.adminCreateUser("sender@example.com", "Sender-test123!", null, "registered", "free", "user");
    const imported = auth.adminCreateUser("recipient@example.com", "Recipient-test123!", null, "registered", "free", "user", {
      data: { customerImport: { sourceId: "import-1", completed: true, autoReplies: true } },
    });
    if (!regular.ok || !imported.ok) throw new Error("Unable to create test members.");
    const chat = createChatService();
    const fromKey = `user:${regular.value.id}`, toKey = `user:${imported.value.id}`;
    const incoming = (media?: ChatMessage["media"]): ChatMessage => ({
      messageId: "incoming", chatId: chat.getThread("cruise", fromKey, toKey).chatId,
      chatKind: "cruise", fromKey, toKey, text: "Hello", createdAtMs: 1, media,
    });
    const initial = createCustomerAutoReplies(auth, chat, await createCommunityRepository(null, storage));
    expect(await initial(incoming())).toBeUndefined();
    const reset = auth.requestPasswordReset(imported.value.email);
    expect(auth.resetPassword(reset!.token, "Claimed-test123!").ok).toBe(true);
    expect((await initial(incoming()))?.text).toContain("Automatic replies are on");
    const resumed = createCustomerAutoReplies(auth, chat, await createCommunityRepository(null, storage));
    expect((await resumed(incoming()))?.text).toMatch(/^(Yeah|Yep)$/);
    expect((await resumed(incoming()))?.text).toMatch(/photo|pic/);
    expect(await resumed(incoming())).toBeUndefined();
    expect((await resumed(incoming({ kind: "image", objectKey: "test.jpg", mimeType: "image/jpeg" })))?.text).toMatch(/🔥/);
    expect(await resumed(incoming())).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
