import type { CommunityRepository } from "../repositories/communityRepository";
import type { AuthService, StoredUser } from "./authService";
import type { ChatMessage, ChatService } from "./chatService";
import { hidesPresence } from "./memberService";

const intents = {
  greeting: /^(?:h+i+|hey+|hello|hiya|yo|howdy|heya|good (?:morning|afternoon|evening))\b(?: handsome| man| there| babe| cutie)?[.!?\s]*$/i,
  interest: /^(?:(?:hey|hi)[,! ]+)?(?:are (?:you|u) |you |u )?(?:(?:still )?looking(?:\s+(?:right now|tonight|now|rn|to meet))?|horny(?:\s+(?:right now|tonight|now|rn))?)[.!?\s]*$/i,
  smallTalk: /^(?:sup|wsup|wassup|whats up|what are (?:you|u) up to|wyd|how(?:s it going| are you| are u))[.!?\s]*$/i,
  location: /^(?:location|where(?: are)? (?:you|u)(?: at| located)?|whereabouts|where(?: are)? (?:you|u) (?:based|from)|where do you live|what neighbourhood)[.!?\s]*$/i,
  photo: /^(?:(?:do you have|have you got|you got|got|any|send(?: me)?|can (?:i see|you send))\s+)?(?:a |some )?(?:pics?|photos?|pictures?)(?: please)?[.!?\s]*$/i,
};
type Intent = keyof typeof intents;

const responsePools = {
  greeting: ["Hey 👋", "Hey there", "Hi!", "Hey, how’s it going?"],
  interest: ["Yeah", "Yep", "I am", "Yeah, you?"],
  smallTalk: ["NM, you?", "Not much, you?", "Just chilling. You?", "Nothing much. How about you?"],
} as const;

type ReplyProgress = { received: number; messageIds: string[]; photoSent?: boolean };

function answer(intent: Intent, user: StoredUser): string | undefined {
  const record = user.plusData?.customerImport;
  switch (intent) {
    case "greeting":
    case "interest":
    case "smallTalk": {
      const options = responsePools[intent];
      return options[Math.floor(Math.random() * options.length)];
    }
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
    const recipient = auth.getUser(message.toKey.slice(5));
    const sender = auth.getUser(message.fromKey.slice(5));
    if (!recipient || recipient.bannedAtMs || !sender?.emailVerified || sender.bannedAtMs ||
        !recipient.plusData?.customerImport?.completed || !recipient.plusData.customerImport.autoReplies) return;

    if (message.text.startsWith("GROUP_INVITE_")) return;
    const session = {
      sessionToken: recipient.id, userId: recipient.id, userType: recipient.userType, ageVerified: recipient.ageVerified,
      mode: "cruise" as const, tier: recipient.tier, plusExpiresAtMs: recipient.plusExpiresAtMs,
    };
    const history = chat.listMessages(session, "cruise", message.fromKey);
    const priorIncoming = history.ok ? history.value.filter(row =>
      row.fromKey === message.fromKey && row.messageId !== message.messageId && !row.text.startsWith("GROUP_INVITE_"),
    ).length : 0;
    const key = `${message.chatId}:${recipient.id}`;
    const eligible = await repository.update(state => {
      const progress = (state.settings.customerAutoReplyWindow ??= {}) as Record<string, ReplyProgress>;
      const legacy = (state.settings.customerAutoReplyIntents as Record<string, Intent[]> | undefined)?.[key] ?? [];
      const window = progress[key] ?? { received: Math.max(priorIncoming, legacy.length), messageIds: [], photoSent: legacy.includes("photo") };
      if (window.received >= 5 || window.messageIds.includes(message.messageId)) return false;
      const sendPhoto = intent === "photo" && !window.photoSent && Boolean(recipient.plusData?.customerImport?.photoUrl);
      progress[key] = { received: window.received + 1, messageIds: [...window.messageIds, message.messageId], photoSent: window.photoSent || sendPhoto };
      return Boolean(intent && (intent !== "photo" || sendPhoto));
    });
    if (!eligible || !intent) return;

    const current = auth.getUser(recipient.id);
    const reply = current && !current.bannedAtMs && current.plusData?.customerImport?.autoReplies
      ? answer(intent, current) : undefined;
    const sent = reply && chat.sendMessage(session, { chatKind: "cruise", toKey: message.fromKey, text: reply });
    if (sent && sent.ok) return sent.value;
    if (intent === "photo") await repository.update(state => {
      const progress = state.settings.customerAutoReplyWindow as Record<string, ReplyProgress>;
      progress[key].photoSent = false;
    });
  };
}
