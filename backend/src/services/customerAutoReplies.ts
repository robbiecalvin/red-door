import type { CommunityRepository } from "../repositories/communityRepository";
import type { AuthService } from "./authService";
import type { ChatMessage, ChatService } from "./chatService";

const replies = [
  ["Automatic replies are on for this conversation.\n\nHey 👋", "Automatic replies are on for this conversation.\n\nHi there"],
  ["Yeah", "Yep"],
  ["Got a photo you’d like to share?", "Want to share a pic? No pressure."],
  ["Looking good 🔥", "Hotttt 🔥"],
] as const;

export function createCustomerAutoReplies(auth: AuthService, chat: ChatService, repository: CommunityRepository) {
  return async (message: ChatMessage): Promise<ChatMessage | undefined> => {
    if (!message.fromKey.startsWith("user:") || !message.toKey.startsWith("user:") || message.chatKind !== "cruise" ||
        message.text.startsWith("GROUP_INVITE_")) return;
    const recipient = auth.getUser(message.toKey.slice(5));
    const sender = auth.getUser(message.fromKey.slice(5));
    if (!recipient || recipient.bannedAtMs || !sender?.emailVerified || sender.bannedAtMs ||
        (!recipient.plusData?.customerImport?.completed || !recipient.plusData.customerImport.autoReplies)) return;

    const key = `${message.chatId}:${recipient.id}`;
    const step = await repository.update(state => {
      const progress = (state.settings.customerAutoReplies ??= {}) as Record<string, number>;
      const current = progress[key] ?? 0;
      if (current >= replies.length || (current === 3 && message.media?.kind !== "image")) return undefined;
      progress[key] = current + 1;
      return current;
    });
    if (step === undefined) return;

    // Settings may have changed while the durable progress update was queued.
    const enabled = auth.getUser(recipient.id)?.plusData?.customerImport?.autoReplies;
    const variants = replies[step];
    const sent = enabled && chat.sendMessage({
      sessionToken: recipient.id, userId: recipient.id, userType: recipient.userType, ageVerified: recipient.ageVerified, mode: "cruise",
      tier: recipient.tier, plusExpiresAtMs: recipient.plusExpiresAtMs,
    }, { chatKind: "cruise", toKey: message.fromKey, text: variants[Math.floor(Math.random() * variants.length)] });
    if (sent && sent.ok) return sent.value;

    await repository.update(state => {
      const progress = state.settings.customerAutoReplies as Record<string, number>;
      if (progress[key] === step + 1) progress[key] = step;
    });
  };
}
