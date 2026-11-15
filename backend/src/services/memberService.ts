import { DEFAULT_MEMBER, INTERESTS, INTENTS, PROFILE_PROMPTS, type MemberPreferences, type PublicMember, type PhotoVerification, type CommunityPlan } from "../../../shared/member";
import { hasPlus, type PlusIdentity } from "../../../shared/plus";
import { containsDisallowedKidVariation } from "./contentPolicy";
export class MemberError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
export function text(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || containsDisallowedKidVariation(value)) throw new MemberError("INVALID_INPUT", `${label} is required (maximum ${max} characters).`);
  return value.trim();
}
export function updateMember(current: MemberPreferences | undefined, input: unknown, identity: PlusIdentity, now = Date.now()): MemberPreferences {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new MemberError("INVALID_INPUT", "Invalid member preferences.");
  const p = input as Record<string, unknown>, next = { ...DEFAULT_MEMBER, ...current };
  if (p.intent !== undefined) {
    if (p.intent === "") { delete next.intent; delete next.intentExpiresAtMs; }
    else {
      if (typeof p.intent !== "string" || !Object.prototype.hasOwnProperty.call(INTENTS,p.intent) || typeof p.intentHours!=="number" || ![1,2,4,8].includes(p.intentHours)) throw new MemberError("INVALID_INPUT", "Choose a status and duration of 1, 2, 4, or 8 hours.");
      next.intent = p.intent as MemberPreferences["intent"]; next.intentExpiresAtMs = now + Number(p.intentHours) * 3600000;
    }
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
  for (const key of ["hideLocation", "incognito"] as const) if (p[key] !== undefined) {
    if(typeof p[key] !== "boolean") throw new MemberError("INVALID_INPUT", "Invalid privacy option.");
    if(key === "incognito" && p[key] && !hasPlus(identity,now)) throw new MemberError("PLUS_REQUIRED", "Off-grid browsing is included with Plus.",402);
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
export function publicMember(preferences: MemberPreferences | undefined, verification: PhotoVerification | undefined, mainPhotoMediaId?: string, now=Date.now()): PublicMember {
  const member={...DEFAULT_MEMBER,...preferences};
  return {interests:member.interests,prompts:member.prompts,...(member.intent && (member.intentExpiresAtMs ?? 0)>now ? {intent:member.intent,intentExpiresAtMs:member.intentExpiresAtMs} : {}),photoVerified:Boolean(mainPhotoMediaId && verification?.status === "approved" && verification.mainPhotoMediaId === mainPhotoMediaId)};
}
export function hidesDiscovery(member: MemberPreferences | undefined, identity: PlusIdentity): boolean { return member?.incognito === true && hasPlus(identity); }
export function hidesPresence(member: MemberPreferences | undefined, identity: PlusIdentity): boolean { return member?.hideLocation === true || hidesDiscovery(member,identity); }
export function makePlan(input: unknown, hostId: string, id: string, now=Date.now()): CommunityPlan {
  if(!input || typeof input !== "object") throw new MemberError("INVALID_INPUT","Invalid plan.");
  const p=input as Record<string,unknown>, start=Number(p.startsAtMs),end=Number(p.endsAtMs);
  if(!["Coffee","Nightlife","Outdoors","Community"].includes(String(p.category)) || !Number.isFinite(start) || !Number.isFinite(end) || start<=now || start>now+90*86400000 || end<=start || end>start+24*3600000) throw new MemberError("INVALID_INPUT","Choose a category and future time within 90 days, lasting up to 24 hours.");
  return {id,hostId,title:text(p.title,80,"Plan title"),description:text(p.description,1000,"Description"),city:text(p.city,80,"City"),venue:text(p.venue,120,"Public venue"),category:p.category as CommunityPlan["category"],startsAtMs:start,endsAtMs:end,createdAtMs:now,attendees:[hostId]};
}
