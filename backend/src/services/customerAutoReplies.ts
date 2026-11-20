import type { CommunityRepository } from "../repositories/communityRepository";
import type { AuthService, StoredUser } from "./authService";
import type { ChatMessage, ChatService } from "./chatService";
import { hidesPresence } from "./memberService";
import { customerScheduledLocation, customerScheduleWindow } from "./customerSchedule";

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
      const scheduled = customerScheduledLocation(record?.scheduledLocations);
      if (record?.scheduledLocations?.length && (!scheduled || !customerScheduleWindow(user.id, record.onlineMinutesPerDay ?? 0, Date.now()))) return;
      const location = scheduled?.area ?? [record?.neighbourhood, record?.city].filter(Boolean).join(", ");
      return location ? `${location}. What area are you in?` : undefined;
    }
    case "photo": return record?.photoUrl ? `Photo: ${record.photoUrl}` : undefined;
  }
}

type PendingReply = {
  key: string; fromKey: string; recipientId: string; intent: ReplyIntent; question: string; dueAt: number; expiresAt: number;
  readGapMs?: number; readAtMs?: number; sequence?: number;
};
const queueKey = "customerAutoReplyQueue";

function recipientSession(recipient: StoredUser) {
  return {
    sessionToken: recipient.id, userId: recipient.id, userType: recipient.userType, ageVerified: recipient.ageVerified,
    mode: "cruise" as const, tier: recipient.tier, plusExpiresAtMs: recipient.plusExpiresAtMs,
  };
}

