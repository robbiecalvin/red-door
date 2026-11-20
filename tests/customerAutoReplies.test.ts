import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCommunityRepository } from "../backend/src/repositories/communityRepository";
import { createAuthService } from "../backend/src/services/authService";
import { createChatService, type ChatMessage } from "../backend/src/services/chatService";
import { createCustomerAutoReplies } from "../backend/src/services/customerAutoReplies";

test("imported customers answer recognized messages before sign-in and disclose automation once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "customer-auto-replies-"));
  try {
    const storage = join(dir, "community.json");
    const auth = createAuthService({ jwtSecret: "automatic-reply-test", userStoreFilePath: join(dir, "users.json") });
    const regular = auth.adminCreateUser("sender@example.com", "Sender-test123!", null, "registered", "free", "user");
    const imported = auth.adminCreateUser("recipient@example.com", "Recipient-test123!", null, "registered", "free", "user", {
      data: { customerImport: { sourceId: "import-1", completed: true, autoReplies: true, city: "Vancouver", neighbourhood: "West End" } },
    });
    if (!regular.ok || !imported.ok) throw new Error("Unable to create test members.");
    const chat = createChatService();
    const fromKey = `user:${regular.value.id}`, toKey = `user:${imported.value.id}`;
    const incoming = (text: string): ChatMessage => ({
      messageId: "incoming", chatId: chat.getThread("cruise", fromKey, toKey).chatId,
      chatKind: "cruise", fromKey, toKey, text, createdAtMs: 1,
    });
    const initial = createCustomerAutoReplies(auth, chat, await createCommunityRepository(null, storage));
    expect(imported.value.emailVerified).toBe(false);
    expect(await initial(incoming("I live in Vancouver"))).toBeUndefined();
    expect((await initial(incoming("Hello")))?.text).toContain("Automatic replies are on");
    const resumed = createCustomerAutoReplies(auth, chat, await createCommunityRepository(null, storage));
    expect(await resumed(incoming("Hey"))).toBeUndefined();
    expect((await resumed(incoming("Horny?")))?.text).toBe("Yeah");
    expect((await resumed(incoming("Sup?")))?.text).toBe("NM, you?");
    expect((await resumed(incoming("Location?")))?.text).toBe("West End, Vancouver");
    expect(await resumed(incoming("Pics?"))).toBeUndefined();
    auth.updatePlus(imported.value.id, { plusData: { customerImport: {
      ...imported.value.plusData!.customerImport!, photoUrl: "https://example.com/profile.jpg",
    } } });
    expect((await resumed(incoming("Got pics?")))?.text).toBe("Photo: https://example.com/profile.jpg");
    expect(await resumed(incoming("Pics?"))).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
