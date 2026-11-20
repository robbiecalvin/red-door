import type { CommunityRepository } from "../repositories/communityRepository";
import type { AuthService, StoredUser } from "./authService";
import type { ChatMessage, ChatService } from "./chatService";
import { hidesPresence } from "./memberService";
import { customerScheduleWindow } from "./customerSchedule";

const intents = {
  rightNow: /^(?:right now|r u free rn|can you meet right now|meet right now)[.!? ]*$/i,
  greeting: /^(?:h+i+|hey+|hello|hiya|yo|howdy|heya|good (?:morning|afternoon|evening))\b(?: handsome| man| there| babe| cutie)?[.!?\s]*$/i,
  interest: /^(?:(?:hey|hi)[,! ]+)?(?:are (?:you|u) |you |u )?(?:(?:still )?looking(?:\s+(?:right now|tonight|now|rn|to meet))?|horny(?:\s+(?:right now|tonight|now|rn))?)[.!?\s]*$/i,
  smallTalk: /^(?:sup|wsup|wassup|whats up|what are (?:you|u) up to|wyd|how(?:s it going| are you| are u))[.!?\s]*$/i,
  location: /^(?:location|where(?: are)? (?:you|u)(?: at| located)?|whereabouts|where(?: are)? (?:you|u) (?:based|from)|where do you live|what neighbourhood)[.!?\s]*$/i,
  plans: /^(?:wanna |want to |would you like to |can we |should we |lets )?(?:meet(?: up)?|hang(?: out)?|grab (?:a )?(?:coffee|drink)|go for (?:a )?walk)(?: (?:sometime|tonight|this weekend))?[.!? ]*$/i,
  availability: /^(?:(?:are )?(?:you |u )?(?:free|around|available)(?: (?:now|tonight|later|this weekend))?|when (?:are )?(?:you|u) free)[.!? ]*$/i,
  interests: /^(?:what (?:are )?(?:you|u) into|what do (?:you|u) do for fun|what are your hobbies|what kind of music do you like)[.!? ]*$/i,
  thanks: /^(?:thanks|thank you|thx|ty)(?: for (?:the pic|the photo|sharing))?[.!? ]*$/i,
  photo: /^(?:(?:do you have|have you got|you got|got|any|send(?: me)?|can (?:i see|you send))\s+)?(?:a |some )?(?:pics?|photos?|pictures?)(?: please)?[.!?\s]*$/i,
};
type Intent = keyof typeof intents;

const responsePools = {
  greeting: ["Hey 👋", "Hey there", "Hi!", "Hey, how’s it going?"],
  interest: ["Yeah", "Yep", "I am", "Yeah, you?"],
  smallTalk: ["NM, you? What are you up to?", "Not much. How’s your night going?", "Just chilling. Got anything fun planned?"],
  plans: ["What did you have in mind? A coffee or a walk could be a good first meet.", "What kind of meetup were you thinking? Somewhere public works as a starting point."],
  availability: ["What time were you thinking? I’d need to confirm before making a plan.", "Which day works for you? Let’s figure out the details here."],
  interests: ["What do you get up to when you’ve got an afternoon free?", "What’s something you could talk about for hours?"],
  thanks: ["Of course.", "You’re welcome 🙂"],
  followUp: ["What would you like to do?", "Want to suggest a neighbourhood or a time?"],

} as const;

const MESSAGE_LIMIT = 12;
const endConversation = /^(?:no thanks|not interested|please stop|stop(?: messaging me)?|dont message me|goodbye|bye)[.!? ]*$/i;
const briefAgreement = /^(?:yeah|yes|yep|sure|sounds good|im down|works for me|lets do it)[.!? ]*$/i;
type ReplyIntent = Intent | "followUp" | "custom";
type ReplyProgress = { received: number; messageIds: string[]; photoSent?: boolean; lastIntent?: ReplyIntent; stopped?: boolean };

