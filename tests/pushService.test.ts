import webpush from "web-push";
import { createPushService } from "../backend/src/services/pushService";
import { createCommunityRepository } from "../backend/src/repositories/communityRepository";
import { createAuthService } from "../backend/src/services/authService";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
describe("Discreet browser push",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"push-test-"));
  afterAll(()=>{fs.rmSync(dir,{recursive:true,force:true});jest.restoreAllMocks();});
  it("persists its signing key, sends no message content, and removes expired device subscriptions",async()=>{
    const repo=await createCommunityRepository(null,path.join(dir,"community.json"));
    const auth=createAuthService({jwtSecret:"test-only",userStoreFilePath:path.join(dir,"auth.json")});
    const created=auth.adminCreateUser("push@example.com","Test-password123!",null,"registered","free","user");if(!created.ok)throw new Error("Expected test user");
    const subscription={endpoint:"https://fcm.googleapis.com/fcm/send/test-only",keys:{p256dh:"a".repeat(87),auth:"b".repeat(22)}};
    auth.updatePlus(created.value.id,{plusData:{pushSubscriptions:[subscription]}});
    const service=await createPushService(repo,auth,"https://example.com/red-door/");
    const restored=await createPushService(await createCommunityRepository(null,path.join(dir,"community.json")),auth,"https://example.com/red-door/");
    expect(restored.publicKey).toBe(service.publicKey);
    const send=jest.spyOn(webpush,"sendNotification").mockResolvedValue({statusCode:201,headers:{},body:""});
    await service.notify(created.value.id);expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][1] as string)).toEqual({title:"Red Door",body:"You have a new message.",url:"https://example.com/red-door/#/threads"});
    send.mockRejectedValueOnce({statusCode:410});await service.notify(created.value.id);
    expect(auth.getUser(created.value.id)?.plusData?.pushSubscriptions).toHaveLength(0);send.mockRestore();
  });
  it("requires a public URL and never sends for missing or banned accounts",async()=>{
    const repo=await createCommunityRepository(null,path.join(dir,"unconfigured.json")),auth=createAuthService({jwtSecret:"test-only",userStoreFilePath:path.join(dir,"other.json")});
    const service=await createPushService(repo,auth,"");expect(service.configured).toBe(false);const send=jest.spyOn(webpush,"sendNotification").mockRejectedValue(new Error("Must not be called"));await service.notify("missing");expect(send).not.toHaveBeenCalled();send.mockRestore();
  });
});
