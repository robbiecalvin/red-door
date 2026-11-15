import { DEFAULT_MEMBER, PROFILE_PROMPTS } from "../shared/member";
import { publicMember, updateMember, hidesPresence, hidesDiscovery, makePlan } from "../backend/src/services/memberService";
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
  it("clears intent immediately",()=>{const p=updateMember(undefined,{intent:"chatting",intentHours:1},free,now);expect(updateMember(p,{intent:""},free,now).intentExpiresAtMs).toBeUndefined();});
  it("validates interests and prompts and strips client claims of verification",()=>{
    const p=updateMember(undefined,{interests:["Coffee","Coffee"],prompts:[{prompt:PROFILE_PROMPTS[0],answer:"Ask about my dog."}],photoVerified:true},free,now);
    expect(p.interests).toEqual(["Coffee"]);expect(publicMember(p,undefined,"photo").photoVerified).toBe(false);
    expect(()=>updateMember(p,{interests:["not an interest"]},free,now)).toThrow();
    expect(()=>updateMember(p,{prompts:[{prompt:PROFILE_PROMPTS[0],answer:"x".repeat(181)}]},free,now)).toThrow();
    expect(()=>updateMember(p,{prompts:[{prompt:PROFILE_PROMPTS[0],answer:"One"},{prompt:PROFILE_PROMPTS[0],answer:"Two"}]},free,now)).toThrow();
  });
  it("keeps location hiding free and gates only off-grid browsing and remembered preferences",()=>{
    expect(hidesPresence(updateMember(undefined,{hideLocation:true},free),free)).toBe(true);
    expect(()=>updateMember(undefined,{incognito:true},free)).toThrow("Plus");
    expect(()=>updateMember(undefined,{discovery:{intent:"",interest:"Coffee",verifiedOnly:false}},free)).toThrow("Plus");
    const hidden=updateMember(undefined,{incognito:true},plus);
    expect(hidesDiscovery(hidden,plus)).toBe(true);
    expect(hidesPresence(hidden,plus)).toBe(true);
    expect(hidesDiscovery(hidden,{...plus,plusExpiresAtMs:1})).toBe(false);
    expect(hidesDiscovery(hidden,free)).toBe(false);
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