const normalizedTrigger = (value: string) => value.toLowerCase().trim().replace(/[’']/g, "").replace(/\s+/g, " ").replace(/[.!? ]+$/, "");
function customRule(user: StoredUser, question: string) {
  const text = normalizedTrigger(question);
  return user.plusData?.customerImport?.facilitatedReplies?.find(rule =>
    rule.triggers.some(trigger => normalizedTrigger(trigger) === text));
}

function answer(intent: ReplyIntent, user: StoredUser, question: string): string | undefined {
  const record = user.plusData?.customerImport;
  switch (intent) {
    case "custom": {
      const options = customRule(user, question)?.replies;
      return options?.[Math.floor(Math.random() * options.length)];
    }
    case "rightNow": {
      if (!record?.rightNowTrigger || record.onlineMinutesPerDay === undefined ||
          !customerScheduleWindow(user.id, record.onlineMinutesPerDay, Date.now())) return;
      return "What did you have in mind? Let’s confirm the details here.";
    }
    case "greeting":
    case "interest":
    case "smallTalk":
    case "plans":
    case "availability":
    case "thanks":
    case "followUp": {
      const options = responsePools[intent];
      return options[Math.floor(Math.random() * options.length)];
    }
    case "interests": {
      const interests = user.plusData?.member?.interests.slice(0, 2) ?? [];
      if (interests.length) return `I’m into ${interests.map(value => value.toLowerCase()).join(" and ")}. What about you?`;
      const options = responsePools.interests;
      return options[Math.floor(Math.random() * options.length)];
    }
    case "location": {
      if (hidesPresence(user.plusData?.member, user)) return;
      const location = [record?.neighbourhood, record?.city].filter(Boolean).join(", ");
      return location ? `${location}. What area are you in?` : undefined;
    }
    case "photo": return record?.photoUrl ? `Photo: ${record.photoUrl}` : undefined;
  }
}

export function createCustomerAutoReplies(auth: AuthService, chat: ChatService, repository: CommunityRepository) {
  return async (message: ChatMessage): Promise<ChatMessage | undefined> => {
    if (!message.fromKey.startsWith("user:") || !message.toKey.startsWith("user:") || message.chatKind !== "cruise") return;
    const text = message.text.trim().replace(/[’']/g, "").replace(/\s+/g, " ");
    const question = text.replace(/^(?:hey|hi|hello)[,!.] +/i, "");
    const matched = (Object.keys(intents) as Intent[]).find(key => intents[key].test(question));
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
    const protectedIntent = matched === "photo" || matched === "location" || matched === "rightNow";
    const configured = !protectedIntent && customRule(recipient, question) ? "custom" : matched;
    const key = `${message.chatId}:${recipient.id}`;
    const intent = await repository.update(state => {
      const progress = (state.settings.customerAutoReplyWindow ??= {}) as Record<string, ReplyProgress>;
      const legacy = (state.settings.customerAutoReplyIntents as Record<string, Intent[]> | undefined)?.[key] ?? [];
      const window = progress[key] ?? { received: Math.max(priorIncoming, legacy.length), messageIds: [], photoSent: legacy.includes("photo") };
      if (window.stopped || window.received >= MESSAGE_LIMIT || window.messageIds.includes(message.messageId)) return;
      const stopped = endConversation.test(question);
      const previous = window.lastIntent;
      const intent: ReplyIntent | undefined = stopped ? undefined : configured ??
        (briefAgreement.test(question) && (previous === "plans" || previous === "availability") ? "followUp" : undefined);
      const sendPhoto = intent === "photo" && !window.photoSent && Boolean(recipient.plusData?.customerImport?.photoUrl);
      progress[key] = { ...window, received: window.received + 1, messageIds: [...window.messageIds, message.messageId],
        stopped, photoSent: window.photoSent || sendPhoto,
      };
      return intent !== "photo" || sendPhoto ? intent : undefined;
    });
    if (!intent) return;

    const current = auth.getUser(recipient.id);
    const reply = current && !current.bannedAtMs && current.plusData?.customerImport?.autoReplies
      ? answer(intent, current, question) : undefined;
    const sent = reply && chat.sendMessage(session, { chatKind: "cruise", toKey: message.fromKey, text: reply });
    if (sent && sent.ok) {
      await repository.update(state => {
        const progress = state.settings.customerAutoReplyWindow as Record<string, ReplyProgress>;
        progress[key].lastIntent = intent;
      });
      return sent.value;
    }
    if (intent === "photo") await repository.update(state => {
      const progress = state.settings.customerAutoReplyWindow as Record<string, ReplyProgress>;
      progress[key].photoSent = false;
    });
  };
}
