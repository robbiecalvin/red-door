import { DEFAULT_MEMBER, PROFILE_PROMPTS, RIGHT_NOW_DURATION_MS } from "../shared/member";
import { currentMember, publicMember, updateMember, hidesPresence, hidesDiscovery, makePlan } from "../backend/src/services/memberService";
import { validPushSubscription } from "../backend/src/services/pushService";
import { createCommunityRepository } from "../backend/src/repositories/communityRepository";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
const free={userType:"registered",tier:"free"},plus={userType:"registered",tier:"premium"},now=1700000000000;
describe("Member discovery, privacy, and plans",()=>{
  it("expires temporary intent without extending it on unrelated profile changes",()=>{
    const p=updateMember(undefined,{intent:"tonight",intentHours:2},free,now);
    const changed=updateMember(p,{interests:["Coffee"]},free,now+1000);
    expect(changed.intentExpiresAtMs).toBe(now+7200000);
    expect(publicMember(changed,undefined,undefined,now+7199999).intent).toBe("tonight");
    expect(publicMember(changed,undefined,undefined,now+7200000).intent).toBeUndefined();
  });
  it.each([0,0.5,24,-1])("rejects an unsupported intent duration %s",intentHours=>expect(()=>updateMember(undefined,{intent:"tonight",intentHours},free,now)).toThrow());
  it("expires Right Now at the same time for public discovery and member settings", () => {
    const available = updateMember(undefined, { rightNow: true, rightNowExpiresAtMs: now + 86400000 }, free, now);
    const expiry = now + RIGHT_NOW_DURATION_MS;
    expect(available.rightNowExpiresAtMs).toBe(expiry);
    expect(updateMember(available, { rightNow: true }, free, now + 1000).rightNowExpiresAtMs).toBe(expiry);
    expect(updateMember(available, { interests: ["Coffee"] }, free, now + 1000).rightNowExpiresAtMs).toBe(expiry);
    expect(publicMember(available, undefined, undefined, expiry - 1).rightNowExpiresAtMs).toBe(expiry);
    expect(publicMember(available, undefined, undefined, expiry)).not.toHaveProperty("rightNowExpiresAtMs");
    expect(currentMember(available, expiry)).not.toHaveProperty("rightNowExpiresAtMs");
    expect(updateMember(available, { rightNow: false }, free, now + 1000)).not.toHaveProperty("rightNowExpiresAtMs");
    expect(updateMember(available, { rightNow: true }, free, expiry).rightNowExpiresAtMs).toBe(expiry + RIGHT_NOW_DURATION_MS);
    expect(() => updateMember(undefined, { rightNow: "true" }, free, now)).toThrow();
  });
  it("keeps a scheduled window private until it starts and expires it even without a client", () => {
    const start = now + 7200000;
    const end = start + RIGHT_NOW_DURATION_MS;
    const schedule = updateMember(undefined, { rightNowStartsAtMs: start }, free, now);
    expect(schedule).toMatchObject({ rightNowStartsAtMs: start, rightNowExpiresAtMs: end });
    expect(currentMember(schedule, start - 1)).toHaveProperty("rightNowStartsAtMs", start);
    expect(publicMember(schedule, undefined, undefined, start - 1)).not.toHaveProperty("rightNowExpiresAtMs");
    expect(publicMember(schedule, undefined, undefined, start)).toHaveProperty("rightNowExpiresAtMs", end);
    expect(publicMember(schedule, undefined, undefined, start)).not.toHaveProperty("rightNowStartsAtMs");
    expect(publicMember(schedule, undefined, undefined, end)).not.toHaveProperty("rightNowExpiresAtMs");
    expect(currentMember(schedule, end)).not.toHaveProperty("rightNowStartsAtMs");
    expect(updateMember(schedule, { rightNowStartsAtMs: start + 1000 }, free, now).rightNowStartsAtMs).toBe(start + 1000);
    expect(updateMember(schedule, { rightNow: false }, free, now)).not.toHaveProperty("rightNowExpiresAtMs");
    expect(updateMember(schedule, { rightNow: true }, free, now)).toHaveProperty("rightNowExpiresAtMs", now + RIGHT_NOW_DURATION_MS);
    expect(updateMember(schedule, { rightNow: true }, free, now)).not.toHaveProperty("rightNowStartsAtMs");
    expect(() => updateMember(schedule, { rightNowStartsAtMs: end + 1000 }, free, start)).toThrow(/active/);
    for (const invalid of [now, now - 1, Infinity, "tomorrow", 8640000000000000]) {
      expect(() => updateMember(undefined, { rightNowStartsAtMs: invalid }, free, now)).toThrow(/future/);
    }
  });
  it("keeps profile links private by default and handles platforms independently", () => {
    const saved = updateMember(undefined, { profileLinks: {
      instagram: { url: "https://www.instagram.com/member/?tracking=removed" },
      onlyfans: { url: "https://onlyfans.com/member", visible: true }
    } }, free, now);
    expect(saved.profileLinks?.instagram).toEqual({ url: "https://instagram.com/member", visible: false });
    expect(publicMember(saved, undefined, undefined, now)).not.toHaveProperty("profileLinks");
    expect(publicMember(saved, undefined, undefined, now, true).profileLinks).toEqual({ onlyfans: "https://onlyfans.com/member" });
    expect(publicMember({ ...saved, hideProfile: true }, undefined, undefined, now, true)).not.toHaveProperty("profileLinks");
    expect(updateMember(saved, { profileLinks: { onlyfans: null } }, free, now).profileLinks).toEqual({ instagram: saved.profileLinks?.instagram });
    for (const url of ["http://instagram.com/member", "https://instagram.com.example/member", "https://name@instagram.com/member", "javascript:alert(1)"]) {
      expect(() => updateMember(saved, { profileLinks: { instagram: { url, visible: true } } }, free, now)).toThrow(/HTTPS Instagram/);
    }
  });
  it("clears intent immediately",()=>{const p=updateMember(undefined,{intent:"chatting",intentHours:1},free,now);expect(updateMember(p,{intent:""},free,now).intentExpiresAtMs).toBeUndefined();});
  it("validates interests and prompts and strips client claims of verification",()=>{
    const p=updateMember(undefined,{interests:["Coffee","Coffee"],prompts:[{prompt:PROFILE_PROMPTS[0],answer:"Ask about my dog."}],photoVerified:true},free,now);
    expect(p.interests).toEqual(["Coffee"]);expect(publicMember(p,undefined,"photo").photoVerified).toBe(false);
    expect(()=>updateMember(p,{interests:["not an interest"]},free,now)).toThrow();
    expect(()=>updateMember(p,{prompts:[{prompt:PROFILE_PROMPTS[0],answer:"x".repeat(181)}]},free,now)).toThrow();
    expect(()=>updateMember(p,{prompts:[{prompt:PROFILE_PROMPTS[0],answer:"One"},{prompt:PROFILE_PROMPTS[0],answer:"Two"}]},free,now)).toThrow();
  });
  it("keeps profile/location hiding free and gates remembered discovery preferences",()=>{
    expect(hidesPresence(updateMember(undefined,{hideLocation:true},free),free)).toBe(true);
    expect(hidesDiscovery(updateMember(undefined,{hideProfile:true},free),free)).toBe(true);
    expect(()=>updateMember(undefined,{discovery:{intent:"",interest:"Coffee",verifiedOnly:false}},free)).toThrow("Plus");
    const hidden=updateMember(undefined,{incognito:true},plus);
    expect(hidesDiscovery(hidden,plus)).toBe(true);
    expect(hidesPresence(hidden,plus)).toBe(true);
    expect(hidesDiscovery(hidden,{...plus,plusExpiresAtMs:1})).toBe(true);
    expect(hidesDiscovery(hidden,free)).toBe(true);
    expect(updateMember(hidden,{incognito:false},free).incognito).toBe(false);
  });
  it("keeps the review badge bound to the reviewed main photo",()=>{
    const v={status:"approved" as const,challenge:"ABC123",expiresAtMs:now,mainPhotoMediaId:"one"};
    expect(publicMember(undefined,v,"one").photoVerified).toBe(true);
    expect(publicMember(undefined,v,"two").photoVerified).toBe(false);
    expect(publicMember(undefined,{...v,status:"pending"},"one").photoVerified).toBe(false);
    expect(Object.keys(publicMember(DEFAULT_MEMBER,v,"one"))).not.toContain("challenge");
  });
  it("validates plan dates, description size, category, and public venue",()=>{
    const input={title:"Coffee together",description:"A friendly hello",city:"Vancouver",venue:"A public café",category:"Coffee",startsAtMs:now+1000,endsAtMs:now+7200000};
    expect(makePlan(input,"host","id",now).attendees).toEqual(["host"]);
    for(const bad of [{startsAtMs:now-1},{endsAtMs:now+48*3600000},{venue:""},{category:"invalid"},{description:"x".repeat(1001)}])expect(()=>makePlan({...input,...bad},"host","id",now)).toThrow();
  });
  it("serializes concurrent writes and persists plans and private settings across restarts",async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"community-test-")),file=path.join(dir,"state.json");try{
      const repo=await createCommunityRepository(null,file);await Promise.all(Array.from({length:10},(_,n)=>repo.update(s=>{s.settings[String(n)]=n;})));
      const second=await createCommunityRepository(null,file);expect(await second.setting("5",()=>99)).toBe(5);
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  });
  it("accepts supported encrypted push endpoints and rejects arbitrary or malformed destinations",()=>{
    const good={endpoint:"https://fcm.googleapis.com/fcm/send/test",keys:{p256dh:"a".repeat(87),auth:"b".repeat(22)}};
    expect(validPushSubscription(good)).toBe(true);
    for(const endpoint of ["http://fcm.googleapis.com/test","https://127.0.0.1/test","https://fcm.googleapis.com.evil.test/test","https://fcm.googleapis.com:8443/test"])expect(validPushSubscription({...good,endpoint})).toBe(false);
    expect(validPushSubscription({...good,keys:{}})).toBe(false);
  });
});
