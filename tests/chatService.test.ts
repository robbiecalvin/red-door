import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createChatService } from "../backend/src/services/chatService";

describe("chatService", () => {
  it("Given invalid dependencies When createChatService is called Then it throws deterministically", () => {
    expect(() => createChatService({ cruiseRetentionHours: 0 })).toThrow("chatService requires a positive cruiseRetentionHours.");
    expect(() => createChatService({ rateLimitPerMinute: 0 })).toThrow("chatService requires a positive rateLimitPerMinute.");
    expect(() => createChatService({ maxHistoryDays: 0 })).toThrow("chatService requires a positive maxHistoryDays.");
  });

  it("Given a persistence file path When a message is sent and a new service instance is created Then conversation history is loaded from disk", () => {
    const filePath = path.join(os.tmpdir(), `reddoor-chat-${Date.now()}-${Math.random()}.json`);
    let now = 1_700_000_000_000;

    const svcA = createChatService({
      nowMs: () => now,
      persistenceFilePath: filePath,
      cruiseRetentionHours: 24 * 365,
      maxHistoryDays: 365,
      rateLimitPerMinute: 100
    });

    const sent = svcA.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "session:s_b", text: "persist me" }
    );
    expect(sent.ok).toBe(true);

    const svcB = createChatService({
      nowMs: () => now,
      persistenceFilePath: filePath,
      cruiseRetentionHours: 24 * 365,
      maxHistoryDays: 365,
      rateLimitPerMinute: 100
    });

    const loaded = svcB.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:s_b"
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("unreachable");
    expect(loaded.value).toHaveLength(1);
    expect(loaded.value[0]?.text).toBe("persist me");

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it("Given history retention is 1 day When messages are older than retention window Then they are purged from history", () => {
    let now = 1_700_000_000_000;
    const svc = createChatService({
      nowMs: () => now,
      cruiseRetentionHours: 24 * 365,
      maxHistoryDays: 1,
      rateLimitPerMinute: 100
    });

    const send = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "session:s_b", text: "old history" }
    );
    expect(send.ok).toBe(true);

    now += 2 * 24 * 60 * 60 * 1000;

    const list = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:s_b"
    );
    expect(list.ok).toBe(false);
    if (list.ok) throw new Error("unreachable");
    expect(list.error).toEqual({ code: "CHAT_EXPIRED", message: "Chat messages have expired." });
  });

  it("Given multiple peers with chat history When listThreads is requested Then it returns latest thread per peer sorted by newest first", () => {
    let now = 1_700_000_000_000;
    const svc = createChatService({
      nowMs: () => now,
      cruiseRetentionHours: 24 * 365,
      maxHistoryDays: 365,
      rateLimitPerMinute: 100
    });
    const sessionA = { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true } as const;

    const first = svc.sendMessage(sessionA, { chatKind: "cruise", toKey: "session:s_b", text: "hello b" });
    expect(first.ok).toBe(true);
    now += 10;
    const second = svc.sendMessage(sessionA, { chatKind: "cruise", toKey: "session:s_c", text: "hello c" });
    expect(second.ok).toBe(true);
    now += 10;
    const third = svc.sendMessage(sessionA, { chatKind: "cruise", toKey: "session:s_b", text: "newer b" });
    expect(third.ok).toBe(true);

    const threads = svc.listThreads(sessionA, "cruise");
    expect(threads.ok).toBe(true);
    if (!threads.ok) throw new Error("unreachable");
    expect(threads.value.map((row) => row.otherKey)).toEqual(["session:s_b", "session:s_c"]);
    expect(threads.value.map((row) => row.lastMessage.text)).toEqual(["newer b", "hello c"]);
  });

  it("Given invalid session state for listThreads When age gate or mode rules fail Then explicit errors are returned", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });

    const ageGate = svc.listThreads({ sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: false }, "cruise");
    expect(ageGate.ok).toBe(false);
    if (ageGate.ok) throw new Error("unreachable");
    expect(ageGate.error.code).toBe("AGE_GATE_REQUIRED");

    const guestDate = svc.listThreads({ sessionToken: "s_a", userType: "guest", mode: "hybrid", ageVerified: true }, "date");
    expect(guestDate.ok).toBe(false);
    if (guestDate.ok) throw new Error("unreachable");
    expect(guestDate.error.code).toBe("ANONYMOUS_FORBIDDEN");
  });

  it("Given cruise spot and direct threads When listThreads is requested Then spot threads are excluded", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });
    const a = { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true } as const;
    const b = { sessionToken: "s_b", userType: "guest", mode: "cruise", ageVerified: true } as const;

    const spotMessage = svc.sendMessage(a, { chatKind: "cruise", toKey: "spot:abc123", text: "at the spot" });
    expect(spotMessage.ok).toBe(true);
    const directMessage = svc.sendMessage(a, { chatKind: "cruise", toKey: "session:s_b", text: "hi b" });
    expect(directMessage.ok).toBe(true);
    const reply = svc.sendMessage(b, { chatKind: "cruise", toKey: "session:s_a", text: "hi a" });
    expect(reply.ok).toBe(true);

    const threads = svc.listThreads(a, "cruise");
    expect(threads.ok).toBe(true);
    if (!threads.ok) throw new Error("unreachable");
    expect(threads.value).toHaveLength(1);
    expect(threads.value[0]?.otherKey).toBe("session:s_b");
  });

  it("Given a chat created while both participants are in Cruise Mode When 72 hours have elapsed since message creation Then the messages are expired and no longer retrievable And expired messages cannot be restored", () => {
    let now = 1_700_000_000_000;
    const svc = createChatService({
      nowMs: () => now,
      cruiseRetentionHours: 72,
      rateLimitPerMinute: 100
    });

    const send = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "session:s_b", text: "hello" }
    );
    expect(send.ok).toBe(true);
    if (!send.ok) throw new Error("unreachable");

    const before = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:s_b"
    );
    expect(before.ok).toBe(true);
    if (!before.ok) throw new Error("unreachable");
    expect(before.value).toHaveLength(1);

    // Advance time to expiry boundary.
    now += 72 * 60 * 60 * 1000;

    const after = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:s_b"
    );
    expect(after.ok).toBe(false);
    if (after.ok) throw new Error("unreachable");
    expect(after.error).toEqual({ code: "CHAT_EXPIRED", message: "Chat messages have expired." });

    // Expired messages cannot be restored.
    const again = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:s_b"
    );
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error("unreachable");
    expect(again.value).toEqual([]);
  });

  it("Given a Cruise chat with some expired and some not When messages are listed Then only unexpired messages remain and the thread is retained", () => {
    let now = 1_700_000_000_000;
    const svc = createChatService({
      nowMs: () => now,
      cruiseRetentionHours: 72,
      rateLimitPerMinute: 100
    });

    const first = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "session:s_b", text: "old" }
    );
    expect(first.ok).toBe(true);

    now += 60 * 60 * 1000;
    const second = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "session:s_b", text: "new" }
    );
    expect(second.ok).toBe(true);

    // Expire the first but not the second.
    now += 72 * 60 * 60 * 1000 - 30 * 60 * 1000;
    const list = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:s_b"
    );
    expect(list.ok).toBe(true);
    if (!list.ok) throw new Error("unreachable");
    expect(list.value.map((m) => m.text)).toEqual(["new"]);
  });

  it("Given a user has been blocked by another user When the blocked user attempts to send a message Then message delivery is prevented And the sender receives an explicit rejection And no message data is persisted", () => {
    const now = 1_700_000_000_000;
    const svc = createChatService({
      nowMs: () => now,
      rateLimitPerMinute: 100,
      blockChecker: {
        isBlocked(fromKey: string, toKey: string): boolean {
          return fromKey === "user:u_blocked" && toKey === "user:u_target";
        }
      }
    });

    // Provide a match checker so this test exercises the block rule, not match gating.
    const svcWithMatch = createChatService({
      nowMs: () => now,
      rateLimitPerMinute: 100,
      blockChecker: {
        isBlocked(fromKey: string, toKey: string): boolean {
          return fromKey === "user:u_blocked" && toKey === "user:u_target";
        }
      },
      matchChecker: {
        isMatched(): boolean {
          return true;
        }
      }
    });

    const blockedSend = svcWithMatch.sendMessage(
      { sessionToken: "s_blocked", userType: "registered", mode: "date", userId: "u_blocked", ageVerified: true },
      { chatKind: "date", toKey: "user:u_target", text: "should fail" }
    );

    expect(blockedSend.ok).toBe(false);
    if (blockedSend.ok) throw new Error("unreachable");
    expect(blockedSend.error).toEqual({ code: "USER_BLOCKED", message: "You cannot message this user." });

    const messages = svcWithMatch.listMessages(
      { sessionToken: "s_blocked", userType: "registered", mode: "date", userId: "u_blocked", ageVerified: true },
      "date",
      "user:u_target"
    );
    expect(messages.ok).toBe(true);
    if (!messages.ok) throw new Error("unreachable");
    expect(messages.value).toEqual([]);
  });

  it("Given Date chat When 72 hours have elapsed Then messages are still retrievable (persistent until deletion)", () => {
    let now = 1_700_000_000_000;
    const svc = createChatService({
      nowMs: () => now,
      cruiseRetentionHours: 72,
      rateLimitPerMinute: 100
    });

    const svcWithMatch = createChatService({
      nowMs: () => now,
      cruiseRetentionHours: 72,
      rateLimitPerMinute: 100,
      matchChecker: {
        isMatched(): boolean {
          return true;
        }
      }
    });

    const send = svcWithMatch.sendMessage(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      { chatKind: "date", toKey: "user:u_b", text: "persist" }
    );
    expect(send.ok).toBe(true);

    now += 72 * 60 * 60 * 1000;

    const list = svcWithMatch.listMessages(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      "date",
      "user:u_b"
    );
    expect(list.ok).toBe(true);
    if (!list.ok) throw new Error("unreachable");
    expect(list.value).toHaveLength(1);
    expect(list.value[0]!.text).toBe("persist");
  });

  it("Given the rate limit is 20/min When the sender sends a 21st message within a minute Then it is rejected with RATE_LIMITED", () => {
    let now = 1_700_000_000_000;
    const svc = createChatService({
      nowMs: () => now,
      rateLimitPerMinute: 20,
      matchChecker: {
        isMatched(): boolean {
          return true;
        }
      }
    });

    for (let i = 0; i < 20; i += 1) {
      const res = svc.sendMessage(
        { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
        { chatKind: "date", toKey: "user:u_b", text: `m${i}` }
      );
      expect(res.ok).toBe(true);
    }

    const blocked = svc.sendMessage(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      { chatKind: "date", toKey: "user:u_b", text: "m20" }
    );
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("unreachable");
    expect(blocked.error.code).toBe("RATE_LIMITED");

    // After one minute passes, it should allow again.
    now += 60_000;
    const okAgain = svc.sendMessage(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      { chatKind: "date", toKey: "user:u_b", text: "ok" }
    );
    expect(okAgain.ok).toBe(true);
  });

  it("Given a message containing a disallowed kid-variation term When sendMessage is called Then it is rejected", () => {
    const svc = createChatService({
      nowMs: () => 1_700_000_000_000,
      rateLimitPerMinute: 20,
      matchChecker: {
        isMatched(): boolean {
          return true;
        }
      }
    });

    const blocked = svc.sendMessage(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      { chatKind: "date", toKey: "user:u_b", text: "no k.i.d talk" }
    );

    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("unreachable");
    expect(blocked.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Message rejected." });
  });

  it("Given an unauthenticated/invalid session When sendMessage is called Then it rejects with INVALID_SESSION", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });

    const bad = svc.sendMessage(null as any, { chatKind: "cruise", toKey: "session:s_b", text: "x" });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("unreachable");
    expect(bad.error).toEqual({ code: "INVALID_SESSION", message: "Invalid session." });
  });

  it("Given an invalid input shape When sendMessage is called Then it rejects deterministically", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });

    const invalidKind = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "nope" as any, toKey: "session:s_b", text: "x" }
    );
    expect(invalidKind.ok).toBe(false);
    if (invalidKind.ok) throw new Error("unreachable");
    expect(invalidKind.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid chat kind." });

    const invalidRecipient = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: " ", text: "x" }
    );
    expect(invalidRecipient.ok).toBe(false);
    if (invalidRecipient.ok) throw new Error("unreachable");
    expect(invalidRecipient.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid recipient." });

    const invalidMessage = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "session:s_b", text: "   " }
    );
    expect(invalidMessage.ok).toBe(false);
    if (invalidMessage.ok) throw new Error("unreachable");
    expect(invalidMessage.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid message." });

    const tooLong = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "session:s_b", text: "x".repeat(1_000) }
    );
    expect(tooLong.ok).toBe(true);
    if (!tooLong.ok) throw new Error("unreachable");
    expect(tooLong.value.text.length).toBe(500);
  });

  it("Given Cruise Mode When Date chat is attempted Then it is rejected with ANONYMOUS_FORBIDDEN for guests and UNAUTHORIZED_ACTION for mode mismatch", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });

    const guestDate = svc.sendMessage(
      { sessionToken: "s_guest", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "date", toKey: "user:u_b", text: "no" }
    );
    expect(guestDate.ok).toBe(false);
    if (guestDate.ok) throw new Error("unreachable");
    expect(guestDate.error.code).toBe("UNAUTHORIZED_ACTION");

    const registeredCruiseDate = svc.sendMessage(
      { sessionToken: "s_a", userType: "registered", mode: "cruise", userId: "u_a", ageVerified: true },
      { chatKind: "date", toKey: "user:u_b", text: "no" }
    );
    expect(registeredCruiseDate.ok).toBe(false);
    if (registeredCruiseDate.ok) throw new Error("unreachable");
    expect(registeredCruiseDate.error).toEqual({
      code: "UNAUTHORIZED_ACTION",
      message: "Chat kind is not allowed in the current mode.",
      context: { mode: "cruise", chatKind: "date" }
    });
  });

  it("Given a guest session in Date Mode (malicious client) When Date chat is attempted Then it is rejected with ANONYMOUS_FORBIDDEN", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });

    const res = svc.sendMessage(
      { sessionToken: "s_guest", userType: "guest", mode: "date", ageVerified: true },
      { chatKind: "date", toKey: "user:u_b", text: "no" }
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "ANONYMOUS_FORBIDDEN", message: "Anonymous users cannot use Date chat." });
  });

  it("Given no Cruise messages exist When listMessages is called Then it returns an empty list (not CHAT_EXPIRED)", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });

    const res = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:s_b"
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.value).toEqual([]);
  });

  it("Given invalid inputs When listMessages is called Then it rejects deterministically", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });

    const invalidKind = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "nope" as any,
      "x"
    );
    expect(invalidKind.ok).toBe(false);
    if (invalidKind.ok) throw new Error("unreachable");
    expect(invalidKind.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid chat kind." });

    const invalidRecipient = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      " "
    );
    expect(invalidRecipient.ok).toBe(false);
    if (invalidRecipient.ok) throw new Error("unreachable");
    expect(invalidRecipient.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid recipient." });
  });

  it("Given a media-only message When media payload is valid Then it is accepted and persisted in thread results", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });
    const sent = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      {
        chatKind: "cruise",
        toKey: "session:s_b",
        media: { kind: "image", objectKey: "chat/session-s_a/file.jpg", mimeType: "image/jpeg" }
      }
    );
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error("unreachable");
    expect(sent.value.text).toBe("");
    expect(sent.value.media?.kind).toBe("image");

    const list = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:s_b"
    );
    expect(list.ok).toBe(true);
    if (!list.ok) throw new Error("unreachable");
    expect(list.value).toHaveLength(1);
    expect(list.value[0]?.media?.objectKey).toBe("chat/session-s_a/file.jpg");
  });

  it("Given a malformed media payload When message is sent Then it is rejected explicitly", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });
    const res = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      {
        chatKind: "cruise",
        toKey: "session:s_b",
        media: { kind: "image", objectKey: "", mimeType: "video/mp4" } as any
      }
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid media attachment." });
  });

  it("Given getThread is called with invalid inputs Then it throws deterministically", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });
    expect(() => svc.getThread("nope" as any, "a", "b")).toThrow("Invalid chat kind.");
    expect(() => svc.getThread("cruise", "", "b")).toThrow("Invalid thread keys.");
  });

  it("Given a session without age verification When sendMessage is called Then it rejects with AGE_GATE_REQUIRED", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });

    const res = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: false },
      { chatKind: "cruise", toKey: "session:s_b", text: "hi" }
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({
      code: "AGE_GATE_REQUIRED",
      message: "You must be 18 or older to use Red Door.",
      context: { minimumAge: 18 }
    });
  });

  it("Given Date chat without a mutual match When a message is sent Then it is rejected with Match required before Date chat", () => {
    const svc = createChatService({
      rateLimitPerMinute: 100,
      matchChecker: {
        isMatched(): boolean {
          return false;
        }
      }
    });

    const res = svc.sendMessage(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      { chatKind: "date", toKey: "user:u_b", text: "hi" }
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Match required before Date chat." });
  });

  it("Given edge-case recipient and date session validation When message is sent Then deterministic errors are returned", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });

    const selfRecipient = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "session:s_a", text: "x" }
    );
    expect(selfRecipient.ok).toBe(false);
    if (selfRecipient.ok) throw new Error("unreachable");
    expect(selfRecipient.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid recipient." });

    const missingUserId = svc.sendMessage(
      { sessionToken: "s_a", userType: "registered", mode: "date", ageVerified: true } as any,
      { chatKind: "date", toKey: "user:u_b", text: "x" }
    );
    expect(missingUserId.ok).toBe(false);
    if (missingUserId.ok) throw new Error("unreachable");
    expect(missingUserId.error).toEqual({ code: "INVALID_SESSION", message: "Invalid session." });

    const invalidDateRecipient = svc.sendMessage(
      { sessionToken: "s_a", userType: "registered", mode: "date", userId: "u_a", ageVerified: true },
      { chatKind: "date", toKey: "session:s_b", text: "x" }
    );
    expect(invalidDateRecipient.ok).toBe(false);
    if (invalidDateRecipient.ok) throw new Error("unreachable");
    expect(invalidDateRecipient.error).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid recipient." });
  });

  it("Given invalid media variants When message is sent Then each payload is rejected", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });
    const session = { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true } as const;

    const invalidKind = svc.sendMessage(session, {
      chatKind: "cruise",
      toKey: "session:s_b",
      media: { kind: "bad" as any, objectKey: "chat/x", mimeType: "image/jpeg" }
    });
    expect(invalidKind.ok).toBe(false);

    const emptyMime = svc.sendMessage(session, {
      chatKind: "cruise",
      toKey: "session:s_b",
      media: { kind: "image", objectKey: "chat/x", mimeType: " " }
    });
    expect(emptyMime.ok).toBe(false);

    const mismatchedMime = svc.sendMessage(session, {
      chatKind: "cruise",
      toKey: "session:s_b",
      media: { kind: "image", objectKey: "chat/x", mimeType: "video/mp4" }
    });
    expect(mismatchedMime.ok).toBe(false);

    const badDuration = svc.sendMessage(session, {
      chatKind: "cruise",
      toKey: "session:s_b",
      media: { kind: "audio", objectKey: "chat/x", mimeType: "audio/webm", durationSeconds: -1 }
    });
    expect(badDuration.ok).toBe(false);

    const oversizedKey = svc.sendMessage(session, {
      chatKind: "cruise",
      toKey: "session:s_b",
      media: { kind: "audio", objectKey: `chat/${"x".repeat(400)}`, mimeType: "audio/webm" }
    });
    expect(oversizedKey.ok).toBe(false);
  });

  it("Given listMessages with invalid authorization context Then explicit rejections are returned", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });
    const modeMismatch = svc.listMessages(
      { sessionToken: "s_a", userType: "registered", mode: "cruise", ageVerified: true },
      "date",
      "user:u_b"
    );
    expect(modeMismatch.ok).toBe(false);
    if (modeMismatch.ok) throw new Error("unreachable");
    expect(modeMismatch.error.code).toBe("UNAUTHORIZED_ACTION");

    const ageGate = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: false },
      "cruise",
      "session:s_b"
    );
    expect(ageGate.ok).toBe(false);
    if (ageGate.ok) throw new Error("unreachable");
    expect(ageGate.error.code).toBe("AGE_GATE_REQUIRED");

    const guestDate = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "date", ageVerified: true },
      "date",
      "user:u_b"
    );
    expect(guestDate.ok).toBe(false);
    if (guestDate.ok) throw new Error("unreachable");
    expect(guestDate.error).toEqual({ code: "ANONYMOUS_FORBIDDEN", message: "Anonymous users cannot use Date chat." });
  });

  it("Given getThread with valid values Then it normalizes key ordering deterministically", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });
    const thread = svc.getThread("cruise", "session:z", "session:a");
    expect(thread.chatKind).toBe("cruise");
    expect(thread.aKey).toBe("session:a");
    expect(thread.bKey).toBe("session:z");
    expect(thread.chatId).toBe("cruise::session:a::session:z");
  });

  it("Given a cruise spot key When multiple users post to that spot Then all users see one shared spot thread", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });

    const sentA = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "spot:park-1", text: "Anyone here?" }
    );
    expect(sentA.ok).toBe(true);
    if (!sentA.ok) throw new Error("unreachable");

    const sentB = svc.sendMessage(
      { sessionToken: "s_b", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "spot:park-1", text: "On my way." }
    );
    expect(sentB.ok).toBe(true);
    if (!sentB.ok) throw new Error("unreachable");

    expect(sentA.value.chatId).toBe("cruise::spot:park-1");
    expect(sentB.value.chatId).toBe("cruise::spot:park-1");

    const listedByA = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "spot:park-1"
    );
    expect(listedByA.ok).toBe(true);
    if (!listedByA.ok) throw new Error("unreachable");
    expect(listedByA.value).toHaveLength(2);
    expect(listedByA.value.map((m) => m.fromKey)).toEqual(["session:s_a", "session:s_b"]);

    const listedByC = svc.listMessages(
      { sessionToken: "s_c", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "spot:park-1"
    );
    expect(listedByC.ok).toBe(true);
    if (!listedByC.ok) throw new Error("unreachable");
    expect(listedByC.value).toHaveLength(2);
  });

  it("Given a sent message and recipient reads the thread When sender lists messages Then receipt status includes Delivered and Read", () => {
    let now = 1_700_000_000_000;
    const svc = createChatService({ nowMs: () => now, rateLimitPerMinute: 100 });

    const sent = svc.sendMessage(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "session:s_b", text: "hello" }
    );
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error("unreachable");
    expect(sent.value.deliveredAtMs).toBe(now);

    now += 5000;
    const read = svc.markRead(
      { sessionToken: "s_b", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:s_a"
    );
    expect(read.ok).toBe(true);

    const listed = svc.listMessages(
      { sessionToken: "s_a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:s_b"
    );
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error("unreachable");
    expect(listed.value[0]?.deliveredAtMs).toBe(1_700_000_000_000);
    expect(listed.value[0]?.readAtMs).toBe(1_700_000_005_000);
  });

  it("Given a seeded initialState When chat service starts Then it hydrates valid rows and ignores invalid rows", () => {
    const svc = createChatService({
      rateLimitPerMinute: 100,
      nowMs: () => 1_700_000_100_000,
      initialState: {
        threads: [
          {
            threadId: "cruise::session:a::session:b",
            messages: [
              {
                messageId: "m1",
                chatId: "cruise::session:a::session:b",
                chatKind: "cruise",
                fromKey: "session:a",
                toKey: "session:b",
                text: "seed",
                createdAtMs: 1_700_000_000_000
              } as any,
              { invalid: true } as any
            ]
          },
          { threadId: 1 as any, messages: [] as any } as any
        ],
        readCursors: [{ threadUserKey: "cruise::session:a::session:b::session:a", readAtMs: 1_700_000_000_100 }, { bad: true } as any]
      }
    });

    const listed = svc.listMessages(
      { sessionToken: "a", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:b"
    );
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error("unreachable");
    expect(listed.value).toHaveLength(1);
    expect(svc.snapshotState().threads).toHaveLength(1);
    expect(svc.snapshotState().readCursors).toHaveLength(1);
  });

  it("Given persistence hooks throw When send/markRead are called Then chat operations still succeed", () => {
    const svc = createChatService({
      rateLimitPerMinute: 100,
      onStateChanged: () => {
        throw new Error("persist error");
      }
    });

    const sent = svc.sendMessage(
      { sessionToken: "a", userType: "guest", mode: "cruise", ageVerified: true },
      { chatKind: "cruise", toKey: "session:b", text: "hook-safe" }
    );
    expect(sent.ok).toBe(true);

    const read = svc.markRead(
      { sessionToken: "b", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      "session:a"
    );
    expect(read.ok).toBe(true);
  });

  it("Given markRead invalid contexts When called Then deterministic errors are returned", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });

    const ageGate = svc.markRead({ sessionToken: "s", userType: "guest", mode: "cruise", ageVerified: false }, "cruise", "session:x");
    expect(ageGate.ok).toBe(false);

    const invalidKind = svc.markRead(
      { sessionToken: "s", userType: "guest", mode: "cruise", ageVerified: true },
      "bad" as any,
      "session:x"
    );
    expect(invalidKind.ok).toBe(false);

    const modeMismatch = svc.markRead(
      { sessionToken: "s", userType: "registered", mode: "cruise", userId: "u1", ageVerified: true },
      "date",
      "user:u2"
    );
    expect(modeMismatch.ok).toBe(false);

    const guestDate = svc.markRead(
      { sessionToken: "s", userType: "guest", mode: "date", ageVerified: true },
      "date",
      "user:u2"
    );
    expect(guestDate.ok).toBe(false);

    const invalidRecipient = svc.markRead(
      { sessionToken: "s", userType: "guest", mode: "cruise", ageVerified: true },
      "cruise",
      " "
    );
    expect(invalidRecipient.ok).toBe(false);
  });

  it("Given invalid getThread inputs When called Then it throws explicit errors", () => {
    const svc = createChatService({ rateLimitPerMinute: 100 });
    expect(() => svc.getThread("bad" as any, "a", "b")).toThrow("Invalid chat kind.");
    expect(() => svc.getThread("cruise", "", "b")).toThrow("Invalid thread keys.");
  });
});
