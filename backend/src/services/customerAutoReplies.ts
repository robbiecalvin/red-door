import type { CommunityRepository } from "../repositories/communityRepository";
import type { AuthService, StoredUser } from "./authService";
import type { ChatMessage, ChatService } from "./chatService";
import { hidesPresence } from "./memberService";

const intents = {
  greeting: /^(?:h+i+|hey+|hello|hiya|yo|good (?:morning|evening))\b(?: handsome| man| there)?[.!?\s]*$/i,
  interest: /^(?:(?:hey|hi)[,! ]+)?(?:are (?:you|u) |you |u )?(?:(?:still )?looking(?:\s+(?:right now|tonight|now|rn|to meet))?|horny(?:\s+(?:right now|tonight|now|rn))?)[.!?\s]*$/i,
  smallTalk: /^(?:sup|wassup|whats up|what s up|what are you up to|wyd)[.!?\s]*$/i,
  location: /^(?:location|where(?: are)? (?:you|u)(?: at| located)?|whereabouts|where are you based)[.!?\s]*$/i,
  photo: /^(?:(?:do you have|have you got|you got|got|any|send|can (?:i see|you send))\s+)?(?:a |some )?(?:pics?|photos?|pictures?)(?: please)?[.!?\s]*$/i,
};
type Intent = keyof typeof intents;

function answer(intent: Intent, user: StoredUser): string | undefined {
  const record = user.plusData?.customerImport;
  switch (intent) {
    case "greeting": return "Hey 👋";
    case "interest": return "Yeah";
    case "smallTalk": return "NM, you?";
    case "location": {
      if (hidesPresence(user.plusData?.member, user)) return;
      return [record?.neighbourhood, record?.city].filter(Boolean).join(", ") || undefined;
    }
    case "photo": return record?.photoUrl ? `Photo: ${record.photoUrl}` : undefined;
  }
}

export function createCustomerAutoReplies(auth: AuthService, chat: ChatService, repository: CommunityRepository) {
  return async (message: ChatMessage): Promise<ChatMessage | undefined> => {
    if (!message.fromKey.startsWith("user:") || !message.toKey.startsWith("user:") || message.chatKind !== "cruise") return;
    const text = message.text.trim().replace(/[’']/g, "").replace(/\s+/g, " ");
    const intent = (Object.keys(intents) as Intent[]).find(key => intents[key].test(text));
    if (!intent) return;
    const recipient = auth.getUser(message.toKey.slice(5));
    const sender = auth.getUser(message.fromKey.slice(5));
    if (!recipient || recipient.bannedAtMs || !sender?.emailVerified || sender.bannedAtMs ||
        !recipient.plusData?.customerImport?.completed || !recipient.plusData.customerImport.autoReplies ||
        !answer(intent, recipient)) return;

    const key = `${message.chatId}:${recipient.id}`;
    const first = await repository.update(state => {
      const progress = (state.settings.customerAutoReplyIntents ??= {}) as Record<string, Intent[]>;
      const sent = progress[key] ?? [];
      if (sent.includes(intent)) return undefined;
      progress[key] = [...sent, intent];
      return sent.length === 0;
    });
    if (first === undefined) return;

    const current = auth.getUser(recipient.id);
    const reply = current && !current.bannedAtMs && current.plusData?.customerImport?.autoReplies
      ? answer(intent, current) : undefined;
    const sent = reply && chat.sendMessage({
      sessionToken: recipient.id, userId: recipient.id, userType: recipient.userType, ageVerified: recipient.ageVerified, mode: "cruise",
      tier: recipient.tier, plusExpiresAtMs: recipient.plusExpiresAtMs,
    }, {
      chatKind: "cruise", toKey: message.fromKey,
      text: first ? `Automatic replies are on for this conversation.\n\n${reply}` : reply,
    });
    if (sent && sent.ok) return sent.value;

    await repository.update(state => {
      const progress = state.settings.customerAutoReplyIntents as Record<string, Intent[]>;
      progress[key] = progress[key].filter(value => value !== intent);
    });
  };
}
