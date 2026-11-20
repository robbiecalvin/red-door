import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCommunityRepository } from "../backend/src/repositories/communityRepository";
import { createAuthService } from "../backend/src/services/authService";
import { createChatService, type ChatMessage } from "../backend/src/services/chatService";
import { createCustomerAutoReplies } from "../backend/src/services/customerAutoReplies";

test("imported customers can follow up on a plan and stop after twelve incoming messages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "customer-auto-replies-"));
  try {
    const storage = join(dir, "community.json");
    const auth = createAuthService({ jwtSecret: "automatic-reply-test", userStoreFilePath: join(dir, "users.json") });
    const regular = auth.adminCreateUser("sender@example.com", "Sender-test123!", null, "registered", "free", "user");
    const imported = auth.adminCreateUser("recipient@example.com", "Recipient-test123!", null, "registered", "free", "user", {
      data: { customerImport: { sourceId: "import-1", completed: true, autoReplies: true, city: "Vancouver", neighbourhood: "West End", photoUrl: "https://example.com/profile.jpg" } },
    });
    if (!regular.ok || !imported.ok) throw new Error("Unable to create test members.");
    const chat = createChatService();
    const fromKey = `user:${regular.value.id}`, toKey = `user:${imported.value.id}`;
    let count = 0;
    const incoming = (text: string): ChatMessage => ({
      messageId: `incoming-${++count}`, chatId: chat.getThread("cruise", fromKey, toKey).chatId,
      chatKind: "cruise", fromKey, toKey, text, createdAtMs: 1,
    });
    const initial = createCustomerAutoReplies(auth, chat, await createCommunityRepository(null, storage));
    expect(imported.value.emailVerified).toBe(false);
    expect(await initial(incoming("I live in Vancouver"))).toBeUndefined();
    expect((await initial(incoming("Hello")))?.text).toMatch(/^(Hey 👋|Hey there|Hi!|Hey, how’s it going\?)$/);
    const resumed = createCustomerAutoReplies(auth, chat, await createCommunityRepository(null, storage));
    expect((await resumed(incoming("Horny?")))?.text).toMatch(/^(Yeah|Yep|I am|Yeah, you\?)$/);
    expect((await resumed(incoming("Sup?")))?.text).toMatch(/NM|Not much|Just chilling/);
    expect((await resumed(incoming("Got pics?")))?.text).toBe("Photo: https://example.com/profile.jpg");
    expect((await resumed(incoming("Location?")))?.text).toBe("West End, Vancouver. What area are you in?");
    expect((await resumed(incoming("Want to grab a coffee?")))?.text).toMatch(/first meet|meetup/);
    expect((await resumed(incoming("Sounds good")))?.text).toMatch(/like to do|neighbourhood or a time/);
    expect(await resumed(incoming("Pics?"))).toBeUndefined();
    expect((await resumed(incoming("Are you free tonight?")))?.text).toMatch(/time|day/);
    expect(await resumed(incoming("The weather is cold"))).toBeUndefined();
    expect((await resumed(incoming("Thanks")))?.text).toMatch(/course|welcome/);
    expect(await resumed(incoming("Hey"))).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
