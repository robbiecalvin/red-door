import { mdSignature, validMdSignature, distanceKm, mdHash } from "../backend/src/services/mdBridge";
import { launchGrant, LAUNCH_END_MS, PROVIDER_LAUNCH_CODE, MEMBER_LAUNCH_CODE } from "../shared/plus";
import { scheduleParameters } from "../backend/src/services/renewalEnrollment";
describe("MD bridge authentication and launch billing",()=>{
  const secret="test-only-md-shared-secret-32-bytes-minimum",now=1700000000000,time=String(now/1000),nonce="test-nonce-that-is-unique",body='{"providerId":"one"}';
  it("authenticates the exact method, logical path, timestamp, nonce, and body",()=>{
    const signature=mdSignature(secret,time,nonce,"POST","/integrations/md/link",body);
    expect(validMdSignature(secret,time,nonce,"POST","/integrations/md/link",body,signature,now)).toBe(true);
    for(const [method,path,raw] of [["GET","/integrations/md/link",body],["POST","/integrations/md/live",body],["POST","/integrations/md/link",body+" "]])expect(validMdSignature(secret,time,nonce,method,path,raw,signature,now)).toBe(false);
    expect(validMdSignature(secret,time,nonce,"POST","/integrations/md/link",body,signature,now+301000)).toBe(false);
    expect(validMdSignature("short",time,nonce,"POST","/integrations/md/link",body,signature,now)).toBe(false);
  });
  it("calculates the 50 km discovery radius without exposing coordinates in a label",()=>{
    expect(distanceKm({lat:49.28,lng:-123.12},{lat:49.28,lng:-123.12})).toBe(0);
    expect(distanceKm({lat:49.28,lng:-123.12},{lat:50.28,lng:-123.12})).toBeGreaterThan(100);
    expect(mdHash("ticket")).not.toContain("ticket");
  });
  it.each([PROVIDER_LAUNCH_CODE,MEMBER_LAUNCH_CODE])("grants %s only until the fixed year-end deadline",code=>{
    expect(launchGrant(code.toLowerCase(),LAUNCH_END_MS-1)).toBe(LAUNCH_END_MS);
    expect(()=>launchGrant(code,LAUNCH_END_MS)).toThrow("expired");
  });
  it("schedules the first charge at January 1 and releases to ordinary monthly billing after one phase",()=>{
    const params=scheduleParameters("member","customer","payment-method","price-cad-799");
    expect(Number(params.get("start_date"))*1000).toBe(LAUNCH_END_MS);
    expect(params.get("phases[0][items][0][price]")).toBe("price-cad-799");
    expect(params.get("end_behavior")).toBe("release");
    expect(params.get("phases[0][iterations]")).toBe("1");
    expect(params.get("default_settings[collection_method]")).toBe("charge_automatically");
    expect(params.get("trial_end")).toBeNull();
  });
});
