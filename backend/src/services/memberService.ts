import { DEFAULT_MEMBER, INTERESTS, INTENTS, PROFILE_PROMPTS, PROFILE_LINK_LABELS, type ProfileLinkPlatform, RIGHT_NOW_DURATIONS_MINUTES, RIGHT_NOW_DURATION_MS, isRightNow, type MemberPreferences, type PublicMember, type PhotoVerification, type CommunityPlan } from "../../../shared/member";
import { hasPlus, type PlusIdentity } from "../../../shared/plus";
import { containsDisallowedKidVariation } from "./contentPolicy";
export class MemberError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
export function text(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || containsDisallowedKidVariation(value)) throw new MemberError("INVALID_INPUT", `${label} is required (maximum ${max} characters).`);
  return value.trim();
}
const profileLinkHosts: Record<ProfileLinkPlatform, string> = {
  instagram: "instagram.com",
  onlyfans: "onlyfans.com",
  leolist: "leolist.cc",
  rentmen: "rentmen.com"
};

function normalizeProfileLink(platform: ProfileLinkPlatform, value: unknown): string {
  const host = profileLinkHosts[platform];
  const label = PROFILE_LINK_LABELS[platform];
  if (typeof value === "string" && value.length <= 500) {
    try {
      const url = new URL(value.trim());
      const profilePath = platform === "leolist"
        ? /^\/[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*\/?$/i
        : /^\/[a-z0-9_.-]{1,40}\/?$/i;
      if (url.protocol === "https:" && !url.username && !url.password && !url.port &&
          [host, `www.${host}`].includes(url.hostname) && profilePath.test(url.pathname)) {
        return `https://${host}${url.pathname.replace(/\/$/, "")}`;
      }
    } catch {
      // Return the same guidance for malformed URLs and unsupported hosts.
    }
  }
  throw new MemberError("INVALID_INPUT", `Enter a valid HTTPS ${label} profile URL.`);
}

export function currentMember(preferences: MemberPreferences | undefined, now = Date.now()): MemberPreferences {
  const member = { ...DEFAULT_MEMBER, ...preferences };
  if (!isRightNow(member.rightNowExpiresAtMs, now)) {
    delete member.rightNowStartsAtMs;
    delete member.rightNowExpiresAtMs;
  }
  return member;
}

export function updateMember(current: MemberPreferences | undefined, input: unknown, identity: PlusIdentity, now = Date.now()): MemberPreferences {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new MemberError("INVALID_INPUT", "Invalid member preferences.");
  const p = input as Record<string, unknown>, next = currentMember(current, now);
  const scheduled = (next.rightNowStartsAtMs ?? 0) > now;
  const minutes = p.rightNowDurationMinutes;
  let durationMs = RIGHT_NOW_DURATION_MS;
  if (minutes !== undefined) {
    if (!RIGHT_NOW_DURATIONS_MINUTES.some(option => option === minutes) || (p.rightNow !== true && p.rightNowStartsAtMs === undefined)) {
      throw new MemberError("INVALID_INPUT", "Choose a Right Now duration of 15, 30, 60, or 120 minutes.");
    }
    durationMs = Number(minutes) * 60_000;
  }
  if (p.rightNowStartsAtMs !== undefined) {
    const start = p.rightNowStartsAtMs;
    if (p.rightNow !== undefined || typeof start !== "number" || !Number.isSafeInteger(start) ||
        start <= now || !Number.isFinite(new Date(start + durationMs).getTime())) {
      throw new MemberError("INVALID_INPUT", "Choose a future start time for Right Now.");
    }
    if (next.rightNowExpiresAtMs !== undefined && !scheduled) {
      throw new MemberError("RIGHT_NOW_ACTIVE", "Turn off your active Right Now window before scheduling another.", 409);
    }
    next.rightNowStartsAtMs = start;
    next.rightNowExpiresAtMs = start + durationMs;
  } else if (p.rightNow !== undefined) {
    if (typeof p.rightNow !== "boolean") throw new MemberError("INVALID_INPUT", "Choose whether you are available right now.");
    if (!p.rightNow) {
      delete next.rightNowStartsAtMs;
      delete next.rightNowExpiresAtMs;
    } else if (scheduled || next.rightNowExpiresAtMs === undefined) {
      delete next.rightNowStartsAtMs;
      next.rightNowExpiresAtMs = now + durationMs;
    }
  }
  if (p.intent !== undefined) {
    if (p.intent === "") { delete next.intent; delete next.intentExpiresAtMs; }
    else {
      if (typeof p.intent !== "string" || !Object.prototype.hasOwnProperty.call(INTENTS,p.intent) || typeof p.intentHours!=="number" || ![1,2,4,8].includes(p.intentHours)) throw new MemberError("INVALID_INPUT", "Choose a status and duration of 1, 2, 4, or 8 hours.");
      next.intent = p.intent as MemberPreferences["intent"]; next.intentExpiresAtMs = now + Number(p.intentHours) * 3600000;
    }
  }
  if (p.profileLinks !== undefined) {
    if (!p.profileLinks || typeof p.profileLinks !== "object" || Array.isArray(p.profileLinks)) {
      throw new MemberError("INVALID_INPUT", "Invalid profile links.");
    }
    const links = { ...next.profileLinks };
    for (const [platform, input] of Object.entries(p.profileLinks)) {
      if (!Object.prototype.hasOwnProperty.call(PROFILE_LINK_LABELS, platform)) {
        throw new MemberError("INVALID_INPUT", "Unsupported profile link.");
      }
      const key = platform as ProfileLinkPlatform;
      if (input === null) {
        delete links[key];
      } else {
        if (typeof input !== "object" || Array.isArray(input)) throw new MemberError("INVALID_INPUT", "Invalid profile link.");
        const { url, visible } = input as Record<string, unknown>;
        if (visible !== undefined && typeof visible !== "boolean") {
          throw new MemberError("INVALID_INPUT", "Choose who can see the profile link.");
        }
        links[key] = { url: normalizeProfileLink(key, url), visible: visible === true };
      }
    }
    next.profileLinks = links;
  }
  if (p.interests !== undefined) {
    if (!Array.isArray(p.interests) || p.interests.length > 8 || p.interests.some(i => !(INTERESTS as readonly unknown[]).includes(i))) throw new MemberError("INVALID_INPUT", "Choose up to 8 interests.");
    next.interests = [...new Set(p.interests)] as string[];
  }
  if (p.prompts !== undefined) {
    if (!Array.isArray(p.prompts) || p.prompts.length > 3) throw new MemberError("INVALID_INPUT", "Add up to 3 profile prompts.");
    next.prompts = p.prompts.map(item => {
      if (!item || typeof item !== "object" || !PROFILE_PROMPTS.includes(item.prompt)) throw new MemberError("INVALID_INPUT", "Choose a profile prompt.");
      return { prompt:item.prompt, answer:text(item.answer,180,"Prompt answer") };
    });
    if(new Set(next.prompts.map(p=>p.prompt)).size !== next.prompts.length) throw new MemberError("INVALID_INPUT", "Choose different prompts.");
  }
  for (const key of ["hideLocation", "hideProfile", "incognito"] as const) if (p[key] !== undefined) {
    if(typeof p[key] !== "boolean") throw new MemberError("INVALID_INPUT", "Invalid privacy option.");
    next[key] = p[key] as boolean;
  }
  if(p.discovery !== undefined) {
    if(!hasPlus(identity,now)) throw new MemberError("PLUS_REQUIRED","Remembered discovery preferences are included with Plus.",402);
    const d=p.discovery as Record<string,unknown>;
    if(!d || typeof d !== "object" || !(d.intent === "" || typeof d.intent === "string" && Object.prototype.hasOwnProperty.call(INTENTS,d.intent)) || !(d.interest === "" || (INTERESTS as readonly unknown[]).includes(d.interest)) || typeof d.verifiedOnly !== "boolean") throw new MemberError("INVALID_INPUT","Invalid discovery preferences.");
    next.discovery=d as MemberPreferences["discovery"];
  }
  return next;
}
export function publicMember(preferences: MemberPreferences | undefined, verification: PhotoVerification | undefined, mainPhotoMediaId?: string, now=Date.now(), includeProfileLinks = false): PublicMember {
  const member=currentMember(preferences, now);
  const profileLinks = includeProfileLinks && !member.hideProfile && !member.incognito
    ? Object.fromEntries(Object.entries(member.profileLinks ?? {})
      .filter(([, link]) => link.visible === true).map(([platform, link]) => [platform, link.url]))
    : {};
  const activeRightNow = (member.rightNowStartsAtMs ?? 0) <= now && member.rightNowExpiresAtMs !== undefined;
  return {interests:member.interests,prompts:member.prompts,...(Object.keys(profileLinks).length ? {profileLinks} : {}),...(activeRightNow ? {rightNowExpiresAtMs:member.rightNowExpiresAtMs} : {}),...(member.intent && (member.intentExpiresAtMs ?? 0)>now ? {intent:member.intent,intentExpiresAtMs:member.intentExpiresAtMs} : {}),photoVerified:Boolean(mainPhotoMediaId && verification?.status === "approved" && verification.mainPhotoMediaId === mainPhotoMediaId)};
}
export function hidesDiscovery(member: MemberPreferences | undefined, identity: PlusIdentity): boolean { return member?.hideProfile === true || member?.incognito === true; }
export function hidesPresence(member: MemberPreferences | undefined, identity: PlusIdentity): boolean { return member?.hideLocation === true || hidesDiscovery(member,identity); }
export function makePlan(input: unknown, hostId: string, id: string, now=Date.now()): CommunityPlan {
  if(!input || typeof input !== "object") throw new MemberError("INVALID_INPUT","Invalid plan.");
  const p=input as Record<string,unknown>, start=Number(p.startsAtMs),end=Number(p.endsAtMs);
  if(!["Coffee","Nightlife","Outdoors","Community"].includes(String(p.category)) || !Number.isFinite(start) || !Number.isFinite(end) || start<=now || start>now+90*86400000 || end<=start || end>start+24*3600000) throw new MemberError("INVALID_INPUT","Choose a category and future time within 90 days, lasting up to 24 hours.");
  return {id,hostId,title:text(p.title,80,"Plan title"),description:text(p.description,1000,"Description"),city:text(p.city,80,"City"),venue:text(p.venue,120,"Public venue"),category:p.category as CommunityPlan["category"],startsAtMs:start,endsAtMs:end,createdAtMs:now,attendees:[hostId]};
}