export function createCustomerAutoReplies(
  auth: AuthService, chat: ChatService, repository: CommunityRepository,
  { now = Date.now, random = Math.random }: { now?: () => number; random?: () => number } = {},
) {
  let draining = false;
  async function schedule(message: ChatMessage): Promise<void> {
    if (!message.fromKey.startsWith("user:") || !message.toKey.startsWith("user:") || message.chatKind !== "cruise" ||
        message.text.startsWith("GROUP_INVITE_")) return;
    const text = message.text.trim().replace(/[’']/g, "").replace(/\s+/g, " ");
    const question = text.replace(/^(?:hey|hi|hello)[,!.] +/i, "");
    const matched = (Object.keys(intents) as Intent[]).find(key => intents[key].test(question));
    const recipient = auth.getUser(message.toKey.slice(5));
    const sender = auth.getUser(message.fromKey.slice(5));
    if (!recipient || recipient.bannedAtMs || !sender?.emailVerified || sender.bannedAtMs ||
        !recipient.plusData?.customerImport?.completed || !recipient.plusData.customerImport.autoReplies) return;

    const history = chat.listMessages(recipientSession(recipient), "cruise", message.fromKey);
    const priorIncoming = history.ok ? history.value.filter(row =>
      row.fromKey === message.fromKey && row.messageId !== message.messageId && !row.text.startsWith("GROUP_INVITE_"),
    ).length : 0;
    const protectedIntent = matched === "photo" || matched === "location" || matched === "rightNow";
    const configured = !protectedIntent && customRule(recipient, question) ? "custom" : matched;
    const key = `${message.chatId}:${recipient.id}`;
    await repository.update(state => {
      const progress = (state.settings.customerAutoReplyWindow ??= {}) as Record<string, ReplyProgress>;
      const pending = (state.settings[queueKey] ??= []) as PendingReply[];
      const legacy = (state.settings.customerAutoReplyIntents as Record<string, Intent[]> | undefined)?.[key] ?? [];
      const window = progress[key] ?? { received: Math.max(priorIncoming, legacy.length), messageIds: [], photoSent: legacy.includes("photo") };
      if (endConversation.test(question)) {
        progress[key] = { ...window, stopped: true };
        state.settings[queueKey] = pending.filter(job => job.key !== key);
        return;
      }
      if (window.stopped || window.received >= MESSAGE_LIMIT || window.messageIds.includes(message.messageId)) return;
      const previous = window.lastIntent;
      const intent: ReplyIntent | undefined = configured ??
        (briefAgreement.test(question) && (previous === "plans" || previous === "availability") ? "followUp" : undefined);
      const sendPhoto = intent === "photo" && !window.photoSent && Boolean(recipient.plusData?.customerImport?.photoUrl);
      const enqueue = intent && (intent !== "photo" || sendPhoto) && answer(intent, recipient, question);
      progress[key] = { ...window, received: window.received + 1, messageIds: [...window.messageIds, message.messageId],
        photoSent: window.photoSent || sendPhoto, lastIntent: enqueue ? intent : previous,
      };
      if (!enqueue || !intent) return;
      const time = now();
      const previousDue = pending.filter(job => job.key === key).reduce((latest, job) => Math.max(latest, job.dueAt), 0);
      const dueAt = Math.max(previousDue, time + 20_000 + Math.floor(random() * 3_560_000));
      pending.push({ key, fromKey: message.fromKey, recipientId: recipient.id, intent, question, dueAt, expiresAt: time + 3_600_000,
        readGapMs: 5_000 + Math.floor(random() * 10_001), sequence: window.received + 1 });
    });
  }

  function nextActionAt(job: PendingReply): number {
    const gap = job.readGapMs ?? 5_000;
    return job.readAtMs === undefined ? job.dueAt - gap : Math.max(job.dueAt, job.readAtMs + gap);
  }

  async function drain(deliver: (reply: ChatMessage) => void, notifyRead: (actorKey: string, otherKey: string) => void) {
    if (draining) return;
    draining = true;
    try {
      const time = now();
      const waiting = await repository.readSetting<PendingReply[]>(queueKey);
      if (!waiting?.some(job => nextActionAt(job) <= time || job.expiresAt < time)) return;
      const due = await repository.update(state => {
        const pending = (state.settings[queueKey] ?? []) as PendingReply[];
        const blockedBy = new Map<string, number>();
        for (const job of pending) {
          if (job.expiresAt < time || (job.readAtMs !== undefined && nextActionAt(job) <= time)) continue;
          blockedBy.set(job.key, Math.min(blockedBy.get(job.key) ?? Infinity, job.sequence ?? 0));
        }
        const ready = new Set(pending.filter(job => job.expiresAt < time || (nextActionAt(job) <= time &&
          (job.readAtMs === undefined || (job.sequence ?? 0) <= (blockedBy.get(job.key) ?? Infinity)))));
        state.settings[queueKey] = pending.filter(job => !ready.has(job));
        return [...ready].sort((a, b) => a.dueAt - b.dueAt || (a.sequence ?? 0) - (b.sequence ?? 0));
      });
      for (const job of due) {
        const recipient = auth.getUser(job.recipientId);
        const sender = auth.getUser(job.fromKey.slice(5));
        const progress = await repository.readSetting<Record<string, ReplyProgress>>("customerAutoReplyWindow");
        const reply = now() <= job.expiresAt && recipient && !recipient.bannedAtMs && sender?.emailVerified && !sender.bannedAtMs &&
          !progress?.[job.key]?.stopped && recipient.plusData?.customerImport?.autoReplies
          ? answer(job.intent, recipient, job.question) : undefined;
        if (reply && recipient) {
          const session = recipientSession(recipient);
          if (job.readAtMs === undefined) {
            const readAtMs = now();
            if (readAtMs + (job.readGapMs ?? 5_000) <= job.expiresAt &&
                chat.markRead(session, "cruise", job.fromKey).ok) {
              await repository.update(state => {
                const byThread = state.settings.customerAutoReplyWindow as Record<string, ReplyProgress>;
                if (byThread[job.key]?.stopped) return;
                (state.settings[queueKey] as PendingReply[]).push({ ...job, readAtMs });
              });
              notifyRead(`user:${recipient.id}`, job.fromKey);
              continue;
            }
          } else {
            const sent = chat.sendMessage(session, { chatKind: "cruise", toKey: job.fromKey, text: reply });
            if (sent.ok) {
              deliver(sent.value);
              continue;
            }
          }
        }
        if (job.intent === "photo") await repository.update(state => {
          const progress = state.settings.customerAutoReplyWindow as Record<string, ReplyProgress>;
          if (progress[job.key]) progress[job.key].photoSent = false;
        });
      }
    } finally {
      draining = false;
    }
  }

  return { schedule, drain };
}
