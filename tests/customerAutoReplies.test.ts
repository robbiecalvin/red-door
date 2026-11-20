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
    const regular = auth.adminCreateUser("sender@example.com", "Sender-test123!", null, "registered", "premium", "user");
    const imported = auth.adminCreateUser("recipient@example.com", "Recipient-test123!", null, "registered", "free", "user", {
      data: { customerImport: { sourceId: "import-1", completed: true, autoReplies: true, city: "Vancouver", neighbourhood: "West End", photoUrl: "https://example.com/profile.jpg" } },
    });
    if (!regular.ok || !imported.ok) throw new Error("Unable to create test members.");
    let time = 10_000;
    const chat = createChatService({ nowMs: () => time });
    const toKey = `user:${imported.value.id}`;
    const sender = { sessionToken: "sender", userId: regular.value.id, userType: "subscriber" as const,
      ageVerified: true, mode: "cruise" as const, tier: "premium" as const };
    const incoming = (text: string): ChatMessage => {
      const sent = chat.sendMessage(sender, { toKey, text, chatKind: "cruise" });
      if (!sent.ok) throw new Error(sent.error.message);
      return sent.value;
    };
    const options = { now: () => time, random: () => 0 };
    const initial = createCustomerAutoReplies(auth, chat, await createCommunityRepository(null, storage), options);
    const delivered: { reply: ChatMessage; markedRead: boolean }[] = [];
    const flush = (worker: typeof initial) => worker.drain((reply, markedRead) => { delivered.push({ reply, markedRead }); });
    expect(imported.value.emailVerified).toBe(false);
    await initial.schedule(incoming("I live in Vancouver"));
    await initial.schedule(incoming("Hello"));
    time += 19_999;
    await flush(initial);
    expect(delivered).toHaveLength(0);
    const resumed = createCustomerAutoReplies(auth, chat, await createCommunityRepository(null, storage), options);
    time++;
    await flush(resumed);
    expect(delivered[0].reply.text).toMatch(/^(Hey 👋|Hey there|Hi!|Hey, how’s it going\?)$/);
    expect(delivered[0].markedRead).toBe(true);
    const read = chat.listMessages(sender, "cruise", toKey);
    if (!read.ok) throw new Error(read.error.message);
    expect(read.value.find(message => message.text === "Hello")?.readAtMs).toBe(time);
    for (const question of ["Horny?", "Sup?", "Got pics?", "Location?", "Want to grab a coffee?", "Sounds good", "Pics?", "Are you free tonight?", "The weather is cold", "Thanks", "Hey"]) {
      await resumed.schedule(incoming(question));
    }
    time += 20_000;
    await flush(resumed);
    expect(delivered).toHaveLength(9);
    expect(delivered[3].reply.text).toBe("Photo: https://example.com/profile.jpg");
    expect(delivered[6].reply.text).toMatch(/like to do|neighbourhood or a time/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
